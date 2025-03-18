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
import { FirebaseError } from 'firebase/app';

// Define Message type
interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: Date;
  senderName?: string;
}

// Add pagination info interface
interface MessagePaginationInfo {
  hasMore: boolean;
  loading: boolean;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
}

// Define the CrewChat type
interface CrewChat {
  id: string; // This is the crewId
  name: string;
  iconUrl?: string;
  lastRead: { [uid: string]: Timestamp | null };
}

// Default number of messages to load
const MESSAGES_PER_LOAD = 20;

// Define context properties
interface CrewChatContextProps {
  crewChats: CrewChat[];
  messages: { [crewId: string]: Message[] };
  fetchCrewChats: () => Promise<void>;
  sendMessage: (crewId: string, text: string) => Promise<void>;
  updateLastRead: (crewId: string) => Promise<void>;
  listenToCrewChats: () => () => void;
  listenToMessages: (crewId: string) => () => void;
  fetchUnreadCount: (crewId: string) => Promise<number>;
  totalUnread: number;
  loadEarlierMessages: (crewId: string) => Promise<boolean>;
  messagePaginationInfo: { [crewId: string]: MessagePaginationInfo };
}

const CrewChatContext = createContext<CrewChatContextProps | undefined>(
  undefined,
);

export const CrewChatProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, activeChats } = useUser();
  const { crews, usersCache, fetchUserDetails } = useCrews();
  const [crewChats, setCrewChats] = useState<CrewChat[]>([]);
  const [messages, setMessages] = useState<{ [crewId: string]: Message[] }>({});
  const [totalUnread, setTotalUnread] = useState<number>(0);

  // Add pagination info state
  const [messagePaginationInfo, setMessagePaginationInfo] = useState<{
    [crewId: string]: MessagePaginationInfo;
  }>({});

  // Ref to keep track of message listeners
  const listenersRef = useRef<{ [crewId: string]: () => void }>({});
  const pendingUserFetches = useRef<{ [uid: string]: Promise<any> }>({});

  // Fetch unread count for a specific crew chat
  const fetchUnreadCount = useCallback(
    async (crewId: string): Promise<number> => {
      if (!user?.uid) return 0;
      try {
        const chatRef = doc(db, 'crew_chats', crewId);
        const chatDoc = await getDoc(chatRef);
        if (!chatDoc.exists()) {
          return 0;
        }
        const chatData = chatDoc.data();
        if (!chatData) return 0;
        const lastRead = chatData.lastRead ? chatData.lastRead[user.uid] : null;
        if (!lastRead) {
          return 0;
        }
        const messagesRef = collection(db, 'crew_chats', crewId, 'messages');
        const msgQuery = query(messagesRef, where('createdAt', '>', lastRead));
        const countSnapshot = await getCountFromServer(msgQuery);
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

  // Compute total unread messages
  const computeTotalUnread = useCallback(async () => {
    if (!user?.uid || crewChats.length === 0) {
      setTotalUnread(0);
      return;
    }
    try {
      const unreadPromises = crewChats
        .filter((chat) => !activeChats.has(chat.id))
        .map((chat) => fetchUnreadCount(chat.id));
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
  }, [user?.uid, crewChats, fetchUnreadCount, activeChats]);

  // Update lastRead timestamp for a crew chat
  const updateLastRead = useCallback(
    async (crewId: string) => {
      if (!user?.uid) return;
      try {
        const chatRef = doc(db, 'crew_chats', crewId);
        await setDoc(
          chatRef,
          {
            lastRead: { [user.uid]: serverTimestamp() },
          },
          { merge: true },
        );
      } catch (error) {
        console.warn(`Error updating lastRead for crew chat ${crewId}:`, error);
      }
    },
    [user?.uid],
  );

  // Send message in crew chat
  const sendMessage = useCallback(
    async (crewId: string, text: string) => {
      if (!user?.uid) return;
      try {
        // Get crew data
        const crewRef = doc(db, 'crews', crewId);
        const crewDoc = await getDoc(crewRef);

        if (!crewDoc.exists()) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Crew not found',
          });
          return;
        }

        const crewData = crewDoc.data();

        // Check if crew chat document exists
        const chatRef = doc(db, 'crew_chats', crewId);
        const chatDoc = await getDoc(chatRef);

        // If document doesn't exist, create it
        if (!chatDoc.exists()) {
          await setDoc(chatRef, {
            name: crewData.name,
            iconUrl: crewData.iconUrl,
            lastRead: {
              [user.uid]: serverTimestamp(),
            },
            createdAt: serverTimestamp(),
          });
        }

        // Add message
        const messagesRef = collection(db, 'crew_chats', crewId, 'messages');
        const newMessage = {
          senderId: user.uid,
          text,
          createdAt: serverTimestamp(),
        };
        await addDoc(messagesRef, newMessage);

        // Update last read
        await updateLastRead(crewId);
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

  // Listen to messages in crew chat with pagination
  const listenToMessages = useCallback(
    (crewId: string) => {
      if (!user?.uid) return () => {};

      // Check if we already have a listener
      if (listenersRef.current[crewId]) {
        return () => {
          if (listenersRef.current[crewId]) {
            listenersRef.current[crewId]();
            delete listenersRef.current[crewId];
          }
        };
      }

      // Initialize pagination info if it doesn't exist
      if (!messagePaginationInfo[crewId]) {
        setMessagePaginationInfo((prev) => {
          if (prev[crewId]) return prev;
          return {
            ...prev,
            [crewId]: {
              hasMore: true,
              loading: false,
              lastDoc: null,
            },
          };
        });
      }

      const messagesRef = collection(db, 'crew_chats', crewId, 'messages');

      // Query for recent messages
      const msgQuery = query(
        messagesRef,
        orderBy('createdAt', 'desc'),
        limit(MESSAGES_PER_LOAD),
      );

      // Load cached messages if available
      const cachedMessages = storage.getString(`crew_messages_${crewId}`);
      if (cachedMessages) {
        try {
          const parsedCachedMessages: Message[] = JSON.parse(
            cachedMessages,
            (key, value) =>
              key === 'createdAt' && typeof value === 'string'
                ? new Date(value)
                : value,
          );
          setMessages((prev) => ({ ...prev, [crewId]: parsedCachedMessages }));
        } catch (error) {
          console.error('Error parsing cached messages:', error);
        }
      }

      const unsubscribe = onSnapshot(
        msgQuery,
        async (querySnapshot) => {
          if (!user?.uid) return;
          try {
            // Store last document for pagination
            const lastVisible =
              querySnapshot.docs.length > 0
                ? querySnapshot.docs[querySnapshot.docs.length - 1]
                : null;

            // Update pagination info
            const hasMore = querySnapshot.docs.length >= MESSAGES_PER_LOAD;
            setMessagePaginationInfo((prev) => {
              const existing = prev[crewId];
              if (!existing) {
                return {
                  ...prev,
                  [crewId]: {
                    hasMore,
                    lastDoc: lastVisible,
                    loading: false,
                  },
                };
              }
              return {
                ...prev,
                [crewId]: {
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
                  if (!pendingUserFetches.current[senderId]) {
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

            // Reverse for chronological order
            const chronologicalMessages = [...fetchedMessages].reverse();

            // Update messages in state
            setMessages((prev) => {
              const existingMessages = [...(prev[crewId] || [])];

              // Create set of existing IDs for fast lookup
              const existingMessageIds = new Set(
                existingMessages.map((msg) => msg.id),
              );

              // Add new messages, avoiding duplicates
              const newMessages = chronologicalMessages.filter(
                (msg) => !existingMessageIds.has(msg.id),
              );

              // Combine and sort
              const mergedMessages = [...existingMessages, ...newMessages];
              mergedMessages.sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
              );

              return { ...prev, [crewId]: mergedMessages };
            });

            // Cache messages
            const messagesToCache = chronologicalMessages.map((msg) => ({
              ...msg,
              createdAt: msg.createdAt.toISOString(),
            }));

            if (messagesToCache.length > 0) {
              storage.set(
                `crew_messages_${crewId}`,
                JSON.stringify(messagesToCache),
              );
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
        (error: unknown) => {
          if (!user?.uid) return;
          if (
            error instanceof FirebaseError &&
            error.code === 'permission-denied'
          )
            return;
          console.warn('Error listening to crew chat messages:', error);
        },
      );

      listenersRef.current[crewId] = unsubscribe;
      return () => {
        if (listenersRef.current[crewId]) {
          listenersRef.current[crewId]();
          delete listenersRef.current[crewId];
        }
      };
    },
    [user?.uid, user?.displayName, usersCache, fetchUserDetails],
  );

  // Load earlier messages for pagination
  const loadEarlierMessages = useCallback(
    async (crewId: string): Promise<boolean> => {
      // Guard against invalid state
      if (!user?.uid) return false;

      // Get pagination info
      const paginationInfo = messagePaginationInfo[crewId];

      // Check if we can load more
      if (!paginationInfo?.hasMore || paginationInfo?.loading) {
        return false;
      }

      // Set loading state
      setMessagePaginationInfo((prev) => ({
        ...prev,
        [crewId]: {
          ...prev[crewId],
          loading: true,
        },
      }));

      try {
        const lastDoc = paginationInfo?.lastDoc;

        // If no last document reference, can't load more
        if (!lastDoc) {
          setMessagePaginationInfo((prev) => ({
            ...prev,
            [crewId]: {
              ...prev[crewId],
              loading: false,
              hasMore: false,
            },
          }));
          return false;
        }

        const messagesRef = collection(db, 'crew_chats', crewId, 'messages');

        // Query for older messages
        const olderMessagesQuery = query(
          messagesRef,
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(MESSAGES_PER_LOAD),
        );

        // Execute query
        const querySnapshot = await getDocs(olderMessagesQuery);

        // Get new last document
        const lastVisible =
          querySnapshot.docs.length > 0
            ? querySnapshot.docs[querySnapshot.docs.length - 1]
            : lastDoc;

        // Determine if there are more messages
        const hasMore = querySnapshot.docs.length >= MESSAGES_PER_LOAD;

        // Update pagination info
        setMessagePaginationInfo((prev) => ({
          ...prev,
          [crewId]: {
            hasMore,
            lastDoc: lastVisible,
            loading: false,
          },
        }));

        // If no results, return
        if (querySnapshot.empty) {
          return false;
        }

        // Process older messages
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

        // Reverse for chronological order
        const reversedOlderMessages = olderMessages.reverse();

        // Update messages state by prepending older messages
        setMessages((prev) => {
          const existingMessages = [...(prev[crewId] || [])];

          // Check for duplicates
          const existingMessageIds = new Set(
            existingMessages.map((msg) => msg.id),
          );

          // Filter out duplicates
          const uniqueOlderMessages = reversedOlderMessages.filter(
            (msg) => !existingMessageIds.has(msg.id),
          );

          // Prepend older messages
          const mergedMessages = [...uniqueOlderMessages, ...existingMessages];

          // Sort all messages
          mergedMessages.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          );

          return { ...prev, [crewId]: mergedMessages };
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
          [crewId]: {
            ...prev[crewId],
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

  // Fetch crew chats
  const fetchCrewChats = useCallback(async () => {
    if (!user?.uid) {
      setCrewChats([]);
      setMessages({});
      setTotalUnread(0);
      return;
    }

    try {
      // Get user's crews directly from the crews collection
      const crewsRef = collection(db, 'crews');
      const crewsQuery = query(
        crewsRef,
        where('memberIds', 'array-contains', user.uid),
      );
      const crewsSnapshot = await getDocs(crewsQuery);

      // Extract crew IDs directly from the query results
      const crewIds = crewsSnapshot.docs.map((doc) => doc.id);

      if (crewIds.length === 0) {
        setCrewChats([]);
        return;
      }

      // Fetch crew chat data for all user's crews
      const crewChatsPromises = crewIds.map(async (crewId) => {
        // Find crew in crews context
        const crew = crews.find((c) => c.id === crewId);
        let name = 'Unknown Crew';
        let iconUrl = null; // Initialize to null rather than undefined

        if (crew) {
          name = crew.name;
          iconUrl = crew.iconUrl || null; // Ensure it's null if undefined
        } else {
          // Fetch crew data if not in context
          try {
            const crewDoc = await getDoc(doc(db, 'crews', crewId));
            if (crewDoc.exists()) {
              const crewData = crewDoc.data();
              name = crewData.name;
              iconUrl = crewData.iconUrl || null; // Ensure it's null if undefined
            }
          } catch (error) {
            console.error(`Error fetching crew ${crewId}:`, error);
          }
        }

        // Check if crew chat exists
        const chatRef = doc(db, 'crew_chats', crewId);
        const chatSnap = await getDoc(chatRef);

        let lastRead = {};

        if (chatSnap.exists()) {
          const chatData = chatSnap.data();
          lastRead = chatData.lastRead || {};
        } else {
          // Initialize chat document if it doesn't exist
          await setDoc(chatRef, {
            name,
            iconUrl, // Now guaranteed to be either a string or null
            lastRead: {
              [user.uid]: serverTimestamp(),
            },
            createdAt: serverTimestamp(),
          });
          lastRead = { [user.uid]: null };
        }

        return {
          id: crewId,
          name,
          iconUrl,
          lastRead,
        } as CrewChat;
      });

      const fetchedCrewChats = await Promise.all(crewChatsPromises);
      setCrewChats(fetchedCrewChats);
    } catch (error) {
      console.error('Error fetching crew chats:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not fetch crew chats.',
      });
    }
  }, [user?.uid, crews]);

  // Listen to crew chats
  const listenToCrewChats = useCallback(() => {
    if (!user?.uid) return () => {};

    // For each crew the user is in, listen to the crew chat document
    const listeners: (() => void)[] = [];

    // First, get the user's crews directly from the crews collection
    const crewsQuery = query(
      collection(db, 'crews'),
      where('memberIds', 'array-contains', user.uid),
    );

    const unsubscribeUserCrews = onSnapshot(
      crewsQuery,
      async (querySnapshot) => {
        try {
          // Clean up existing chat listeners
          listeners.forEach((unsub) => unsub());
          listeners.length = 0;

          // Extract crew IDs directly from the query results
          const crewIds = querySnapshot.docs.map((doc) => doc.id);

          if (crewIds.length === 0) {
            setCrewChats([]);
            return;
          }

          // Set up listeners for each crew chat
          const chatPromises = crewIds.map((crewId) => {
            return new Promise<CrewChat>((resolve) => {
              const chatRef = doc(db, 'crew_chats', crewId);

              const unsubscribeChat = onSnapshot(
                chatRef,
                async (chatSnap) => {
                  try {
                    let chatData;
                    let lastRead = {};

                    if (chatSnap.exists()) {
                      chatData = chatSnap.data();
                      lastRead = chatData.lastRead || {};
                    } else {
                      // Find crew details
                      const crew = crews.find((c) => c.id === crewId);
                      let name = 'Unknown Crew';
                      let iconUrl = null; // Initialize to null rather than undefined

                      if (crew) {
                        name = crew.name;
                        iconUrl = crew.iconUrl || null; // Ensure it's null if undefined
                      } else {
                        // Try to fetch crew details
                        try {
                          const crewDoc = await getDoc(
                            doc(db, 'crews', crewId),
                          );
                          if (crewDoc.exists()) {
                            const crewData = crewDoc.data();
                            name = crewData.name;
                            iconUrl = crewData.iconUrl || null; // Ensure it's null if undefined
                          }
                        } catch (error) {
                          console.error(
                            `Error fetching crew ${crewId}:`,
                            error,
                          );
                        }
                      }

                      // Create chat document
                      await setDoc(chatRef, {
                        name,
                        iconUrl, // Now guaranteed to be either a string or null
                        lastRead: {
                          [user.uid]: serverTimestamp(),
                        },
                        createdAt: serverTimestamp(),
                      });

                      lastRead = { [user.uid]: null };
                      chatData = { name, iconUrl };
                    }

                    resolve({
                      id: crewId,
                      name: chatData.name || 'Unknown Crew',
                      iconUrl: chatData.iconUrl,
                      lastRead,
                    });
                  } catch (error) {
                    console.error(
                      `Error processing crew chat ${crewId}:`,
                      error,
                    );
                    resolve({
                      id: crewId,
                      name: 'Unknown Crew',
                      lastRead: {},
                    });
                  }
                },
                (error) => {
                  if (error.code === 'permission-denied') {
                    resolve({
                      id: crewId,
                      name: 'Unknown Crew',
                      lastRead: {},
                    });
                    return;
                  }
                  console.error(
                    `Error listening to crew chat ${crewId}:`,
                    error,
                  );
                  resolve({
                    id: crewId,
                    name: 'Unknown Crew',
                    lastRead: {},
                  });
                },
              );

              listeners.push(unsubscribeChat);
            });
          });

          const crewChatsData = await Promise.all(chatPromises);
          setCrewChats(crewChatsData);
        } catch (error) {
          if (!user?.uid) return;
          if (
            error instanceof FirebaseError &&
            error.code === 'permission-denied'
          )
            return;
          console.error('Error processing user crews:', error);
        }
      },
      (error: unknown) => {
        if (
          error instanceof FirebaseError &&
          error.code === 'permission-denied'
        )
          return;
        console.error('Error listening to user crews:', error);
      },
    );

    listeners.push(unsubscribeUserCrews);

    return () => {
      listeners.forEach((unsub) => unsub());
    };
  }, [user?.uid, crews]);

  // Set up effect to fetch crew chats on mount
  useEffect(() => {
    fetchCrewChats();
  }, [user?.uid, fetchCrewChats]);

  // Set up effect to listen to crew chats
  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = listenToCrewChats();
    return () => {
      unsubscribe();
    };
  }, [user?.uid, listenToCrewChats]);

  // Compute total unread count
  useEffect(() => {
    computeTotalUnread();
  }, [computeTotalUnread]);

  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      Object.values(listenersRef.current).forEach((unsubscribe) =>
        unsubscribe(),
      );
      listenersRef.current = {};
    };
  }, []);

  return (
    <CrewChatContext.Provider
      value={{
        crewChats,
        messages,
        fetchCrewChats,
        sendMessage,
        updateLastRead,
        listenToCrewChats,
        listenToMessages,
        fetchUnreadCount,
        totalUnread,
        loadEarlierMessages,
        messagePaginationInfo,
      }}
    >
      {children}
    </CrewChatContext.Provider>
  );
};

export const useCrewChat = () => {
  const context = useContext(CrewChatContext);
  if (!context) {
    throw new Error('useCrewChat must be used within a CrewChatProvider');
  }
  return context;
};
