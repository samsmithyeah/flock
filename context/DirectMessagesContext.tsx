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
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import Toast from 'react-native-toast-message';
import { useCrews } from './CrewsContext';
import { storage } from '@/storage';

// Message remains unchanged
interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: Date;
  senderName?: string;
}

// Update DM interface to store only participant UIDs (not full user objects)
interface DirectMessage {
  id: string;
  participants: string[]; // Only the UIDs of the other participant(s)
  lastRead: { [uid: string]: Timestamp | null };
}

interface DirectMessagesContextProps {
  dms: DirectMessage[];
  messages: { [dmId: string]: Message[] };
  fetchDirectMessages: () => Promise<void>;
  sendMessage: (dmId: string, text: string) => Promise<void>;
  updateLastRead: (dmId: string) => Promise<void>;
  listenToDirectMessages: () => () => void;
  listenToDMMessages: (dmId: string) => () => void;
  fetchUnreadCount: (dmId: string) => Promise<number>;
  totalUnread: number;
}

const DirectMessagesContext = createContext<
  DirectMessagesContextProps | undefined
>(undefined);

export const DirectMessagesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, activeChats } = useUser();
  const { usersCache, fetchUserDetails } = useCrews();
  const [dms, setDms] = useState<DirectMessage[]>([]);
  const [messages, setMessages] = useState<{ [dmId: string]: Message[] }>({});
  const [totalUnread, setTotalUnread] = useState<number>(0);

  // Ref to keep track of message listeners
  const listenersRef = useRef<{ [dmId: string]: () => void }>({});

  // Fetch unread count for a specific DM
  const fetchUnreadCount = useCallback(
    async (dmId: string): Promise<number> => {
      if (!user?.uid) return 0;
      try {
        const dmRef = doc(db, 'direct_messages', dmId);
        const dmDoc = await getDoc(dmRef);
        if (!dmDoc.exists()) {
          console.warn(`DM document ${dmId} does not exist.`);
          return 0;
        }
        const dmData = dmDoc.data();
        if (!dmData) return 0;
        const lastRead = dmData.lastRead ? dmData.lastRead[user.uid] : null;
        if (!lastRead) {
          const messagesRef = collection(
            db,
            'direct_messages',
            dmId,
            'messages',
          );
          const allMessages = await getDocs(messagesRef);
          return allMessages.size;
        }
        const messagesRef = collection(db, 'direct_messages', dmId, 'messages');
        const msqQuery = query(messagesRef, where('createdAt', '>', lastRead));
        const querySnapshot = await getDocs(msqQuery);
        return querySnapshot.size;
      } catch (error) {
        console.error('Error fetching unread count:', error);
        return 0;
      }
    },
    [user?.uid],
  );

  // Compute total unread messages across all DMs (excluding active chats)
  const computeTotalUnread = useCallback(async () => {
    if (!user?.uid || dms.length === 0) {
      setTotalUnread(0);
      return;
    }
    try {
      const unreadPromises = dms
        .filter((dm) => !activeChats.has(dm.id))
        .map((dm) => fetchUnreadCount(dm.id));
      const unreadCounts = await Promise.all(unreadPromises);
      const total = unreadCounts.reduce((acc, count) => acc + count, 0);
      setTotalUnread(total);
    } catch (error) {
      console.error('Error computing total unread messages:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not compute total unread messages',
      });
    }
  }, [user?.uid, dms, fetchUnreadCount, activeChats]);

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

  // Send a message in a DM
  const sendMessage = useCallback(
    async (dmId: string, text: string) => {
      if (!user?.uid) return;
      try {
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
        } else {
          const dmData = dmDoc.data();
          if (!dmData.participants || !Array.isArray(dmData.participants)) {
            await setDoc(
              dmRef,
              { participants: [user.uid, otherUserUid] },
              { merge: true },
            );
          }
        }
        const messagesRef = collection(db, 'direct_messages', dmId, 'messages');
        const newMessage = {
          senderId: user.uid,
          text,
          createdAt: serverTimestamp(),
        };
        await addDoc(messagesRef, newMessage);
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

  // Listen for real-time updates in DM messages
  const listenToDMMessages = useCallback(
    (dmId: string) => {
      if (!user?.uid) return () => {};
      const messagesRef = collection(db, 'direct_messages', dmId, 'messages');
      const msgQuery = query(messagesRef, orderBy('createdAt', 'asc'));

      // Load cached messages if available
      const cachedMessages = storage.getString(`messages_${dmId}`);
      if (cachedMessages) {
        const parsedCachedMessages: Message[] = JSON.parse(
          cachedMessages,
          (key, value) =>
            key === 'createdAt' && typeof value === 'string'
              ? new Date(value)
              : value,
        );
        setMessages((prev) => ({ ...prev, [dmId]: parsedCachedMessages }));
      }

      const unsubscribe = onSnapshot(
        msgQuery,
        async (querySnapshot) => {
          if (!user?.uid) return () => {};
          try {
            const fetchedMessages: Message[] = await Promise.all(
              querySnapshot.docs.map(async (docSnap) => {
                const msgData = docSnap.data();
                const senderId: string = msgData.senderId;
                let senderName = 'Unknown';
                if (senderId === user.uid) {
                  senderName = user.displayName || 'You';
                } else if (usersCache[senderId]) {
                  senderName = usersCache[senderId].displayName || 'Unknown';
                } else {
                  const fetchedUser = await fetchUserDetails(senderId);
                  senderName = fetchedUser.displayName || 'Unknown';
                }
                return {
                  id: docSnap.id,
                  senderId,
                  text: msgData.text,
                  createdAt: msgData.createdAt
                    ? msgData.createdAt.toDate()
                    : new Date(),
                  senderName,
                };
              }),
            );
            setMessages((prev) => ({ ...prev, [dmId]: fetchedMessages }));
            const messagesToCache = fetchedMessages.map((msg) => ({
              ...msg,
              createdAt: msg.createdAt.toISOString(),
            }));
            storage.set(`messages_${dmId}`, JSON.stringify(messagesToCache));
          } catch (error) {
            console.error('Error processing messages snapshot:', error);
            Toast.show({
              type: 'error',
              text1: 'Error',
              text2: 'Could not process messages updates.',
            });
          }
        },
        (error) => {
          console.warn('Error listening to DM messages:', error);
        },
      );
      listenersRef.current[dmId] = unsubscribe;
      return () => {
        if (listenersRef.current[dmId]) {
          listenersRef.current[dmId]();
          delete listenersRef.current[dmId];
        }
      };
    },
    [user?.uid, user?.displayName, usersCache, fetchUserDetails],
  );

  // Listen for real-time updates in DM list.
  // Now, we simply store the other participant’s UID in each DM.
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
      Object.values(listenersRef.current).forEach((unsubscribe) =>
        unsubscribe(),
      );
      listenersRef.current = {};
    };
  }, []);

  // Set up message listeners for each DM
  useEffect(() => {
    dms.forEach((dm) => {
      listenToDMMessages(dm.id);
    });
    return () => {
      Object.values(listenersRef.current).forEach((unsubscribe) =>
        unsubscribe(),
      );
      listenersRef.current = {};
    };
  }, [dms, listenToDMMessages]);

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
