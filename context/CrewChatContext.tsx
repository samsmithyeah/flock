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
import { useCrews } from '@/context/CrewsContext';
import Toast from 'react-native-toast-message';
import { User } from '@/types/User';
import { Crew } from '@/types/Crew';
import {
  UserBatchFetcher,
  MessageListenerManager,
  createMessageListener,
  loadEarlierMessages as loadEarlierMessagesUtil,
  processMessagesBatch,
  ProcessedMessage,
  MessagePaginationInfo,
  DEFAULT_MESSAGES_PER_LOAD,
} from '@/utils/chatContextUtils';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Poll {
  question: string;
  options: string[];
  votes: { [optionIndex: number]: string[] };
  totalVotes: number;
}

interface Message extends ProcessedMessage {
  poll?: Poll;
}

interface CrewChat {
  id: string; // crewId
  crewId: string;
  members: User[];
  crewName: string;
  avatarUrl?: string;
  lastRead: { [uid: string]: Timestamp | null };
}

interface CrewChatContextProps {
  chats: CrewChat[];
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

const MESSAGES_PER_LOAD = DEFAULT_MESSAGES_PER_LOAD;

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const CrewChatContext = createContext<CrewChatContextProps | undefined>(
  undefined,
);

// ============================================================================
// MAIN PROVIDER COMPONENT
// ============================================================================

export const CrewChatProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, activeChats } = useUser();
  const { crews, usersCache, setUsersCache } = useCrews();
  const [chats, setChats] = useState<CrewChat[]>([]);
  const [messages, setMessages] = useState<{ [chatId: string]: Message[] }>({});
  const [totalUnread, setTotalUnread] = useState<number>(0);
  const [messagePaginationInfo, setMessagePaginationInfo] = useState<{
    [chatId: string]: MessagePaginationInfo;
  }>({});

  // ============================================================================
  // UTILITY INSTANCES
  // ============================================================================

  const userFetcher = useMemo(
    () => new UserBatchFetcher(usersCache, setUsersCache),
    [usersCache, setUsersCache],
  );
  const listenerManager = useMemo(() => new MessageListenerManager(), []);

  // ============================================================================
  // UNREAD COUNT MANAGEMENT (CUSTOM IMPLEMENTATION)
  // Note: Cannot use chatContextUtils.fetchUnreadCount directly due to
  // the different Firestore structure for crew chat metadata.
  // ============================================================================

  const fetchUnreadCount = useCallback(
    async (chatId: string): Promise<number> => {
      if (!user?.uid) return 0;
      try {
        const metadataRef = doc(db, 'crews', chatId, 'messages', 'metadata');
        const metadataDoc = await getDoc(metadataRef);

        if (!metadataDoc.exists()) return 0;

        const metadata = metadataDoc.data();
        const lastRead = metadata.lastRead ? metadata.lastRead[user.uid] : null;

        if (!lastRead) return 0; // If user has never read, all messages are unread (handle later if needed)

        const messagesRef = collection(db, 'crews', chatId, 'messages');
        const unreadQuery = query(
          messagesRef,
          where('createdAt', '>', lastRead),
        );
        const countSnapshot = await getCountFromServer(unreadQuery);
        return countSnapshot.data().count;
      } catch (error) {
        if (
          error instanceof FirestoreError &&
          (error.code === 'permission-denied' || error.code === 'unavailable')
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
  }, [user?.uid, chats, activeChats, fetchUnreadCount]);

  // ============================================================================
  // CHAT FETCHING & MANAGEMENT
  // ============================================================================

  const buildChatFromDoc = useCallback(
    async (crew: Crew): Promise<CrewChat> => {
      const metadataRef = doc(db, 'crews', crew.id, 'messages', 'metadata');
      const metadataDoc = await getDoc(metadataRef);
      const lastReadData = metadataDoc.exists()
        ? metadataDoc.data().lastRead
        : {};

      const memberIds = crew.memberIds.filter((id) => id !== user?.uid);
      const members = await userFetcher.fetchUserDetailsBatch(
        new Set(memberIds),
      );

      return {
        id: crew.id,
        crewId: crew.id,
        members,
        crewName: crew.name,
        avatarUrl: crew.iconUrl,
        lastRead: lastReadData,
      };
    },
    [user?.uid, userFetcher],
  );

  const fetchChats = useCallback(async () => {
    if (!user?.uid) {
      setChats([]);
      return;
    }
    try {
      const userCrews = crews.filter((crew) =>
        crew.memberIds.includes(user.uid),
      );
      const chatPromises = userCrews.map(buildChatFromDoc);
      const fetchedChats = await Promise.all(chatPromises);
      setChats(fetchedChats);
    } catch (error) {
      console.error('Error fetching crew chats:', error);
    }
  }, [user?.uid, crews, buildChatFromDoc]);

  const listenToChats = useCallback(() => {
    if (!user?.uid) return () => {};

    const userCrews = crews.filter((crew) => crew.memberIds.includes(user.uid));
    const unsubscribers = userCrews.map((crew) => {
      const metadataRef = doc(db, 'crews', crew.id, 'messages', 'metadata');
      return onSnapshot(metadataRef, async () => {
        const updatedChat = await buildChatFromDoc(crew);
        setChats((prev) => {
          const index = prev.findIndex((c) => c.id === updatedChat.id);
          if (index > -1) {
            const newChats = [...prev];
            newChats[index] = updatedChat;
            return newChats;
          }
          return [...prev, updatedChat];
        });
      });
    });

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [user?.uid, crews, buildChatFromDoc]);

  // ============================================================================
  // MESSAGE MANAGEMENT
  // ============================================================================

  const sendMessage = useCallback(
    async (chatId: string, text: string, imageUrl?: string) => {
      if (!user?.uid) return;
      try {
        const messagesRef = collection(db, 'crews', chatId, 'messages');
        await addDoc(messagesRef, {
          senderId: user.uid,
          text,
          createdAt: serverTimestamp(),
          ...(imageUrl && { imageUrl }),
        });
        const metadataRef = doc(db, 'crews', chatId, 'messages', 'metadata');
        await setDoc(metadataRef, { hasMessages: true }, { merge: true });
      } catch (error) {
        console.error('Error sending message:', error);
      }
    },
    [user?.uid],
  );

  const updateLastRead = useCallback(
    async (chatId: string) => {
      if (!user?.uid) return;
      try {
        const metadataRef = doc(db, 'crews', chatId, 'messages', 'metadata');
        await setDoc(
          metadataRef,
          { lastRead: { [user.uid]: serverTimestamp() } },
          { merge: true },
        );
      } catch (error) {
        console.warn(`Error updating lastRead for chat ${chatId}:`, error);
      }
    },
    [user?.uid],
  );

  const listenToMessages = useCallback(
    (chatId: string) => {
      if (!user?.uid) return () => {};
      listenerManager.removeListener(chatId);

      const unsubscribe = createMessageListener(
        chatId,
        user.uid,
        'crews',
        userFetcher,
        setMessages,
        setMessagePaginationInfo,
        {
          messagesPerLoad: MESSAGES_PER_LOAD,
          enableCaching: true,
          cachePrefix: 'crew_chat_messages',
        },
      );

      const pollUpdateUnsubscribe = onSnapshot(
        query(
          collection(db, 'crews', chatId, 'messages'),
          where('poll', '!=', null),
        ),
        async (snapshot) => {
          const modifiedDocs = snapshot
            .docChanges()
            .filter((change) => change.type === 'modified')
            .map((change) => change.doc);
          if (modifiedDocs.length > 0) {
            const modifiedPollMessages = await processMessagesBatch(
              modifiedDocs,
              userFetcher,
            );
            setMessages((prev) => {
              const updatedMessages = [...(prev[chatId] || [])];
              modifiedPollMessages.forEach((updatedMsg) => {
                const index = updatedMessages.findIndex(
                  (m) => m.id === updatedMsg.id,
                );
                if (index > -1) updatedMessages[index] = updatedMsg;
              });
              return {
                ...prev,
                [chatId]: updatedMessages.sort(
                  (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
                ),
              };
            });
          }
        },
      );

      const combinedUnsubscribe = () => {
        unsubscribe();
        pollUpdateUnsubscribe();
      };

      listenerManager.addListener(chatId, combinedUnsubscribe);
      return combinedUnsubscribe;
    },
    [user?.uid, userFetcher, listenerManager],
  );

  const loadEarlierMessages = useCallback(
    async (chatId: string): Promise<boolean> => {
      if (!user?.uid) return false;
      const pagination = messagePaginationInfo[chatId];
      if (!pagination || !pagination.hasMore || pagination.loading)
        return false;

      const result = await loadEarlierMessagesUtil(
        chatId,
        'crews',
        pagination,
        setMessagePaginationInfo,
        {
          messagesPerLoad: MESSAGES_PER_LOAD,
          logPrefix: '[CrewChat]',
        },
      );

      if (result.success && result.lastDoc) {
        const messagesRef = collection(db, 'crews', chatId, 'messages');
        const newQuery = query(
          messagesRef,
          orderBy('createdAt', 'desc'),
          startAfter(pagination.lastDoc),
          limit(MESSAGES_PER_LOAD),
        );
        const snapshot = await getDocs(newQuery);
        const olderMessages = await processMessagesBatch(
          snapshot.docs,
          userFetcher,
        );
        setMessages((prev) => ({
          ...prev,
          [chatId]: [...olderMessages.reverse(), ...(prev[chatId] || [])],
        }));
      }

      return result.success;
    },
    [user?.uid, messagePaginationInfo, userFetcher],
  );

  // ============================================================================
  // POLL FUNCTIONALITY
  // ============================================================================

  const createPoll = useCallback(
    async (chatId: string, question: string, options: string[]) => {
      if (!user?.uid) return;
      await sendMessage(chatId, `Poll: ${question}`);
      await addDoc(collection(db, 'crews', chatId, 'messages'), {
        senderId: user.uid,
        createdAt: serverTimestamp(),
        poll: { question, options, votes: {}, totalVotes: 0 },
      });
    },
    [user?.uid, sendMessage],
  );

  const votePoll = useCallback(
    async (chatId: string, messageId: string, optionIndex: number) => {
      if (!user?.uid) return;
      const messageRef = doc(db, 'crews', chatId, 'messages', messageId);
      try {
        await runTransaction(db, async (transaction) => {
          const msgDoc = await transaction.get(messageRef);
          if (!msgDoc.exists() || !msgDoc.data()?.poll)
            throw new Error('Poll not found');
          const poll = msgDoc.data()?.poll;
          const updatedVotes = { ...poll.votes };
          let totalVotes = poll.totalVotes || 0;
          let isToggle = false;

          Object.entries(updatedVotes).forEach(([idx, voters]) => {
            const voterIds = voters as string[];
            const userVoteIndex = voterIds.indexOf(user.uid);
            if (userVoteIndex > -1) {
              voterIds.splice(userVoteIndex, 1);
              totalVotes--;
              if (parseInt(idx, 10) === optionIndex) isToggle = true;
            }
          });

          if (!isToggle) {
            if (!updatedVotes[optionIndex]) updatedVotes[optionIndex] = [];
            updatedVotes[optionIndex].push(user.uid);
            totalVotes++;
          }

          transaction.update(messageRef, {
            'poll.votes': updatedVotes,
            'poll.totalVotes': totalVotes,
          });
        });
      } catch (error) {
        console.error('Error voting in poll:', error);
      }
    },
    [user?.uid],
  );

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const getChatParticipantsCount = useCallback(
    (chatId: string): number => {
      const chat = chats.find((c) => c.id === chatId);
      return chat ? chat.members.length + 1 : 0;
    },
    [chats],
  );

  // ============================================================================
  // EFFECTS & LIFECYCLE
  // ============================================================================

  useEffect(() => {
    if (user?.uid) {
      fetchChats();
      const unsubscribe = listenToChats();
      return () => unsubscribe();
    }
  }, [user?.uid, crews.length]); // Re-run if user or crew list changes

  useEffect(() => {
    computeTotalUnread();
  }, [chats, activeChats, computeTotalUnread]);

  useEffect(() => {
    return () => {
      listenerManager.removeAllListeners();
    };
  }, [listenerManager]);

  // ============================================================================
  // CONTEXT PROVIDER
  // ============================================================================

  return (
    <CrewChatContext.Provider
      value={{
        chats,
        messages,
        fetchChats,
        sendMessage,
        updateLastRead,
        listenToChats,
        listenToMessages,
        fetchUnreadCount,
        totalUnread,
        getChatParticipantsCount,
        loadEarlierMessages,
        messagePaginationInfo,
        createPoll,
        votePoll,
      }}
    >
      {children}
    </CrewChatContext.Provider>
  );
};

// ============================================================================
// CUSTOM HOOK
// ============================================================================

export const useCrewChat = () => {
  const context = useContext(CrewChatContext);
  if (!context) {
    throw new Error('useCrewChat must be used within a CrewChatProvider');
  }
  return context;
};
