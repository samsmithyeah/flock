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
  FirestoreError,
  getCountFromServer,
  limit,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { User } from '@/types/User';
import { useCrews } from '@/context/CrewsContext';
import Toast from 'react-native-toast-message';
import { storage } from '@/storage'; // MMKV storage instance

// Define the Message interface with createdAt as Date
interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: Date; // Ensure it's Date
  senderName?: string;
  imageUrl?: string; // Add support for image messages
  poll?: Poll; // Add support for polls
}

// Add Poll interface for messages
interface Poll {
  question: string;
  options: string[];
  votes: { [optionIndex: number]: string[] }; // Array of user IDs who voted for each option
  totalVotes: number;
}

// Add pagination info to track message loading state
interface MessagePaginationInfo {
  hasMore: boolean;
  loading: boolean;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
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
  // Add method to load earlier messages
  loadEarlierMessages: (chatId: string) => Promise<boolean>;
  // Add pagination info mapping
  messagePaginationInfo: { [chatId: string]: MessagePaginationInfo };
  // Add poll functions
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

// Default number of messages to load initially and for pagination
const MESSAGES_PER_LOAD = 20;

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

  // Add state for pagination info
  const [messagePaginationInfo, setMessagePaginationInfo] = useState<{
    [chatId: string]: MessagePaginationInfo;
  }>({});

  // Ref to keep track of message listeners
  const listenersRef = useRef<{ [chatId: string]: () => void }>({});

  const pendingBatches = new Map<string, Promise<any>>();

  const fetchUserDetailsBatch = async (uids: Set<string>) => {
    const uncachedUids = [...uids].filter((uid) => !usersCache[uid]);

    if (uncachedUids.length === 0) return;

    // Create batch key
    const batchKey = uncachedUids.sort().join(',');

    // Check for pending batch
    if (pendingBatches.has(batchKey)) {
      return pendingBatches.get(batchKey);
    }

    // Create new batch request
    const batchPromise = (async () => {
      try {
        console.log('Batch fetch:', new Set(uncachedUids));
        // Your existing fetch logic here
        const userDocs = await getDocs(collection(db, 'users'));

        const results = userDocs.docs.map(
          (doc) =>
            ({
              uid: doc.id,
              displayName: doc.data().displayName || 'Unknown User',
              email: doc.data().email || '',
              photoURL: doc.data().photoURL,
              ...doc.data(),
            }) as User,
        );

        // Update cache
        const newUsers = Object.fromEntries(
          results.map((user) => [user.uid, user]),
        );
        setUsersCache((prev) => ({ ...prev, ...newUsers }));

        // Cleanup pending batch
        pendingBatches.delete(batchKey);

        return results;
      } catch (error) {
        pendingBatches.delete(batchKey);
        throw error;
      }
    })();

    pendingBatches.set(batchKey, batchPromise);
    return batchPromise;
  };

  // Update fetchUserDetails to use batch
  const fetchUserDetails = useCallback(
    async (uid: string): Promise<User> => {
      if (usersCache[uid]) {
        return usersCache[uid];
      }

      const results = await fetchUserDetailsBatch(new Set([uid]));
      const user: User | undefined = results?.find(
        (user: User): boolean => user.uid === uid,
      );

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
      console.error(`Error fetching user ${uid}:`, error);
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
          // Last read should not be null unless fetching is in progress so return 0
          return 0;
        }
        const countSnapshot = await getCountFromServer(msgQuery);
        return countSnapshot.data().count;
      } catch (error: any) {
        if (!user?.uid) return 0;
        if (error.code === 'permission-denied') return 0;
        if (error.code === 'unavailable') {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2:
              'Could not fetch unread count. Please check your connection.',
          });
          return 0;
        }
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
      where('hasMessages', '==', true),
    );

    const unsubscribe = onSnapshot(
      chatQuery,
      async (querySnapshot) => {
        try {
          const chatPromises = querySnapshot.docs.map(async (docSnap) => {
            const chatData = docSnap.data();
            const memberIds: string[] = chatData.memberIds || [];
            // Exclude the current user's UID to get other members
            const otherMemberIds = memberIds.filter((id) => id !== user.uid);
            // Fetch details for other members in parallel
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
              crewId,
              otherMembers,
              crewName,
              avatarUrl: crew?.iconUrl,
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

  // Send a message in a crew date chat - updated to support images
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
          ...(imageUrl ? { imageUrl } : {}), // Add image URL if provided
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

  // Create a poll in a crew date chat
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
          //text: `Poll: ${question}`, // Text for notifications and previews
          createdAt: serverTimestamp(),
          poll: {
            question,
            options,
            votes: {}, // Initialize with empty votes
            totalVotes: 0,
          },
        };
        await addDoc(messagesRef, newMessage);

        // Update hasMessages field
        const chatRef = doc(db, 'crew_date_chats', chatId);
        await updateDoc(chatRef, {
          hasMessages: true,
        });
        console.log(`Poll created in chat ${chatId}: "${question}"`);
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

  // Vote in a poll - add logging and make sure update is atomic
  const votePoll = useCallback(
    async (chatId: string, messageId: string, optionIndex: number) => {
      if (!user?.uid) return;
      console.log(
        `[POLL] User ${user.uid} voting on option ${optionIndex} in message ${messageId}`,
      );

      try {
        const messageRef = doc(
          db,
          'crew_date_chats',
          chatId,
          'messages',
          messageId,
        );

        // Get current poll data
        const messageDoc = await getDoc(messageRef);
        if (!messageDoc.exists()) {
          throw new Error('Message not found');
        }

        const messageData = messageDoc.data();
        const poll = messageData.poll;

        if (!poll) {
          throw new Error('Message is not a poll');
        }

        console.log(`[POLL] Current votes:`, poll.votes);

        // Make a copy of the votes object
        const updatedVotes = { ...poll.votes };
        let totalVotes = poll.totalVotes || 0;
        let isToggle = false;

        // Check if user has already voted on any option
        for (const [idx, voterIds] of Object.entries(updatedVotes)) {
          const voterArray = Array.isArray(voterIds) ? voterIds : [];
          const voterIndex = voterArray.indexOf(user.uid);

          if (voterIndex !== -1) {
            // User has voted on this option before
            updatedVotes[parseInt(idx)] = voterArray.filter(
              (id) => id !== user.uid,
            );
            totalVotes--;

            if (parseInt(idx) === optionIndex) {
              // User is toggling (removing vote from) the same option
              isToggle = true;
              console.log(
                `[POLL] User ${user.uid} is toggling off option ${optionIndex}`,
              );
            }
          }
        }

        // Add the new vote (unless toggling off)
        if (!isToggle) {
          // Initialize the array if needed
          if (!updatedVotes[optionIndex]) {
            updatedVotes[optionIndex] = [];
          }

          // Add user's vote
          updatedVotes[optionIndex].push(user.uid);
          totalVotes++;
          console.log(
            `[POLL] User ${user.uid} voted for option ${optionIndex}`,
          );
        }

        console.log(`[POLL] Updated votes:`, updatedVotes);

        // Update the poll - use a transaction to ensure atomicity
        await updateDoc(messageRef, {
          'poll.votes': updatedVotes,
          'poll.totalVotes': totalVotes,
          'poll.lastUpdated': serverTimestamp(), // Add a timestamp to trigger real-time updates
        });

        console.log(`[POLL] Vote successfully saved`);
      } catch (error) {
        console.error('[POLL] Error voting in poll:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not vote in poll.',
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
            [`lastRead.${uid}`]: serverTimestamp(),
          });
          console.log(`Added member ${uid} to existing chat ${chatId}`);
        } else {
          // Document does not exist, create it
          await setDoc(chatRef, {
            memberIds: [uid], // Initialize the array
            createdAt: serverTimestamp(), // Optionally track when the chat was created
            hasMessages: false,
            lastRead: {
              [uid]: serverTimestamp(),
            },
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
        // If the members is not already there, no need to remove
        const chat = chats.find((chat) => chat.id === chatId);
        if (!chat || !chat.otherMembers.find((m) => m.uid === uid)) {
          console.log(`Member ${uid} not found in chat ${chatId}`);
          return;
        }
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

  // Listen to real-time updates in messages of a crew date chat
  const listenToMessages = useCallback(
    (chatId: string) => {
      if (!user?.uid) return () => {};

      // Clean up existing listener if any
      if (listenersRef.current[chatId]) {
        listenersRef.current[chatId]();
        delete listenersRef.current[chatId];
      }

      // Initialize pagination info if it doesn't exist
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

      // Create a separate listener for real-time updates to existing messages (for polls)
      // This ensures that poll vote updates are captured in real-time
      const pollUpdateListener = onSnapshot(
        messagesRef,
        async (querySnapshot) => {
          if (!user?.uid) return;

          try {
            // Handle modifications to existing messages (poll votes)
            const modifiedMessages = querySnapshot
              .docChanges()
              .filter((change) => change.type === 'modified')
              .map((change) => {
                const msgData = change.doc.data();
                const msgId = change.doc.id;

                // Only process if this is a poll
                if (msgData.poll) {
                  return {
                    id: msgId,
                    poll: msgData.poll,
                  };
                }
                return null;
              })
              // Use type assertion to tell TypeScript this won't be null
              .filter(
                (update): update is { id: string; poll: Poll } =>
                  update !== null,
              );

            // If we have modified poll messages, update them in our state
            if (modifiedMessages.length > 0) {
              setMessages((prev) => {
                const existingMessages = [...(prev[chatId] || [])];

                // Update each modified message - now TypeScript knows update isn't null
                modifiedMessages.forEach((update) => {
                  const msgIndex = existingMessages.findIndex(
                    (msg) => msg.id === update.id,
                  );
                  if (msgIndex !== -1) {
                    existingMessages[msgIndex] = {
                      ...existingMessages[msgIndex],
                      poll: update.poll,
                    };
                  }
                });

                return {
                  ...prev,
                  [chatId]: existingMessages,
                };
              });
            }
          } catch (error) {
            console.error('Error handling poll updates:', error);
          }
        },
        (error) => {
          if (!user?.uid) return;
          if (error.code === 'permission-denied') return;
          console.error('Error listening to poll updates:', error);
        },
      );

      // Modified to use limit and only get recent messages
      const msgQuery = query(
        messagesRef,
        orderBy('createdAt', 'desc'),
        limit(MESSAGES_PER_LOAD),
      );

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
          if (!user?.uid) return;
          try {
            // Store the last document for pagination
            const lastVisible =
              querySnapshot.docs.length > 0
                ? querySnapshot.docs[querySnapshot.docs.length - 1]
                : null;

            // Update pagination info with the last document
            setMessagePaginationInfo((prev) => ({
              ...prev,
              [chatId]: {
                ...(prev[chatId] || {}),
                hasMore: querySnapshot.docs.length >= MESSAGES_PER_LOAD,
                lastDoc: lastVisible,
                loading: false,
              },
            }));

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
                  imageUrl: msgData.imageUrl, // Add imageUrl if present
                  poll: msgData.poll, // Add poll if present
                };
              }),
            );

            // Sort messages by createdAt (ascending) before setting state
            const sortedMessages = fetchedMessages.sort(
              (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
            );

            setMessages((prev) => {
              // Preserve any previously loaded older messages
              const existingMessages = prev[chatId] || [];

              // Check for duplicate messages (in case we're refreshing)
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

              // Sort messages by date
              mergedMessages.sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
              );

              return { ...prev, [chatId]: mergedMessages };
            });

            const messagesToCache = sortedMessages.map((msg) => ({
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

      // Store both unsubscribe functions
      const combinedUnsubscribe = () => {
        unsubscribe();
        pollUpdateListener();
      };

      listenersRef.current[chatId] = combinedUnsubscribe;

      return combinedUnsubscribe;
    },
    [user?.uid, fetchUserDetailsWithRetry, messagePaginationInfo],
  );

  // Add function to load earlier messages
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

        if (querySnapshot.empty) {
          return false;
        }

        // Process and add older messages
        const olderMessages: Message[] = await Promise.all(
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
              imageUrl: msgData.imageUrl, // Add imageUrl if present
            };
          }),
        );

        // Sort older messages by date (ascending)
        const sortedOlderMessages = olderMessages.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );

        // Update messages state by prepending older messages
        setMessages((prev) => {
          const existingMessages = prev[chatId] || [];

          // Add older messages, avoiding duplicates
          const mergedMessages = [...existingMessages];

          sortedOlderMessages.forEach((oldMsg) => {
            const isDuplicate = mergedMessages.some(
              (existing) => existing.id === oldMsg.id,
            );
            if (!isDuplicate) {
              mergedMessages.unshift(oldMsg); // Add to the beginning
            }
          });

          // Sort all messages by date
          mergedMessages.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          );

          return { ...prev, [chatId]: mergedMessages };
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
          [chatId]: {
            ...prev[chatId],
            loading: false,
          },
        }));

        return false;
      }
    },
    [user?.uid, messagePaginationInfo, fetchUserDetailsWithRetry],
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
        loadEarlierMessages,
        messagePaginationInfo,
        createPoll,
        votePoll,
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
