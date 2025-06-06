// context/DirectMessagesContext.tsx

import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  Timestamp,
  onSnapshot,
  getDoc,
  doc,
  orderBy,
  setDoc,
  serverTimestamp,
  limit,
  startAfter,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import Toast from 'react-native-toast-message';
import { useCrews } from './CrewsContext';
import {
  UserBatchFetcher,
  MessageListenerManager,
  fetchUnreadCount as utilsFetchUnreadCount,
  computeTotalUnread as utilsComputeTotalUnread,
  createMessageListener,
  loadEarlierMessages as utilsLoadEarlierMessages,
  processMessagesBatch,
  MessagePaginationInfo as UtilsMessagePaginationInfo,
  ProcessedMessage,
  DEFAULT_MESSAGES_PER_LOAD,
} from '@/utils/chatContextUtils';

// Use types from utilities directly
type Message = ProcessedMessage;
type MessagePaginationInfo = UtilsMessagePaginationInfo;

// Update DM interface to store only participant UIDs (not full user objects)
interface DirectMessage {
  id: string;
  participants: string[]; // Only the UIDs of the other participant(s)
  lastRead: { [uid: string]: Timestamp | null };
}

// Default number of messages to load initially and for pagination
const MESSAGES_PER_LOAD = DEFAULT_MESSAGES_PER_LOAD;

interface DirectMessagesContextProps {
  dms: DirectMessage[];
  messages: { [dmId: string]: Message[] };
  fetchDirectMessages: () => Promise<void>;
  sendMessage: (dmId: string, text: string, imageUrl?: string) => Promise<void>;
  updateLastRead: (dmId: string) => Promise<void>;
  listenToDirectMessages: () => () => void;
  listenToDMMessages: (dmId: string) => () => void;
  fetchUnreadCount: (dmId: string) => Promise<number>;
  totalUnread: number;
  // Add new pagination methods and state
  loadEarlierMessages: (dmId: string) => Promise<boolean>;
  messagePaginationInfo: { [dmId: string]: MessagePaginationInfo };
}

const DirectMessagesContext = createContext<
  DirectMessagesContextProps | undefined
>(undefined);

export const DirectMessagesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, activeChats } = useUser();
  const { usersCache, setUsersCache } = useCrews();
  const [dms, setDms] = useState<DirectMessage[]>([]);
  const [messages, setMessages] = useState<{ [dmId: string]: Message[] }>({});
  const [totalUnread, setTotalUnread] = useState<number>(0);

  // Add pagination info state
  const [messagePaginationInfo, setMessagePaginationInfo] = useState<{
    [dmId: string]: MessagePaginationInfo;
  }>({});

  // Initialize utilities with proper cleanup
  const userBatchFetcher = useRef<UserBatchFetcher | null>(null);
  const messageListenerManager = useRef<MessageListenerManager | null>(null);

  // Initialize utilities
  useEffect(() => {
    userBatchFetcher.current = new UserBatchFetcher(usersCache, setUsersCache);
    messageListenerManager.current = new MessageListenerManager();

    return () => {
      messageListenerManager.current?.removeAllListeners();
      userBatchFetcher.current?.clearPendingBatches();
    };
  }, [usersCache, setUsersCache]);

  // Fetch unread count for a specific DM using standardized utility
  const fetchUnreadCount = useCallback(
    async (dmId: string): Promise<number> => {
      if (!user?.uid) return 0;
      return utilsFetchUnreadCount(dmId, user.uid, 'direct_messages', {
        fallbackValue: 0,
        includePermissionErrors: false,
      });
    },
    [user?.uid],
  );

  // Compute total unread messages across all DMs using standardized utility
  const computeTotalUnread = useCallback(async () => {
    if (!user?.uid || dms.length === 0) {
      setTotalUnread(0);
      return;
    }
    try {
      const total = await utilsComputeTotalUnread(
        dms,
        user.uid,
        activeChats,
        'direct_messages',
        { fallbackValue: 0 },
      );
      setTotalUnread(total);
    } catch (error) {
      console.error('Error computing total unread messages:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not compute total unread messages',
      });
    }
  }, [user?.uid, dms, activeChats]);

  // Update the lastRead timestamp for a DM
  const updateLastRead = useCallback(
    async (dmId: string) => {
      if (!user?.uid) return;
      try {
        const dmRef = doc(db, 'direct_messages', dmId);
        await setDoc(
          dmRef,
          {
            lastRead: { [user.uid]: serverTimestamp() },
          },
          { merge: true },
        );
      } catch (error) {
        console.warn(`Error updating lastRead for DM ${dmId}:`, error);
      }
    },
    [user?.uid],
  );

  // Optimize the sendMessage function to prevent lag while typing
  const sendMessage = useCallback(
    async (dmId: string, text: string, imageUrl?: string) => {
      if (!user?.uid) return;
      try {
        // Check if the document exists in a separate variable for better readability
        const dmRef = doc(db, 'direct_messages', dmId);
        const dmDoc = await getDoc(dmRef);
        const otherUserUid = dmId.split('_').find((id) => id !== user.uid);

        if (!otherUserUid) {
          console.error('Other user UID not found in DM ID.');
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Invalid DM ID.',
          });
          return;
        }

        // If document doesn't exist, create it first
        if (!dmDoc.exists()) {
          await setDoc(
            dmRef,
            {
              participants: [user.uid, otherUserUid],
              lastRead: {
                [user.uid]: serverTimestamp(),
                [otherUserUid]: Timestamp.fromDate(
                  new Date(Date.now() - 86400000),
                ),
              },
              createdAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
        // Ensure participants field is properly set
        else {
          const dmData = dmDoc.data();
          if (!dmData.participants || !Array.isArray(dmData.participants)) {
            await setDoc(
              dmRef,
              { participants: [user.uid, otherUserUid] },
              { merge: true },
            );
          }
        }

        // Add the new message - separate operation from the document creation/update
        const messagesRef = collection(db, 'direct_messages', dmId, 'messages');
        const newMessage = {
          senderId: user.uid,
          text,
          createdAt: serverTimestamp(),
          ...(imageUrl ? { imageUrl } : {}), // Add image URL if provided
        };
        await addDoc(messagesRef, newMessage);

        // Update last read timestamp
        await updateLastRead(dmId);
      } catch (error) {
        console.error('Error sending message:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not send message.',
        });
      }
    },
    [user?.uid, updateLastRead],
  );

  // Listen for real-time updates in DM messages using standardized listener
  const listenToDMMessages = useCallback(
    (dmId: string) => {
      if (
        !user?.uid ||
        !userBatchFetcher.current ||
        !messageListenerManager.current
      ) {
        return () => {};
      }

      // Check if we already have a listener for this DM
      if (messageListenerManager.current.hasListener(dmId)) {
        return () => messageListenerManager.current?.removeListener(dmId);
      }

      // Create standardized message listener
      const unsubscribe = createMessageListener(
        dmId,
        user.uid,
        'direct_messages',
        userBatchFetcher.current,
        setMessages,
        setMessagePaginationInfo,
        {
          messagesPerLoad: MESSAGES_PER_LOAD,
          enableCaching: true,
          cachePrefix: 'messages',
        },
      );

      messageListenerManager.current.addListener(dmId, unsubscribe);
      return () => messageListenerManager.current?.removeListener(dmId);
    },
    [user?.uid],
  );

  // Load earlier messages using standardized utility
  const loadEarlierMessages = useCallback(
    async (dmId: string): Promise<boolean> => {
      if (!user?.uid || !userBatchFetcher.current) return false;

      const result = await utilsLoadEarlierMessages(
        dmId,
        'direct_messages',
        messagePaginationInfo[dmId],
        setMessagePaginationInfo,
        {
          messagesPerLoad: MESSAGES_PER_LOAD,
          logPrefix: '[DMChat]',
        },
      );

      if (result.success && result.messages.length > 0) {
        // Process the raw documents to get proper messages
        const messagesRef = collection(db, 'direct_messages', dmId, 'messages');
        const olderQuery = query(
          messagesRef,
          orderBy('createdAt', 'desc'),
          startAfter(messagePaginationInfo[dmId]?.lastDoc),
          limit(MESSAGES_PER_LOAD),
        );

        try {
          const querySnapshot = await getDocs(olderQuery);
          const olderMessages = await processMessagesBatch(
            querySnapshot.docs,
            userBatchFetcher.current,
          );

          const reversedOlderMessages = olderMessages.reverse();

          // Update messages state by prepending older messages
          setMessages((prev) => {
            const existingMessages = [...(prev[dmId] || [])];
            const existingMessageIds = new Set(
              existingMessages.map((msg) => msg.id),
            );

            const uniqueOlderMessages = reversedOlderMessages.filter(
              (msg) => !existingMessageIds.has(msg.id),
            );

            const mergedMessages = [
              ...uniqueOlderMessages,
              ...existingMessages,
            ];
            mergedMessages.sort(
              (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
            );

            return { ...prev, [dmId]: mergedMessages };
          });

          return true;
        } catch (error) {
          console.error('Error processing older messages:', error);
          return false;
        }
      }

      return result.success;
    },
    [user?.uid, messagePaginationInfo],
  );

  // Set up message listeners for each DM using the manager
  useEffect(() => {
    if (!user?.uid || !messageListenerManager.current) return;

    // Set up listeners for each DM
    dms.forEach((dm) => {
      listenToDMMessages(dm.id);
    });

    // Cleanup function
    return () => {
      // The MessageListenerManager handles cleanup automatically
      messageListenerManager.current?.removeAllListeners();
    };
  }, [dms, user?.uid, listenToDMMessages]);

  // Listen for real-time updates in DM list.
  // Now, we simply store the other participant's UID in each DM.
  const listenToDirectMessages = useCallback(() => {
    if (!user?.uid) return () => {};
    const dmQuery = query(
      collection(db, 'direct_messages'),
      where('participants', 'array-contains', user.uid),
    );
    const unsubscribe = onSnapshot(
      dmQuery,
      (querySnapshot) => {
        try {
          const fetchedDMs = querySnapshot.docs
            .map((docSnap) => {
              const dmData = docSnap.data();
              const participantIds: string[] = dmData.participants || [];
              // Exclude the current user's UID; what remains are the other participant(s)
              const otherParticipantIds = participantIds.filter(
                (id) => id !== user.uid,
              );
              if (otherParticipantIds.length === 0) return null;
              const lastRead = dmData.lastRead
                ? dmData.lastRead[user.uid]
                : null;
              return {
                id: docSnap.id,
                participants: otherParticipantIds,
                lastRead: { [user.uid]: lastRead },
              } as DirectMessage;
            })
            .filter((dm): dm is DirectMessage => dm !== null);
          setDms(fetchedDMs);
        } catch (error) {
          console.error('Error fetching direct messages:', error);
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Could not fetch direct messages.',
          });
        }
      },
      (error) => {
        if (error.code === 'permission-denied') return;
        console.error('Error listening to direct messages:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not listen to direct messages.',
        });
      },
    );
    return unsubscribe;
  }, [user?.uid]);

  // Fetch direct messages once (if not already listening)
  const fetchDirectMessages = useCallback(async () => {
    if (!user?.uid) {
      console.log('User is not logged in. Clearing DMs.');
      setDms([]);
      setMessages({});
      setTotalUnread(0);
      return;
    }
    try {
      const dmQuery = query(
        collection(db, 'direct_messages'),
        where('participants', 'array-contains', user.uid),
      );
      const querySnapshot = await getDocs(dmQuery);
      const dmPromises = querySnapshot.docs.map(async (docSnap) => {
        const dmData = docSnap.data();
        const participantIds: string[] = dmData.participants || [];
        const otherParticipantIds = participantIds.filter(
          (id) => id !== user.uid,
        );
        if (otherParticipantIds.length === 0) return null;
        const lastRead = dmData.lastRead ? dmData.lastRead[user.uid] : null;
        return {
          id: docSnap.id,
          participants: otherParticipantIds,
          lastRead: { [user.uid]: lastRead },
        } as DirectMessage;
      });
      const fetchedDMs = (await Promise.all(dmPromises)).filter(
        (dm): dm is DirectMessage => dm !== null,
      );
      setDms(fetchedDMs);
    } catch (error) {
      console.error('Error fetching direct messages:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not fetch direct messages.',
      });
    }
  }, [user?.uid]);

  useEffect(() => {
    computeTotalUnread();
  }, [computeTotalUnread]);

  useEffect(() => {
    fetchDirectMessages();
  }, [user?.uid, fetchDirectMessages]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = listenToDirectMessages();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user?.uid, listenToDirectMessages]);

  useEffect(() => {
    return () => {
      // Cleanup is handled by the MessageListenerManager in the initialization effect
      messageListenerManager.current?.removeAllListeners();
    };
  }, []);

  return (
    <DirectMessagesContext.Provider
      value={{
        dms,
        messages,
        fetchDirectMessages,
        sendMessage,
        updateLastRead,
        listenToDirectMessages,
        listenToDMMessages,
        fetchUnreadCount,
        totalUnread,
        // Add the new pagination elements
        loadEarlierMessages,
        messagePaginationInfo,
      }}
    >
      {children}
    </DirectMessagesContext.Provider>
  );
};

export const useDirectMessages = () => {
  const context = useContext(DirectMessagesContext);
  if (!context) {
    throw new Error(
      'useDirectMessages must be used within a DirectMessagesProvider',
    );
  }
  return context;
};
