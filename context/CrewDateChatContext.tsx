// context/CrewDateChatContext.tsx

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
  updateDoc,
  setDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { User } from '@/types/User';
import { useCrews } from '@/context/CrewsContext';
import Toast from 'react-native-toast-message';
import { storage } from '@/storage'; // MMKV storage instance
import { debounce } from 'lodash';

// Define the Message interface with createdAt as Date
interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: Date; // Ensure it's Date
  senderName?: string;
}

// Extend the CrewDateChat interface to include member details, crewName, and lastRead
interface CrewDateChat {
  id: string; // e.g., 'crew123_2024-04-27'
  crewId: string; // Extracted crewId
  otherMembers: User[];
  crewName: string; // Fetched from crews collection
  avatarUrl?: string; // Optional: Include avatar URL
  lastRead: { [uid: string]: Timestamp | null };
}

// Define the context properties
interface CrewDateChatContextProps {
  chats: CrewDateChat[];
  messages: { [chatId: string]: Message[] };
  fetchChats: () => Promise<void>;
  sendMessage: (chatId: string, text: string) => Promise<void>;
  updateLastRead: (chatId: string) => Promise<void>;
  listenToChats: () => () => void;
  listenToMessages: (chatId: string) => () => void;
  addMemberToChat: (chatId: string, uid: string) => Promise<void>;
  removeMemberFromChat: (chatId: string, uid: string) => Promise<void>;
  fetchUnreadCount: (chatId: string) => Promise<number>;
  totalUnread: number;
  getChatParticipantsCount: (chatId: string) => number;
}

// Create the context
const CrewDateChatContext = createContext<CrewDateChatContextProps | undefined>(
  undefined,
);

// Provider component
export const CrewDateChatProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, activeChats } = useUser(); // Access activeChats from UserContext
  const { crews, usersCache, setUsersCache } = useCrews();
  const [chats, setChats] = useState<CrewDateChat[]>([]);
  const [messages, setMessages] = useState<{ [chatId: string]: Message[] }>({});
  const [totalUnread, setTotalUnread] = useState<number>(0);
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second

  // Ref to keep track of message listeners
  const listenersRef = useRef<{ [chatId: string]: () => void }>({});

  const debouncedFirestoreFetch = useCallback(
    debounce(async (uid: string): Promise<User> => {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const fetchedUser: User = {
          uid: userDoc.id,
          displayName: userData.displayName || 'Unnamed User',
          email: userData.email || '',
          photoURL: userData.photoURL,
        };
        return fetchedUser;
      }
      throw new Error(`User ${uid} not found`);
    }, 500),
    [],
  );

  // Add debug helper
  const logWithTrace = (message: string) => {
    console.debug(
      `[CrewDateChat] ${message}`,
      new Error().stack?.split('\n')[2],
    ); // Show caller
  };

  // Batch multiple requests
  const fetchUserDetailsBatch = useCallback(
    async (uids: string[]): Promise<Map<string, User>> => {
      const results = new Map<string, User>();
      const toFetch = new Set<string>();

      // Check cache first
      uids.forEach((uid) => {
        if (usersCache[uid]) {
          results.set(uid, usersCache[uid]);
        } else {
          toFetch.add(uid);
        }
      });

      if (toFetch.size === 0) return results;

      // Batch fetch from Firestore
      try {
        const batch = await Promise.all(
          Array.from(toFetch).map((uid) => debouncedFirestoreFetch(uid)),
        );

        batch.forEach((user, i) => {
          console.log('Batch fetch result:', user);
          const uid = Array.from(toFetch)[i];
          if (user) {
            results.set(uid, user);
            // Update cache
            setUsersCache((prev) => ({ ...prev, [uid]: user }));
          }
        });
      } catch (error) {
        logWithTrace(`Batch fetch failed: ${error}`);
      }

      return results;
    },
    [usersCache, debouncedFirestoreFetch],
  );

  // Update fetchUserDetails to use batch
  const fetchUserDetails = useCallback(
    async (uid: string): Promise<User> => {
      if (usersCache[uid]) {
        return usersCache[uid];
      }

      const results = await fetchUserDetailsBatch([uid]);
      const user = results.get(uid);

      if (!user) {
        throw new Error(`User ${uid} not found`);
      }

      return user;
    },
    [usersCache, fetchUserDetailsBatch],
  );

  const fetchUserDetailsWithRetry = async (
    uid: string,
    retries = 0,
  ): Promise<User> => {
    try {
      const user = await fetchUserDetails(uid);
      if (!user) throw new Error(`User ${uid} not found`);
      return user;
    } catch (error) {
      if (retries < MAX_RETRIES) {
        console.log(`Retrying fetch for user ${uid}, attempt ${retries + 1}`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return fetchUserDetailsWithRetry(uid, retries + 1);
      }

      console.warn(`Failed to fetch user ${uid} after ${MAX_RETRIES} retries`);
      // Return placeholder user to prevent chat breaking
      return {
        uid,
        displayName: 'Unknown User',
        photoURL: undefined,
        email: '',
        // Add other required User properties with defaults
      };
    }
  };

  // Fetch unread count for a specific chat
  const fetchUnreadCount = useCallback(
    async (chatId: string): Promise<number> => {
      if (!user?.uid) return 0;

      try {
        const chatRef = doc(db, 'crew_date_chats', chatId);
        const chatDoc = await getDoc(chatRef);

        if (!chatDoc.exists()) {
          console.warn(`Chat document ${chatId} does not exist.`);
          return 0;
        }

        const chatData = chatDoc.data();
        if (!chatData) return 0;

        const lastRead = chatData.lastRead ? chatData.lastRead[user.uid] : null;

        const messagesRef = collection(
          db,
          'crew_date_chats',
          chatId,
          'messages',
        );

        let msgQuery;
        if (lastRead) {
          // Fetch messages created after lastRead
          msgQuery = query(messagesRef, where('createdAt', '>', lastRead));
        } else {
          // If lastRead is null, all messages are unread
          console.log('lastRead is null. Fetching all messages.');
          msgQuery = query(messagesRef);
        }

        const querySnapshot = await getDocs(msgQuery);

        return querySnapshot.size;
      } catch (error) {
        console.error(`Error fetching unread count for chat ${chatId}:`, error);
        return 0;
      }
    },
    [user?.uid],
  );

  // Function to compute total unread messages
  const computeTotalUnread = useCallback(async () => {
    if (!user?.uid || chats.length === 0) {
      setTotalUnread(0);
      return;
    }

    try {
      const unreadPromises = chats
        .filter((chat) => !activeChats.has(chat.id)) // Exclude active chats
        .map((chat) => fetchUnreadCount(chat.id));
      const unreadCounts = await Promise.all(unreadPromises);
      const total = unreadCounts.reduce((acc, count) => acc + count, 0);
      setTotalUnread(total);
    } catch (error) {
      console.error('Error computing total unread messages:', error);
      // Optionally handle the error, e.g., show a notification
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not compute total unread messages',
      });
    }
  }, [user?.uid, chats, fetchUnreadCount, activeChats]);

  // Fetch chats
  const fetchChats = useCallback(async () => {
    if (!user?.uid) {
      console.log('User is signed out. Clearing crew date chats.');
      setChats([]);
      setMessages({});
      setTotalUnread(0);
      return;
    }

    try {
      const chatQuery = query(
        collection(db, 'crew_date_chats'),
        where('memberIds', 'array-contains', user.uid),
        where('hasMessages', '==', true),
      );

      const querySnapshot = await getDocs(chatQuery);

      // Map each document snapshot to a promise that resolves to a CrewDateChat object
      const chatPromises = querySnapshot.docs.map(async (docSnap) => {
        const chatData = docSnap.data();

        const memberIds: string[] = chatData.memberIds || [];

        // Exclude the current user's UID to get other members
        const otherMemberIds = memberIds.filter((id) => id !== user.uid);

        // Fetch details for other members in parallel
        console.log('Fetching user details from fetchChats');
        const otherMembers: User[] = await Promise.all(
          otherMemberIds.map((uid) => fetchUserDetailsWithRetry(uid)),
        );

        // Extract crewId from chatId (document ID)
        const [crewId] = docSnap.id.split('_');

        // Fetch crewName from crews collection
        const crew = crews.find((c) => c.id === crewId);
        const crewName = crew ? crew.name : 'Unknown Crew';

        // Get lastRead timestamp for current user
        const lastRead = chatData.lastRead || {};

        return {
          id: docSnap.id,
          crewId: crewId,
          otherMembers,
          crewName,
          avatarUrl: crew?.iconUrl,
          lastRead,
        } as CrewDateChat;
      });

      // Wait for all chat promises to resolve in parallel
      const fetchedChats = await Promise.all(chatPromises);

      setChats(fetchedChats);
      // computeTotalUnread will handle updating totalUnread
    } catch (error) {
      console.error('Error fetching crew date chats:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not fetch crew date chats',
      });
    }
  }, [user?.uid, crews]);

  // Listen to real-time updates in crew date chats
  const listenToChats = useCallback(() => {
    if (!user?.uid) return () => {};

    const chatQuery = query(
      collection(db, 'crew_date_chats'),
      where('memberIds', 'array-contains', user.uid),
      where('hasMessages', '==', true), // Optional condition
    );

    const unsubscribe = onSnapshot(
      chatQuery,
      async (querySnapshot) => {
        try {
          // Map each document snapshot to a promise that resolves to a CrewDateChat object
          const chatPromises = querySnapshot.docs.map(async (docSnap) => {
            const chatData = docSnap.data();

            const memberIds: string[] = chatData.memberIds || [];

            // Exclude the current user's UID to get other members
            const otherMemberIds = memberIds.filter((id) => id !== user.uid);

            // Fetch details for other members in parallel
            console.log('Fetching user details from listenToChats');
            const otherMembers: User[] = await Promise.all(
              otherMemberIds.map((uid) => fetchUserDetailsWithRetry(uid)),
            );

            // Extract crewId from chatId (document ID)
            const [crewId] = docSnap.id.split('_');

            // Fetch crewName from crews collection
            const crew = crews.find((c) => c.id === crewId);
            const crewName = crew ? crew.name : 'Unknown Crew';

            // Get lastRead timestamp for current user
            const lastRead = chatData.lastRead
              ? chatData.lastRead[user.uid] || null
              : null;

            return {
              id: docSnap.id,
              crewId: crewId,
              otherMembers,
              crewName,
              avatarUrl: crew?.iconUrl,
              lastRead,
            } as CrewDateChat;
          });

          // Wait for all chat promises to resolve in parallel
          const fetchedChats = await Promise.all(chatPromises);

          setChats(fetchedChats);
          // computeTotalUnread will handle updating totalUnread
        } catch (error) {
          console.error('Error processing real-time chat updates:', error);
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Could not process real-time chat updates',
          });
        }
      },
      (error) => {
        console.error('Error listening to chats:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not listen to chats',
        });
      },
    );

    return () => {
      unsubscribe();
      console.log('Unsubscribed from crew date chat listener.');
    };
  }, [user?.uid, crews]);

  // Runs when user uid changes to fetch initial chats
  useEffect(() => {
    fetchChats(); // Just fetch once when user changes
  }, [user?.uid]);

  // Separate effect that listens to real-time updates
  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = listenToChats();
    return () => {
      unsubscribe && unsubscribe();
    };
  }, [user?.uid, listenToChats]);

  // Compute total unread messages whenever chats or activeChats change
  useEffect(() => {
    computeTotalUnread();
  }, [computeTotalUnread]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      // Cleanup all message listeners
      Object.values(listenersRef.current).forEach((unsubscribe) =>
        unsubscribe(),
      );
      listenersRef.current = {};
    };
  }, []);

  // Send a message in a crew date chat
  const sendMessage = useCallback(
    async (chatId: string, text: string) => {
      if (!user?.uid) return;

      try {
        const messagesRef = collection(
          db,
          'crew_date_chats',
          chatId,
          'messages',
        );
        const newMessage = {
          senderId: user.uid,
          text,
          createdAt: serverTimestamp(),
        };
        await addDoc(messagesRef, newMessage);

        // **Update hasMessages field if not already true**
        const chatRef = doc(db, 'crew_date_chats', chatId);
        await updateDoc(chatRef, {
          hasMessages: true,
        });
        console.log(`Message sent in chat ${chatId}: "${text}"`);
      } catch (error) {
        console.error('Error sending message:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not send message.',
        });
      }
    },
    [user?.uid],
  );

  // Update lastRead timestamp for a specific chat
  const updateLastRead = useCallback(
    async (chatId: string) => {
      if (!user?.uid) return;

      try {
        const chatRef = doc(db, 'crew_date_chats', chatId);
        await setDoc(
          chatRef,
          {
            lastRead: {
              [user.uid]: serverTimestamp(),
            },
          },
          { merge: true },
        );
      } catch (error) {
        console.warn(`Error updating lastRead for chat ${chatId}:`, error);
      }
    },
    [user?.uid],
  );

  // Add a member to a chat
  const addMemberToChat = useCallback(
    async (chatId: string, uid: string): Promise<void> => {
      try {
        const chatRef = doc(db, 'crew_date_chats', chatId);
        const chatSnap = await getDoc(chatRef);

        if (chatSnap.exists()) {
          // Document exists, update it
          await updateDoc(chatRef, {
            memberIds: arrayUnion(uid),
          });
          console.log(`Added member ${uid} to existing chat ${chatId}`);
        } else {
          // Document does not exist, create it
          await setDoc(chatRef, {
            memberIds: [uid], // Initialize the array
            createdAt: serverTimestamp(), // Optionally track when the chat was created
            hasMessages: false,
          });
          console.log(
            `Created new chat and added member ${uid} to chat ${chatId}`,
          );
        }
      } catch (error) {
        console.error(`Error adding member ${uid} to chat ${chatId}:`, error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not add member to chat.',
        });
      }
    },
    [],
  );

  // Remove a member from a chat
  const removeMemberFromChat = useCallback(
    async (chatId: string, uid: string): Promise<void> => {
      try {
        const chatRef = doc(db, 'crew_date_chats', chatId);
        await updateDoc(chatRef, {
          memberIds: arrayRemove(uid),
        });
        console.log(`Removed member ${uid} from chat ${chatId}`);
      } catch (error) {
        console.error(
          `Error removing member ${uid} from chat ${chatId}:`,
          error,
        );
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not remove member from chat.',
        });
      }
    },
    [],
  );

  // Listen to real-time updates in messages of a crew date chat with sender names
  const listenToMessages = useCallback(
    (chatId: string) => {
      if (!user?.uid) return () => {};

      // Clean up existing listener if any
      if (listenersRef.current[chatId]) {
        listenersRef.current[chatId]();
        delete listenersRef.current[chatId];
      }

      const messagesRef = collection(db, 'crew_date_chats', chatId, 'messages');
      const msgQuery = query(messagesRef, orderBy('createdAt', 'asc'));

      // Load cached messages if available
      const cachedMessages = storage.getString(`messages_${chatId}`);
      if (cachedMessages) {
        const parsedCachedMessages: Message[] = JSON.parse(
          cachedMessages,
          (key, value) => {
            if (key === 'createdAt' && typeof value === 'string') {
              return new Date(value);
            }
            return value;
          },
        );
        setMessages((prev) => ({
          ...prev,
          [chatId]: parsedCachedMessages,
        }));
      }

      const unsubscribe = onSnapshot(
        msgQuery,
        async (querySnapshot) => {
          try {
            const fetchedMessages: Message[] = await Promise.all(
              querySnapshot.docs.map(async (docSnap) => {
                const msgData = docSnap.data();
                const senderId: string = msgData.senderId;
                const sender = await fetchUserDetailsWithRetry(senderId);

                return {
                  id: docSnap.id,
                  senderId,
                  text: msgData.text,
                  createdAt: msgData.createdAt
                    ? msgData.createdAt.toDate()
                    : new Date(),
                  senderName: sender.displayName,
                };
              }),
            );

            setMessages((prev) => ({
              ...prev,
              [chatId]: fetchedMessages,
            }));

            const messagesToCache = fetchedMessages.map((msg) => ({
              ...msg,
              createdAt: msg.createdAt.toISOString(),
            }));
            storage.set(`messages_${chatId}`, JSON.stringify(messagesToCache));
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
          console.error('Error listening to messages:', error);
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Could not listen to messages.',
          });
        },
      );

      listenersRef.current[chatId] = unsubscribe;

      return () => {
        if (listenersRef.current[chatId]) {
          listenersRef.current[chatId]();
          delete listenersRef.current[chatId];
        }
      };
    },
    [user?.uid, fetchUserDetails],
  );

  // Get count of chat participants
  const getChatParticipantsCount = (chatId: string): number => {
    const chat = chats.find((chat) => chat.id === chatId);
    return chat ? chat.otherMembers.length + 1 : 0;
  };

  return (
    <CrewDateChatContext.Provider
      value={{
        chats,
        messages,
        fetchChats,
        sendMessage,
        updateLastRead,
        listenToChats,
        listenToMessages,
        addMemberToChat,
        removeMemberFromChat,
        fetchUnreadCount,
        totalUnread,
        getChatParticipantsCount,
      }}
    >
      {children}
    </CrewDateChatContext.Provider>
  );
};

// Custom hook to use the CrewDateChatContext
export const useCrewDateChat = () => {
  const context = useContext(CrewDateChatContext);
  if (!context) {
    throw new Error(
      'useCrewDateChat must be used within a CrewDateChatProvider',
    );
  }
  return context;
};
