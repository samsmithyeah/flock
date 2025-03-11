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
  getCountFromServer,
  limit,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot,
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

// Add pagination info interface (same as in CrewDateChatContext)
interface MessagePaginationInfo {
  hasMore: boolean;
  loading: boolean;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
}

// Update DM interface to store only participant UIDs (not full user objects)
interface DirectMessage {
  id: string;
  participants: string[]; // Only the UIDs of the other participant(s)
  lastRead: { [uid: string]: Timestamp | null };
}

// Default number of messages to load initially and for pagination
const MESSAGES_PER_LOAD = 20;

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
  const { usersCache, fetchUserDetails } = useCrews();
  const [dms, setDms] = useState<DirectMessage[]>([]);
  const [messages, setMessages] = useState<{ [dmId: string]: Message[] }>({});
  const [totalUnread, setTotalUnread] = useState<number>(0);

  // Add pagination info state
  const [messagePaginationInfo, setMessagePaginationInfo] = useState<{
    [dmId: string]: MessagePaginationInfo;
  }>({});

  // Ref to keep track of message listeners
  const listenersRef = useRef<{ [dmId: string]: () => void }>({});
  const pendingUserFetches = useRef<{ [uid: string]: Promise<any> }>({});

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
          // lastRead should not be null other than during fetch so return 0
          return 0;
        }
        const messagesRef = collection(db, 'direct_messages', dmId, 'messages');
        const msqQuery = query(messagesRef, where('createdAt', '>', lastRead));
        const countSnapshot = await getCountFromServer(msqQuery);
        return countSnapshot.data().count;
      } catch (error: any) {
        if (error.code === 'unavailable') {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2:
              'Could not fetch unread count. Please check your connection.',
          });
          return 0;
        }
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

  // Optimize the sendMessage function to prevent lag while typing
  const sendMessage = useCallback(
    async (dmId: string, text: string) => {
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

  // Listen for real-time updates in DM messages - updated with pagination
  const listenToDMMessages = useCallback(
    (dmId: string) => {
      if (!user?.uid) return () => {};

      // Check if we already have a listener for this DM
      if (listenersRef.current[dmId]) {
        return () => {
          if (listenersRef.current[dmId]) {
            listenersRef.current[dmId]();
            delete listenersRef.current[dmId];
          }
        };
      }

      console.log(`[DMChat] Setting up message listener for: ${dmId}`);

      // Initialize pagination info if it doesn't exist - outside the callback to avoid dependency
      if (!messagePaginationInfo[dmId]) {
        console.log(`[DMChat] Initializing pagination info for: ${dmId}`);
        // Use a stable initialization approach
        setMessagePaginationInfo((prev) => {
          // Only update if it doesn't already exist
          if (prev[dmId]) {
            return prev;
          }
          return {
            ...prev,
            [dmId]: {
              hasMore: true, // Start with true to show "load earlier" button
              loading: false,
              lastDoc: null,
            },
          };
        });
      }

      const messagesRef = collection(db, 'direct_messages', dmId, 'messages');

      // Modified to use limit and get recent messages in descending order (newest first)
      const msgQuery = query(
        messagesRef,
        orderBy('createdAt', 'desc'), // Latest messages first
        limit(MESSAGES_PER_LOAD),
      );

      // Load cached messages if available
      const cachedMessages = storage.getString(`messages_${dmId}`);
      if (cachedMessages) {
        try {
          const parsedCachedMessages: Message[] = JSON.parse(
            cachedMessages,
            (key, value) =>
              key === 'createdAt' && typeof value === 'string'
                ? new Date(value)
                : value,
          );
          setMessages((prev) => ({ ...prev, [dmId]: parsedCachedMessages }));
        } catch (error) {
          console.error('Error parsing cached messages:', error);
        }
      }

      const unsubscribe = onSnapshot(
        msgQuery,
        async (querySnapshot) => {
          if (!user?.uid) return;
          try {
            console.log(
              `[DMChat] Got ${querySnapshot.docs.length} messages for ${dmId}`,
            );

            // Store the last document for pagination
            const lastVisible =
              querySnapshot.docs.length > 0
                ? querySnapshot.docs[querySnapshot.docs.length - 1]
                : null;

            // Update pagination info with proper hasMore value
            // Check if this is exactly the page size to determine if there are probably more
            const hasMore = querySnapshot.docs.length >= MESSAGES_PER_LOAD;

            // Log key info for debugging
            console.log(
              `[DMChat] Updated pagination info for ${dmId}: hasMore=${hasMore}, docs count=${querySnapshot.docs.length}`,
            );

            // Don't set hasMore=false if we got a full page of messages
            setMessagePaginationInfo((prev) => {
              const existing = prev[dmId];
              if (!existing) {
                return {
                  ...prev,
                  [dmId]: {
                    hasMore,
                    lastDoc: lastVisible,
                    loading: false,
                  },
                };
              }
              return {
                ...prev,
                [dmId]: {
                  ...existing,
                  hasMore,
                  lastDoc: lastVisible,
                  loading: false,
                },
              };
            });

            // Process message data
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
                  // Use the pendingUserFetches cache to prevent duplicate calls.
                  if (!pendingUserFetches.current[senderId]) {
                    console.log(
                      'Fetching user details from directmessagescontext for',
                      senderId,
                    );
                    pendingUserFetches.current[senderId] =
                      fetchUserDetails(senderId);
                  }
                  const fetchedUser =
                    await pendingUserFetches.current[senderId];
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

            // Important: Reverse the messages to get correct chronological order
            // The query results come newest->oldest, but we want oldest->newest for display
            const chronologicalMessages = [...fetchedMessages].reverse();

            // Update messages in state, properly merging with previous messages
            setMessages((prev) => {
              const existingMessages = [...(prev[dmId] || [])];

              // Create a map of existing message IDs for fast lookup
              const existingMessageIds = new Set(
                existingMessages.map((msg) => msg.id),
              );

              // Add new messages, avoiding duplicates
              const newMessages = chronologicalMessages.filter(
                (msg) => !existingMessageIds.has(msg.id),
              );

              // Combine existing and new messages
              const mergedMessages = [...existingMessages, ...newMessages];

              // Sort all messages by date (oldest first for display)
              mergedMessages.sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
              );

              console.log(
                `[DMChat] Total messages for ${dmId}: ${mergedMessages.length}`,
              );
              return { ...prev, [dmId]: mergedMessages };
            });

            // Cache the messages
            const messagesToCache = chronologicalMessages.map((msg) => ({
              ...msg,
              createdAt: msg.createdAt.toISOString(),
            }));

            if (messagesToCache.length > 0) {
              storage.set(`messages_${dmId}`, JSON.stringify(messagesToCache));
            }
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
          if (!user?.uid) return;
          if (error.code === 'permission-denied') return;
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
    // Remove messagePaginationInfo from dependencies to break the loop
    [user?.uid, user?.displayName, usersCache, fetchUserDetails],
  );

  // Fix loadEarlierMessages implementation
  const loadEarlierMessages = useCallback(
    async (dmId: string): Promise<boolean> => {
      // Guard against invalid state
      if (!user?.uid) return false;

      // Get pagination info for this DM
      const paginationInfo = messagePaginationInfo[dmId];

      // Log the current pagination state
      console.log(
        `[DMChat] loadEarlierMessages called for ${dmId}: hasMore=${paginationInfo?.hasMore}, loading=${paginationInfo?.loading}`,
      );

      // If we're already loading or there are no more messages, don't proceed
      if (!paginationInfo?.hasMore || paginationInfo?.loading) {
        console.log(
          "[DMChat] Can't load earlier messages:",
          !paginationInfo?.hasMore ? 'No more messages' : 'Already loading',
        );
        return false;
      }

      // Set loading state
      setMessagePaginationInfo((prev) => ({
        ...prev,
        [dmId]: {
          ...prev[dmId],
          loading: true,
        },
      }));

      try {
        const lastDoc = paginationInfo?.lastDoc;

        // If we don't have a last document reference, we can't load more
        if (!lastDoc) {
          console.log('[DMChat] No lastDoc available for pagination');
          setMessagePaginationInfo((prev) => ({
            ...prev,
            [dmId]: {
              ...prev[dmId],
              loading: false,
              hasMore: false,
            },
          }));
          return false;
        }

        console.log(
          `[DMChat] Fetching earlier messages starting after doc: ${lastDoc.id}`,
        );

        const messagesRef = collection(db, 'direct_messages', dmId, 'messages');

        // Query for older messages (ordered by createdAt desc, so most recent first)
        const olderMessagesQuery = query(
          messagesRef,
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(MESSAGES_PER_LOAD),
        );

        // Execute the query
        const querySnapshot = await getDocs(olderMessagesQuery);
        console.log(
          `[DMChat] Fetched ${querySnapshot.docs.length} older messages`,
        );

        // Get the new last document
        const lastVisible =
          querySnapshot.docs.length > 0
            ? querySnapshot.docs[querySnapshot.docs.length - 1]
            : lastDoc; // Keep the previous lastDoc if no new docs

        // Determine if there are more messages (if we got a full page)
        const hasMore = querySnapshot.docs.length >= MESSAGES_PER_LOAD;

        // Log pagination results
        console.log(
          `[DMChat] Loaded ${querySnapshot.docs.length} earlier messages, hasMore=${hasMore}`,
        );

        // Update pagination info
        setMessagePaginationInfo((prev) => ({
          ...prev,
          [dmId]: {
            hasMore,
            lastDoc: lastVisible,
            loading: false,
          },
        }));

        // If no results, we're done
        if (querySnapshot.empty) {
          console.log('[DMChat] No more messages found');
          return false;
        }

        // Process and add older messages
        const olderMessages: Message[] = await Promise.all(
          querySnapshot.docs.map(async (docSnap) => {
            const msgData = docSnap.data();
            const senderId: string = msgData.senderId;
            let senderName = 'Unknown';

            if (senderId === user.uid) {
              senderName = user.displayName || 'You';
            } else if (usersCache[senderId]) {
              senderName = usersCache[senderId].displayName || 'Unknown';
            } else {
              if (!pendingUserFetches.current[senderId]) {
                pendingUserFetches.current[senderId] =
                  fetchUserDetails(senderId);
              }
              const fetchedUser = await pendingUserFetches.current[senderId];
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

        // Important: Reverse to get chronological ordering (oldest first)
        const reversedOlderMessages = olderMessages.reverse();

        // Update messages state by prepending older messages
        setMessages((prev) => {
          // Start with all existing messages
          const existingMessages = [...(prev[dmId] || [])];
          console.log(
            `[DMChat] Existing messages: ${existingMessages.length}, new messages: ${reversedOlderMessages.length}`,
          );

          // Create a map of existing message IDs for fast lookup
          const existingMessageIds = new Set(
            existingMessages.map((msg) => msg.id),
          );

          // Filter out duplicates
          const uniqueOlderMessages = reversedOlderMessages.filter(
            (msg) => !existingMessageIds.has(msg.id),
          );

          // Prepend older messages (they should go at beginning since they're older)
          const mergedMessages = [...uniqueOlderMessages, ...existingMessages];

          // Sort all messages by date (oldest first)
          mergedMessages.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          );

          console.log(
            `[DMChat] Total messages after merge: ${mergedMessages.length}`,
          );
          return { ...prev, [dmId]: mergedMessages };
        });

        return querySnapshot.docs.length > 0;
      } catch (error) {
        console.error('Error loading earlier messages:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not load earlier messages.',
        });

        // Reset loading state on error
        setMessagePaginationInfo((prev) => ({
          ...prev,
          [dmId]: {
            ...prev[dmId],
            loading: false,
          },
        }));

        return false;
      }
    },
    [
      user?.uid,
      user?.displayName,
      messagePaginationInfo,
      fetchUserDetails,
      usersCache,
    ],
  );

  // Fix the effect that sets up message listeners for each DM
  useEffect(() => {
    // Only run this effect if user is logged in
    if (!user?.uid) return;

    // Store current DM IDs to know what to clean up
    const currentDmIds = new Set(dms.map((dm) => dm.id));

    // Set up listeners for each DM
    dms.forEach((dm) => {
      listenToDMMessages(dm.id);
    });

    // Clean up function
    return () => {
      // Clean up listeners when this effect changes or unmounts
      Object.entries(listenersRef.current).forEach(([dmId, unsubscribe]) => {
        if (!currentDmIds.has(dmId)) {
          // Only clean up listeners for DMs that are no longer in the list
          unsubscribe();
          delete listenersRef.current[dmId];
          console.log(`[DMChat] Cleaned up listener for ${dmId}`);
        }
      });
    };
  }, [dms, user?.uid, listenToDMMessages]); // Include user?.uid in dependencies

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
      Object.values(listenersRef.current).forEach((unsubscribe) =>
        unsubscribe(),
      );
      listenersRef.current = {};
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
