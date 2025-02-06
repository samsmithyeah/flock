// context/CrewDateChatContext.tsx

import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useCallback,
  useRef,
  useMemo,
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
  FirestoreError,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { User } from '@/types/User';
import { useCrews } from '@/context/CrewsContext';
import Toast from 'react-native-toast-message';
import { storage } from '@/storage';

interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: Date;
  senderName?: string;
}

interface CrewDateChat {
  id: string;
  crewId: string;
  otherMembers: User[];
  crewName: string;
  avatarUrl?: string;
  lastRead: { [uid: string]: Timestamp | null };
}

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

const CrewDateChatContext = createContext<CrewDateChatContextProps | undefined>(
  undefined,
);

export const CrewDateChatProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, activeChats } = useUser();
  const { crews, usersCache, setUsersCache } = useCrews();
  const [chats, setChats] = useState<CrewDateChat[]>([]);
  const [messages, setMessages] = useState<{ [chatId: string]: Message[] }>({});
  const [totalUnread, setTotalUnread] = useState<number>(0);
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;
  const listenersRef = useRef<{ [chatId: string]: () => void }>({});
  const pendingBatches = new Map<string, Promise<any>>();

  const fetchUserDetailsBatch = useCallback(
    async (uids: Set<string>) => {
      const uncachedUids = [...uids].filter((uid) => !usersCache[uid]);
      if (uncachedUids.length === 0) return;
      const batchKey = uncachedUids.sort().join(',');
      if (pendingBatches.has(batchKey)) {
        return pendingBatches.get(batchKey);
      }
      const batchPromise = (async () => {
        try {
          console.log('getDocs in fetchUserDetailsBatch');
          const userDocs = await getDocs(collection(db, 'users'));
          const results = userDocs.docs.map((doc) => ({
            uid: doc.id,
            displayName: doc.data().displayName || 'Unknown User',
            email: doc.data().email || '',
            photoURL: doc.data().photoURL,
            ...doc.data(),
          })) as User[];
          const newUsers = Object.fromEntries(
            results.map((user) => [user.uid, user]),
          );
          setUsersCache((prev) => ({ ...prev, ...newUsers }));
          pendingBatches.delete(batchKey);
          return results;
        } catch (error) {
          pendingBatches.delete(batchKey);
          throw error;
        }
      })();
      pendingBatches.set(batchKey, batchPromise);
      return batchPromise;
    },
    [usersCache, setUsersCache],
  );

  const fetchUserDetails = useCallback(
    async (uid: string): Promise<User> => {
      if (usersCache[uid]) {
        return usersCache[uid];
      }
      const results = await fetchUserDetailsBatch(new Set([uid]));
      const foundUser = results?.find((user: User) => user.uid === uid);
      if (!foundUser) {
        throw new Error(`User ${uid} not found`);
      }
      return foundUser;
    },
    [usersCache, fetchUserDetailsBatch],
  );

  const fetchUserDetailsWithRetry = useCallback(
    async (uid: string, retries = 0): Promise<User> => {
      try {
        const userFetched = await fetchUserDetails(uid);
        if (!userFetched) throw new Error(`User ${uid} not found`);
        return userFetched;
      } catch (error) {
        console.error(`Error fetching user ${uid}:`, error);
        if (retries < MAX_RETRIES) {
          console.log(`Retrying fetch for user ${uid}, attempt ${retries + 1}`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
          return fetchUserDetailsWithRetry(uid, retries + 1);
        }
        console.warn(
          `Failed to fetch user ${uid} after ${MAX_RETRIES} retries`,
        );
        return {
          uid,
          displayName: 'Unknown User',
          photoURL: undefined,
          email: '',
        };
      }
    },
    [fetchUserDetails],
  );

  // --- Local unread count computation ---
  const computeUnreadCountForChat = useCallback(
    (chatId: string): number => {
      if (!user?.uid) return 0;
      const chat = chats.find((chat) => chat.id === chatId);
      if (!chat) return 0;
      const chatMessages = messages[chatId] || [];
      let lastReadDate: Date | null = null;
      const lastRead = chat.lastRead[user.uid];
      if (lastRead && typeof lastRead.toDate === 'function') {
        lastReadDate = lastRead.toDate();
      }
      if (!lastReadDate) {
        return chatMessages.length;
      }
      return chatMessages.filter(
        (msg) => msg.createdAt.getTime() > lastReadDate!.getTime(),
      ).length;
    },
    [user?.uid, chats, messages],
  );

  // Updated fetchUnreadCount uses the locally computed value.
  const fetchUnreadCount = useCallback(
    async (chatId: string): Promise<number> => {
      return computeUnreadCountForChat(chatId);
    },
    [computeUnreadCountForChat],
  );

  // Compute total unread from local state (only for chats not in activeChats)
  const computeTotalUnread = useCallback(() => {
    if (!user?.uid || chats.length === 0) {
      setTotalUnread(0);
      return;
    }
    const total = chats
      .filter((chat) => !activeChats.has(chat.id))
      .reduce((acc, chat) => acc + computeUnreadCountForChat(chat.id), 0);
    setTotalUnread(total);
  }, [user?.uid, chats, messages, activeChats, computeUnreadCountForChat]);

  // --- End local unread count logic ---

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
      console.log('getDocs in fetchChats');
      const querySnapshot = await getDocs(chatQuery);
      const chatPromises = querySnapshot.docs.map(async (docSnap) => {
        const chatData = docSnap.data();
        const memberIds: string[] = chatData.memberIds || [];
        const otherMemberIds = memberIds.filter((id) => id !== user.uid);
        const otherMembers: User[] = await Promise.all(
          otherMemberIds.map((uid) => fetchUserDetailsWithRetry(uid)),
        );
        const [crewId] = docSnap.id.split('_');
        const crew = crews.find((c) => c.id === crewId);
        const crewName = crew ? crew.name : 'Unknown Crew';
        const lastRead = chatData.lastRead || {};
        return {
          id: docSnap.id,
          crewId,
          otherMembers,
          crewName,
          avatarUrl: crew?.iconUrl,
          lastRead,
        } as CrewDateChat;
      });
      const fetchedChats = await Promise.all(chatPromises);
      setChats(fetchedChats);
    } catch (error) {
      console.error('Error fetching crew date chats:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not fetch crew date chats',
      });
    }
  }, [user?.uid, crews, fetchUserDetailsWithRetry]);

  const listenToChats = useCallback(() => {
    if (!user?.uid) return () => {};
    const chatQuery = query(
      collection(db, 'crew_date_chats'),
      where('memberIds', 'array-contains', user.uid),
      where('hasMessages', '==', true),
    );
    const unsubscribe = onSnapshot(
      chatQuery,
      async (querySnapshot) => {
        try {
          const chatPromises = querySnapshot.docs.map(async (docSnap) => {
            const chatData = docSnap.data();
            const memberIds: string[] = chatData.memberIds || [];
            const otherMemberIds = memberIds.filter((id) => id !== user.uid);
            const otherMembers: User[] = await Promise.all(
              otherMemberIds.map((uid) => fetchUserDetailsWithRetry(uid)),
            );
            const [crewId] = docSnap.id.split('_');
            const crewName = 'Unknown Crew';
            const lastRead = chatData.lastRead
              ? chatData.lastRead[user.uid] || null
              : null;
            return {
              id: docSnap.id,
              crewId,
              otherMembers,
              crewName,
              avatarUrl: undefined,
              lastRead,
            } as CrewDateChat;
          });
          const fetchedChats = await Promise.all(chatPromises);
          setChats(fetchedChats);
        } catch (error: any) {
          if (!user?.uid) return;
          if (error.code === 'permission-denied') return;
          console.error('Error processing real-time chat updates:', error);
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Could not process real-time chat updates',
          });
        }
      },
      (error) => {
        if (!user?.uid) return;
        if (error.code === 'permission-denied') return;
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
    };
  }, [user?.uid, fetchUserDetailsWithRetry]);

  useEffect(() => {
    fetchChats();
  }, [user?.uid, fetchChats]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = listenToChats();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user?.uid, listenToChats]);

  useEffect(() => {
    computeTotalUnread();
  }, [computeTotalUnread]);

  useEffect(() => {
    return () => {
      Object.values(listenersRef.current).forEach((unsubscribe) =>
        unsubscribe(),
      );
      listenersRef.current = {};
    };
  }, []);

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

  const updateLastRead = useCallback(
    async (chatId: string) => {
      if (!user?.uid) return;
      try {
        const chatRef = doc(db, 'crew_date_chats', chatId);
        await setDoc(
          chatRef,
          { lastRead: { [user.uid]: serverTimestamp() } },
          { merge: true },
        );
      } catch (error) {
        console.warn(`Error updating lastRead for chat ${chatId}:`, error);
      }
    },
    [user?.uid],
  );

  const addMemberToChat = useCallback(
    async (chatId: string, uid: string): Promise<void> => {
      try {
        console.log('getDoc in addMemberToChat');
        const chatRef = doc(db, 'crew_date_chats', chatId);
        const chatSnap = await getDoc(chatRef);
        if (chatSnap.exists()) {
          await updateDoc(chatRef, { memberIds: arrayUnion(uid) });
          console.log(`Added member ${uid} to existing chat ${chatId}`);
        } else {
          await setDoc(chatRef, {
            memberIds: [uid],
            createdAt: serverTimestamp(),
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

  const removeMemberFromChat = useCallback(
    async (chatId: string, uid: string): Promise<void> => {
      try {
        const chatRef = doc(db, 'crew_date_chats', chatId);
        await updateDoc(chatRef, { memberIds: arrayRemove(uid) });
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

  const listenToMessages = useCallback(
    (chatId: string) => {
      if (!user?.uid) return () => {};
      if (listenersRef.current[chatId]) {
        listenersRef.current[chatId]();
        delete listenersRef.current[chatId];
      }
      const messagesRef = collection(db, 'crew_date_chats', chatId, 'messages');
      const msgQuery = query(messagesRef, orderBy('createdAt', 'asc'));
      const cachedMessages = storage.getString(`messages_${chatId}`);
      if (cachedMessages) {
        const parsedCachedMessages: Message[] = JSON.parse(
          cachedMessages,
          (key, value) =>
            key === 'createdAt' && typeof value === 'string'
              ? new Date(value)
              : value,
        );
        setMessages((prev) => ({ ...prev, [chatId]: parsedCachedMessages }));
      }
      const unsubscribe = onSnapshot(
        msgQuery,
        async (querySnapshot) => {
          if (!user?.uid) return;
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
            setMessages((prev) => ({ ...prev, [chatId]: fetchedMessages }));
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
        (error: FirestoreError) => {
          if (!user?.uid) return;
          if (error.code === 'permission-denied') return;
          console.error('Error listening to messages:', error);
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
    [user?.uid, fetchUserDetailsWithRetry],
  );

  // Memoize chat participants counts to avoid recalculating on every render.
  const chatParticipantsCounts = useMemo(() => {
    const counts: { [chatId: string]: number } = {};
    chats.forEach((chat) => {
      counts[chat.id] = chat.otherMembers.length + 1;
    });
    return counts;
  }, [chats]);

  const getChatParticipantsCount = useCallback(
    (chatId: string): number => {
      return chatParticipantsCounts[chatId] || 0;
    },
    [chatParticipantsCounts],
  );

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

export const useCrewDateChat = () => {
  const context = useContext(CrewDateChatContext);
  if (!context) {
    throw new Error(
      'useCrewDateChat must be used within a CrewDateChatProvider',
    );
  }
  return context;
};
