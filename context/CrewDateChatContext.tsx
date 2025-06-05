// filepath: /Users/sam/projects/GoingOutApp/context/CrewDateChatContext.tsx
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
  getCountFromServer,
  limit,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { User } from '@/types/User';
import { useCrews } from '@/context/CrewsContext';
import Toast from 'react-native-toast-message';
import { storage } from '@/storage';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Poll {
  question: string;
  options: string[];
  votes: { [optionIndex: number]: string[] };
  totalVotes: number;
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: Date;
  senderName?: string;
  imageUrl?: string;
  poll?: Poll;
}

interface MessagePaginationInfo {
  hasMore: boolean;
  loading: boolean;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
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
  sendMessage: (
    chatId: string,
    text: string,
    imageUrl?: string,
  ) => Promise<void>;
  updateLastRead: (chatId: string) => Promise<void>;
  listenToChats: () => () => void;
  listenToMessages: (chatId: string) => () => void;
  addMemberToChat: (chatId: string, uid: string) => Promise<void>;
  removeMemberFromChat: (chatId: string, uid: string) => Promise<void>;
  fetchUnreadCount: (chatId: string) => Promise<number>;
  totalUnread: number;
  getChatParticipantsCount: (chatId: string) => number;
  loadEarlierMessages: (chatId: string) => Promise<boolean>;
  messagePaginationInfo: { [chatId: string]: MessagePaginationInfo };
  createPoll: (
    chatId: string,
    question: string,
    options: string[],
  ) => Promise<void>;
  votePoll: (
    chatId: string,
    messageId: string,
    optionIndex: number,
  ) => Promise<void>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MESSAGES_PER_LOAD = 20;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const CrewDateChatContext = createContext<CrewDateChatContextProps | undefined>(
  undefined,
);

// ============================================================================
// MAIN PROVIDER COMPONENT
// ============================================================================

export const CrewDateChatProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, activeChats } = useUser();
  const { crews, usersCache, setUsersCache } = useCrews();

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const [chats, setChats] = useState<CrewDateChat[]>([]);
  const [messages, setMessages] = useState<{ [chatId: string]: Message[] }>({});
  const [totalUnread, setTotalUnread] = useState<number>(0);
  const [messagePaginationInfo, setMessagePaginationInfo] = useState<{
    [chatId: string]: MessagePaginationInfo;
  }>({});

  // ============================================================================
  // REFS FOR CLEANUP
  // ============================================================================

  const listenersRef = useRef<{ [chatId: string]: () => void }>({});
  const pendingBatches = useRef(new Map<string, Promise<User[]>>());

  // ============================================================================
  // USER FETCHING & CACHING OPTIMIZATIONS
  // ============================================================================

  // Optimized batch user fetching with deduplication and caching
  const fetchUserDetailsBatch = useCallback(
    async (uids: Set<string>): Promise<User[]> => {
      const uncachedUids = [...uids].filter((uid) => !usersCache[uid]);

      if (uncachedUids.length === 0) {
        return [...uids].map((uid) => usersCache[uid]).filter(Boolean);
      }

      const batchKey = uncachedUids.sort().join(',');

      // Return existing batch promise if in progress
      if (pendingBatches.current.has(batchKey)) {
        const results = await pendingBatches.current.get(batchKey)!;
        return [...uids]
          .map((uid) => usersCache[uid] || results.find((u) => u.uid === uid))
          .filter(Boolean);
      }

      const batchPromise = (async () => {
        try {
          // Use more efficient query with where clause for small batches
          if (uncachedUids.length <= 10) {
            const userQuery = query(
              collection(db, 'users'),
              where('__name__', 'in', uncachedUids),
            );
            const userDocs = await getDocs(userQuery);

            const results: User[] = userDocs.docs.map(
              (doc) =>
                ({
                  uid: doc.id,
                  displayName: doc.data().displayName || 'Unknown User',
                  email: doc.data().email || '',
                  photoURL: doc.data().photoURL,
                  ...doc.data(),
                }) as User,
            );

            // Batch update cache
            const newUsers = Object.fromEntries(
              results.map((user) => [user.uid, user]),
            );
            setUsersCache((prev) => ({ ...prev, ...newUsers }));

            return results;
          } else {
            // For larger batches, fetch all and filter
            const userDocs = await getDocs(collection(db, 'users'));
            const results: User[] = userDocs.docs
              .filter((doc) => uncachedUids.includes(doc.id))
              .map(
                (doc) =>
                  ({
                    uid: doc.id,
                    displayName: doc.data().displayName || 'Unknown User',
                    email: doc.data().email || '',
                    photoURL: doc.data().photoURL,
                    ...doc.data(),
                  }) as User,
              );

            // Batch update cache
            const newUsers = Object.fromEntries(
              results.map((user) => [user.uid, user]),
            );
            setUsersCache((prev) => ({ ...prev, ...newUsers }));

            return results;
          }
        } finally {
          pendingBatches.current.delete(batchKey);
        }
      })();

      pendingBatches.current.set(batchKey, batchPromise);
      const results = await batchPromise;

      // Return all requested users (cached + fetched)
      return [...uids]
        .map((uid) => usersCache[uid] || results.find((u) => u.uid === uid))
        .filter(Boolean);
    },
    [usersCache, setUsersCache],
  );

  // Single user fetch with retry logic
  const fetchUserDetailsWithRetry = useCallback(
    async (uid: string, retries = 0): Promise<User> => {
      try {
        const results = await fetchUserDetailsBatch(new Set([uid]));
        const user = results.find((u) => u.uid === uid);

        if (!user) throw new Error(`User ${uid} not found`);
        return user;
      } catch (error) {
        if (retries < MAX_RETRIES) {
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
    [fetchUserDetailsBatch],
  );

  // ============================================================================
  // UNREAD COUNT MANAGEMENT
  // ============================================================================

  const fetchUnreadCount = useCallback(
    async (chatId: string): Promise<number> => {
      if (!user?.uid) return 0;

      try {
        const chatRef = doc(db, 'crew_date_chats', chatId);
        const chatDoc = await getDoc(chatRef);

        if (!chatDoc.exists()) return 0;

        const chatData = chatDoc.data();
        const lastRead = chatData?.lastRead?.[user.uid];

        if (!lastRead) return 0;

        const messagesRef = collection(
          db,
          'crew_date_chats',
          chatId,
          'messages',
        );
        const unreadQuery = query(
          messagesRef,
          where('createdAt', '>', lastRead),
        );

        const countSnapshot = await getCountFromServer(unreadQuery);
        return countSnapshot.data().count;
      } catch (error: any) {
        if (
          error.code === 'permission-denied' ||
          error.code === 'unavailable'
        ) {
          return 0;
        }
        console.error(`Error fetching unread count for chat ${chatId}:`, error);
        return 0;
      }
    },
    [user?.uid],
  );

  const computeTotalUnread = useCallback(async () => {
    if (!user?.uid || chats.length === 0) {
      setTotalUnread(0);
      return;
    }

    try {
      const unreadPromises = chats
        .filter((chat) => !activeChats.has(chat.id))
        .map((chat) => fetchUnreadCount(chat.id));

      const unreadCounts = await Promise.all(unreadPromises);
      const total = unreadCounts.reduce((acc, count) => acc + count, 0);
      setTotalUnread(total);
    } catch (error) {
      console.error('Error computing total unread messages:', error);
    }
  }, [user?.uid, chats, fetchUnreadCount, activeChats]);

  // ============================================================================
  // CHAT FETCHING & MANAGEMENT
  // ============================================================================

  const buildChatFromDoc = useCallback(
    async (
      docSnap: QueryDocumentSnapshot<DocumentData>,
    ): Promise<CrewDateChat> => {
      const chatData = docSnap.data();
      const memberIds: string[] = chatData.memberIds || [];
      const otherMemberIds = memberIds.filter((id) => id !== user?.uid);

      // Batch fetch user details
      const otherMembers = await fetchUserDetailsBatch(new Set(otherMemberIds));

      const [crewId] = docSnap.id.split('_');
      const crew = crews.find((c) => c.id === crewId);

      return {
        id: docSnap.id,
        crewId,
        otherMembers,
        crewName: crew?.name || 'Unknown Crew',
        avatarUrl: crew?.iconUrl,
        lastRead: chatData.lastRead || {},
      };
    },
    [user?.uid, crews, fetchUserDetailsBatch],
  );

  const fetchChats = useCallback(async () => {
    if (!user?.uid) {
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
      const chatPromises = querySnapshot.docs.map(buildChatFromDoc);
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
  }, [user?.uid, buildChatFromDoc]);

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
        if (!user?.uid) return;

        try {
          const chatPromises = querySnapshot.docs.map(buildChatFromDoc);
          const fetchedChats = await Promise.all(chatPromises);
          setChats(fetchedChats);
        } catch (error: any) {
          if (error.code !== 'permission-denied') {
            console.error('Error processing real-time chat updates:', error);
          }
        }
      },
      (error) => {
        if (error.code !== 'permission-denied') {
          console.error('Error listening to chats:', error);
        }
      },
    );

    return unsubscribe;
  }, [user?.uid, buildChatFromDoc]);

  // ============================================================================
  // MESSAGE MANAGEMENT
  // ============================================================================

  const processMessage = useCallback(
    async (docSnap: QueryDocumentSnapshot<DocumentData>): Promise<Message> => {
      const msgData = docSnap.data();
      const senderId: string = msgData.senderId;
      const sender = await fetchUserDetailsWithRetry(senderId);

      return {
        id: docSnap.id,
        senderId,
        text: msgData.text || '',
        createdAt: msgData.createdAt?.toDate() || new Date(),
        senderName: sender.displayName,
        imageUrl: msgData.imageUrl,
        poll: msgData.poll,
      };
    },
    [fetchUserDetailsWithRetry],
  );

  const sendMessage = useCallback(
    async (chatId: string, text: string, imageUrl?: string) => {
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
          ...(imageUrl && { imageUrl }),
        };

        await addDoc(messagesRef, newMessage);

        // Update hasMessages flag
        const chatRef = doc(db, 'crew_date_chats', chatId);
        await updateDoc(chatRef, { hasMessages: true });
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

  // ============================================================================
  // MESSAGE LISTENING & PAGINATION
  // ============================================================================

  const listenToMessages = useCallback(
    (chatId: string) => {
      if (!user?.uid) return () => {};

      // Cleanup existing listener
      if (listenersRef.current[chatId]) {
        listenersRef.current[chatId]();
        delete listenersRef.current[chatId];
      }

      // Initialize pagination info
      if (!messagePaginationInfo[chatId]) {
        setMessagePaginationInfo((prev) => ({
          ...prev,
          [chatId]: {
            hasMore: true,
            loading: false,
            lastDoc: null,
          },
        }));
      }

      const messagesRef = collection(db, 'crew_date_chats', chatId, 'messages');

      // Load cached messages
      const cachedMessages = storage.getString(`messages_${chatId}`);
      if (cachedMessages) {
        try {
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
        } catch (error) {
          console.warn('Failed to parse cached messages:', error);
        }
      }

      // Real-time listener for new and modified messages
      const msgQuery = query(
        messagesRef,
        orderBy('createdAt', 'desc'),
        limit(MESSAGES_PER_LOAD),
      );

      const unsubscribe = onSnapshot(
        msgQuery,
        async (querySnapshot) => {
          if (!user?.uid) return;

          try {
            const lastVisible =
              querySnapshot.docs.length > 0
                ? querySnapshot.docs[querySnapshot.docs.length - 1]
                : null;

            // Update pagination info
            setMessagePaginationInfo((prev) => ({
              ...prev,
              [chatId]: {
                ...(prev[chatId] || {}),
                hasMore: querySnapshot.docs.length >= MESSAGES_PER_LOAD,
                lastDoc: lastVisible,
                loading: false,
              },
            }));

            // Process messages
            const fetchedMessages = await Promise.all(
              querySnapshot.docs.map(processMessage),
            );

            const sortedMessages = fetchedMessages.sort(
              (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
            );

            setMessages((prev) => {
              const existingMessages = prev[chatId] || [];
              const mergedMessages = [...existingMessages];

              // Add new messages, avoiding duplicates
              sortedMessages.forEach((newMsg) => {
                const isDuplicate = mergedMessages.some(
                  (existing) => existing.id === newMsg.id,
                );
                if (!isDuplicate) {
                  mergedMessages.push(newMsg);
                }
              });

              // Sort by date
              mergedMessages.sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
              );

              return { ...prev, [chatId]: mergedMessages };
            });

            // Cache messages
            const messagesToCache = sortedMessages.map((msg) => ({
              ...msg,
              createdAt: msg.createdAt.toISOString(),
            }));
            storage.set(`messages_${chatId}`, JSON.stringify(messagesToCache));
          } catch (error) {
            console.error('Error processing messages snapshot:', error);
          }
        },
        (error) => {
          if (error.code !== 'permission-denied') {
            console.error('Error listening to messages:', error);
          }
        },
      );

      listenersRef.current[chatId] = unsubscribe;
      return unsubscribe;
    },
    [user?.uid, processMessage, messagePaginationInfo],
  );

  const loadEarlierMessages = useCallback(
    async (chatId: string): Promise<boolean> => {
      if (!user?.uid || !messagePaginationInfo[chatId]?.hasMore) {
        return false;
      }

      const paginationInfo = messagePaginationInfo[chatId];
      if (paginationInfo?.loading) return false;

      // Set loading state
      setMessagePaginationInfo((prev) => ({
        ...prev,
        [chatId]: {
          ...prev[chatId],
          loading: true,
        },
      }));

      try {
        const lastDoc = paginationInfo?.lastDoc;
        if (!lastDoc) return false;

        const messagesRef = collection(
          db,
          'crew_date_chats',
          chatId,
          'messages',
        );
        const olderMessagesQuery = query(
          messagesRef,
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(MESSAGES_PER_LOAD),
        );

        const querySnapshot = await getDocs(olderMessagesQuery);
        const lastVisible =
          querySnapshot.docs.length > 0
            ? querySnapshot.docs[querySnapshot.docs.length - 1]
            : null;

        // Update pagination info
        setMessagePaginationInfo((prev) => ({
          ...prev,
          [chatId]: {
            hasMore: querySnapshot.docs.length >= MESSAGES_PER_LOAD,
            lastDoc: lastVisible || prev[chatId].lastDoc,
            loading: false,
          },
        }));

        if (querySnapshot.empty) return false;

        // Process older messages
        const olderMessages = await Promise.all(
          querySnapshot.docs.map(processMessage),
        );

        const sortedOlderMessages = olderMessages.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );

        // Update messages state
        setMessages((prev) => {
          const existingMessages = prev[chatId] || [];
          const mergedMessages = [...existingMessages];

          sortedOlderMessages.forEach((oldMsg) => {
            const isDuplicate = mergedMessages.some(
              (existing) => existing.id === oldMsg.id,
            );
            if (!isDuplicate) {
              mergedMessages.unshift(oldMsg);
            }
          });

          mergedMessages.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          );

          return { ...prev, [chatId]: mergedMessages };
        });

        return querySnapshot.docs.length > 0;
      } catch (error) {
        console.error('Error loading earlier messages:', error);
        setMessagePaginationInfo((prev) => ({
          ...prev,
          [chatId]: {
            ...prev[chatId],
            loading: false,
          },
        }));
        return false;
      }
    },
    [user?.uid, messagePaginationInfo, processMessage],
  );

  // ============================================================================
  // POLL FUNCTIONALITY
  // ============================================================================

  const createPoll = useCallback(
    async (chatId: string, question: string, options: string[]) => {
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
          text: '',
          createdAt: serverTimestamp(),
          poll: {
            question,
            options,
            votes: {},
            totalVotes: 0,
          },
        };

        await addDoc(messagesRef, newMessage);

        const chatRef = doc(db, 'crew_date_chats', chatId);
        await updateDoc(chatRef, { hasMessages: true });
      } catch (error) {
        console.error('Error creating poll:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not create poll.',
        });
      }
    },
    [user?.uid],
  );

  const votePoll = useCallback(
    async (chatId: string, messageId: string, optionIndex: number) => {
      if (!user?.uid) return;

      try {
        const messageRef = doc(
          db,
          'crew_date_chats',
          chatId,
          'messages',
          messageId,
        );

        await runTransaction(db, async (transaction) => {
          const messageDoc = await transaction.get(messageRef);

          if (!messageDoc.exists()) {
            throw new Error('Message not found');
          }

          const messageData = messageDoc.data();
          const poll = messageData.poll;

          if (!poll) {
            throw new Error('Message is not a poll');
          }

          const updatedVotes = { ...poll.votes };
          let totalVotes = poll.totalVotes || 0;
          let isToggle = false;

          // Remove existing votes by this user
          for (const [idx, voterIds] of Object.entries(updatedVotes)) {
            const voterArray = Array.isArray(voterIds) ? voterIds : [];
            const voterIndex = voterArray.indexOf(user.uid);

            if (voterIndex !== -1) {
              updatedVotes[parseInt(idx)] = voterArray.filter(
                (id) => id !== user.uid,
              );
              totalVotes--;

              if (parseInt(idx) === optionIndex) {
                isToggle = true;
              }
            }
          }

          // Add new vote (unless toggling off)
          if (!isToggle) {
            if (!updatedVotes[optionIndex]) {
              updatedVotes[optionIndex] = [];
            }
            updatedVotes[optionIndex].push(user.uid);
            totalVotes++;
          }

          transaction.update(messageRef, {
            'poll.votes': updatedVotes,
            'poll.totalVotes': totalVotes,
            'poll.lastUpdated': serverTimestamp(),
          });
        });
      } catch (error) {
        console.error('Error voting in poll:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not vote in poll.',
        });
      }
    },
    [user?.uid],
  );

  // ============================================================================
  // MEMBER MANAGEMENT
  // ============================================================================

  const addMemberToChat = useCallback(
    async (chatId: string, uid: string): Promise<void> => {
      try {
        const chatRef = doc(db, 'crew_date_chats', chatId);
        const chatSnap = await getDoc(chatRef);

        if (chatSnap.exists()) {
          await updateDoc(chatRef, {
            memberIds: arrayUnion(uid),
            [`lastRead.${uid}`]: serverTimestamp(),
          });
        } else {
          await setDoc(chatRef, {
            memberIds: [uid],
            createdAt: serverTimestamp(),
            hasMessages: false,
            lastRead: {
              [uid]: serverTimestamp(),
            },
          });
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
        const chat = chats.find((chat) => chat.id === chatId);
        if (!chat || !chat.otherMembers.find((m) => m.uid === uid)) {
          return;
        }

        const chatRef = doc(db, 'crew_date_chats', chatId);
        await updateDoc(chatRef, {
          memberIds: arrayRemove(uid),
        });
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
    [chats],
  );

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const getChatParticipantsCount = useCallback(
    (chatId: string): number => {
      const chat = chats.find((chat) => chat.id === chatId);
      return chat ? chat.otherMembers.length + 1 : 0;
    },
    [chats],
  );

  // ============================================================================
  // EFFECTS & LIFECYCLE
  // ============================================================================

  // Fetch chats when user changes
  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Listen to real-time chat updates
  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = listenToChats();
    return unsubscribe;
  }, [listenToChats]);

  // Compute total unread messages
  useEffect(() => {
    computeTotalUnread();
  }, [computeTotalUnread]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      Object.values(listenersRef.current).forEach((unsubscribe) =>
        unsubscribe(),
      );
      listenersRef.current = {};
    };
  }, []);

  // ============================================================================
  // CONTEXT PROVIDER
  // ============================================================================

  const contextValue = useMemo(
    () => ({
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
      loadEarlierMessages,
      messagePaginationInfo,
      createPoll,
      votePoll,
    }),
    [
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
      loadEarlierMessages,
      messagePaginationInfo,
      createPoll,
      votePoll,
    ],
  );

  return (
    <CrewDateChatContext.Provider value={contextValue}>
      {children}
    </CrewDateChatContext.Provider>
  );
};

// ============================================================================
// CUSTOM HOOK
// ============================================================================

export const useCrewDateChat = () => {
  const context = useContext(CrewDateChatContext);
  if (!context) {
    throw new Error(
      'useCrewDateChat must be used within a CrewDateChatProvider',
    );
  }
  return context;
};
