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

interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: Date;
  senderName?: string;
}

interface DirectMessage {
  id: string;
  participants: string[];
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

  const listenersRef = useRef<{ [dmId: string]: () => void }>({});
  const pendingUserFetches = useRef<{ [uid: string]: Promise<any> }>({});

  // Compute the unread count for a specific DM from the locally cached state.
  const computeUnreadCountForDM = useCallback(
    (dmId: string): number => {
      if (!user?.uid) return 0;
      const dm = dms.find((dm) => dm.id === dmId);
      if (!dm) return 0;
      const dmMessages = messages[dmId] || [];
      // Convert the stored lastRead to a Date.
      let lastReadDate: Date | null = null;
      const lastRead = dm.lastRead[user.uid];
      if (lastRead && typeof lastRead.toDate === 'function') {
        lastReadDate = lastRead.toDate();
      }
      if (!lastReadDate) {
        return dmMessages.length;
      }
      // Compare using getTime() for both Date objects.
      return dmMessages.filter(
        (msg) => msg.createdAt.getTime() > lastReadDate!.getTime(),
      ).length;
    },
    [user?.uid, dms, messages],
  );

  // Updated fetchUnreadCount: it now uses the local state to compute unread count.
  const fetchUnreadCount = useCallback(
    async (dmId: string): Promise<number> => {
      return computeUnreadCountForDM(dmId);
    },
    [computeUnreadCountForDM],
  );

  // Compute total unread messages (for DMs not in activeChats) from local state.
  useEffect(() => {
    if (!user?.uid || dms.length === 0) {
      setTotalUnread(0);
      return;
    }
    const total = dms
      .filter((dm) => !activeChats.has(dm.id))
      .reduce((acc, dm) => acc + computeUnreadCountForDM(dm.id), 0);
    setTotalUnread(total);
  }, [user?.uid, dms, messages, activeChats, computeUnreadCountForDM]);

  // --- The rest of your functions remain unchanged ---

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

  const sendMessage = useCallback(
    async (dmId: string, text: string) => {
      if (!user?.uid) return;
      try {
        console.log('getDoc in sendMessage');
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

  const listenToDMMessages = useCallback(
    (dmId: string) => {
      if (!user?.uid) return () => {};
      const messagesRef = collection(db, 'direct_messages', dmId, 'messages');
      const msgQuery = query(messagesRef, orderBy('createdAt', 'asc'));

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
          if (!user?.uid) return;
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
    [user?.uid, user?.displayName, usersCache, fetchUserDetails],
  );

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

  const fetchDirectMessages = useCallback(async () => {
    if (!user?.uid) {
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
      console.log('getDocs in fetchDirectMessages');
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
