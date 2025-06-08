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
import {
  UserBatchFetcher,
  fetchUnreadCount as fetchUnreadCountUtil,
  computeTotalUnread as computeTotalUnreadUtil,
  processMessagesBatch,
  createMessageListener,
  MessageListenerManager,
  loadEarlierMessages as loadEarlierMessagesUtil,
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

  // ============================================================================
  // UTILITY INSTANCES
  // ============================================================================

  // Initialize UserBatchFetcher for optimized user fetching
  const userFetcher = useMemo(
    () => new UserBatchFetcher(usersCache, setUsersCache),
    [usersCache, setUsersCache],
  );

  // Initialize message listener manager
  const listenerManager = useMemo(() => new MessageListenerManager(), []);

  // ============================================================================
  // UNREAD COUNT MANAGEMENT
  // ============================================================================

  const fetchUnreadCount = useCallback(
    async (chatId: string): Promise<number> => {
      return await fetchUnreadCountUtil(
        chatId,
        user?.uid || '',
        'crew_date_chats',
        { fallbackValue: 0 },
      );
    },
    [user?.uid],
  );

  const computeTotalUnread = useCallback(async () => {
    if (!user?.uid || chats.length === 0) {
      setTotalUnread(0);
      return;
    }

    try {
      const total = await computeTotalUnreadUtil(
        chats,
        user.uid,
        activeChats,
        'crew_date_chats',
      );
      setTotalUnread(total);
    } catch (error) {
      console.error('Error computing total unread messages:', error);
      setTotalUnread(0);
    }
  }, [user?.uid, chats, activeChats]);

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

      // Batch fetch user details using UserBatchFetcher
      const otherMembers = await userFetcher.fetchUserDetailsBatch(
        new Set(otherMemberIds),
      );

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
    [user?.uid, crews, userFetcher],
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

      // Cleanup existing listener using MessageListenerManager
      listenerManager.removeListener(chatId);

      // Create standardized message listener
      const unsubscribe = createMessageListener(
        chatId,
        user.uid,
        'crew_date_chats',
        userFetcher,
        (updater) => setMessages(updater),
        (updater) => setMessagePaginationInfo(updater),
        {
          enableCaching: true,
          cachePrefix: 'crew_messages',
          messagesPerLoad: MESSAGES_PER_LOAD,
        },
      );

      // Set up additional poll update listener (specific to crew date chats)
      const messagesRef = collection(db, 'crew_date_chats', chatId, 'messages');
      const pollUpdateQuery = query(messagesRef, where('poll', '!=', null));

      const pollUpdateUnsubscribe = onSnapshot(
        pollUpdateQuery,
        async (querySnapshot) => {
          if (!user?.uid) return;

          try {
            // Handle only modified documents (poll vote changes)
            const modifiedDocs = querySnapshot
              .docChanges()
              .filter((change) => change.type === 'modified')
              .map((change) => change.doc);

            if (modifiedDocs.length === 0) return;

            // Process modified poll messages using the new utility
            const modifiedPollMessages = await processMessagesBatch(
              modifiedDocs,
              userFetcher,
            );

            // Update existing messages with poll changes
            setMessages((prev) => {
              const existingMessages = prev[chatId] || [];
              const messageMap = new Map(
                existingMessages.map((msg) => [msg.id, msg]),
              );

              // Update only the modified poll messages
              modifiedPollMessages.forEach((updatedMsg) => {
                if (messageMap.has(updatedMsg.id)) {
                  messageMap.set(updatedMsg.id, updatedMsg);
                }
              });

              // Convert back to array and sort
              const mergedMessages = Array.from(messageMap.values()).sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
              );

              return { ...prev, [chatId]: mergedMessages };
            });
          } catch (error) {
            console.error('Error processing poll updates:', error);
          }
        },
        (error) => {
          if (error.code !== 'permission-denied') {
            console.error('Error listening to poll updates:', error);
          }
        },
      );

      // Combine both unsubscribe functions
      const combinedUnsubscribe = () => {
        unsubscribe();
        pollUpdateUnsubscribe();
      };

      // Add to MessageListenerManager
      listenerManager.addListener(chatId, combinedUnsubscribe);

      return combinedUnsubscribe;
    },
    [user?.uid, userFetcher, listenerManager],
  );

  const loadEarlierMessages = useCallback(
    async (chatId: string): Promise<boolean> => {
      if (!user?.uid) return false;

      const result = await loadEarlierMessagesUtil(
        chatId,
        'crew_date_chats',
        messagePaginationInfo[chatId],
        setMessagePaginationInfo,
        {
          messagesPerLoad: MESSAGES_PER_LOAD,
          logPrefix: '[CrewDateChat]',
        },
      );

      if (result.success && result.lastDoc) {
        // Process the messages that were loaded
        const messagesRef = collection(
          db,
          'crew_date_chats',
          chatId,
          'messages',
        );
        const newQuery = query(
          messagesRef,
          orderBy('createdAt', 'desc'),
          startAfter(messagePaginationInfo[chatId]?.lastDoc),
          limit(MESSAGES_PER_LOAD),
        );

        const querySnapshot = await getDocs(newQuery);
        const processedMessages = await processMessagesBatch(
          querySnapshot.docs,
          userFetcher,
        );

        // Add processed messages to the beginning of the chat
        setMessages((prev) => ({
          ...prev,
          [chatId]: [
            ...(prev[chatId] || []),
            ...processedMessages.reverse(), // Reverse to maintain chronological order
          ],
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
