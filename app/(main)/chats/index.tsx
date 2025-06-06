// app/(main)/chats/index.tsx

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useDirectMessages } from '@/context/DirectMessagesContext';
import { useCrewDateChat } from '@/context/CrewDateChatContext';
import { useCrewChat } from '@/context/CrewChatContext';
import { useCrews } from '@/context/CrewsContext';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  onSnapshot,
  Timestamp,
  doc,
} from 'firebase/firestore';
import { db } from '@/firebase';
import moment from 'moment';
import { useUser } from '@/context/UserContext';
import ScreenTitle from '@/components/ScreenTitle';
import CustomSearchInput from '@/components/CustomSearchInput';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import useGlobalStyles from '@/styles/globalStyles';
import { router, useNavigation } from 'expo-router';
import { FirebaseError } from 'firebase/app';
import Toast from 'react-native-toast-message';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { debounce } from 'lodash';
import {
  getCacheKey,
  getCachedData,
  setCachedData,
  usePerformanceMonitoring,
  TYPING_TIMEOUT,
} from '@/utils/chatUtils';
import { UserBatchFetcher } from '@/utils/chatContextUtils';

// Define the typing status interface
interface TypingStatus {
  [chatId: string]: string[]; // array of userIds typing in each chat
}

// Update CombinedChat to include the new 'crew' type
interface CombinedChat {
  id: string;
  type: 'direct' | 'group' | 'crew';
  title: string;
  iconUrl?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
  lastMessageImageUrl?: string;
  lastMessageIsPoll?: boolean;
  lastMessagePollQuestion?: string;
  unreadCount: number;
  isOnline?: boolean;
}

interface ChatMetadata {
  lastMessage?: string;
  lastMessageTime?: string;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
  imageUrl?: string;
  isPoll?: boolean;
  pollQuestion?: string;
}

const ChatsListScreen: React.FC = () => {
  const { dms, fetchUnreadCount: fetchDMUnreadCount } = useDirectMessages();
  const { chats: groupChats, fetchUnreadCount: fetchGroupUnreadCount } =
    useCrewDateChat();
  const { chats: crewChats, fetchUnreadCount: fetchCrewUnreadCount } =
    useCrewChat();
  const { crews, usersCache, setUsersCache, fetchCrew } = useCrews();
  const { user } = useUser();
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation();
  const isFocused = navigation.isFocused();

  const { recordCacheLoad, recordFullLoad, getMetrics } =
    usePerformanceMonitoring('chats_list');

  const userBatchFetcher = useMemo(
    () => new UserBatchFetcher(usersCache, setUsersCache),
    [usersCache, setUsersCache],
  );

  const [combinedChats, setCombinedChats] = useState<CombinedChat[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typingStatus, setTypingStatus] = useState<TypingStatus>({});
  const [navigatingChatId, setNavigatingChatId] = useState<string | null>(null);

  const senderNameCache = useRef<{ [senderId: string]: string }>({});
  const typingListenersRef = useRef<{ [key: string]: () => void }>({});
  const initialLoadCompleted = useRef<boolean>(false);

  const getSenderName = useCallback(
    async (senderId: string): Promise<string> => {
      if (senderNameCache.current[senderId]) {
        recordCacheLoad(true);
        return senderNameCache.current[senderId];
      }
      try {
        const users = await userBatchFetcher.fetchUserDetailsBatch(
          new Set([senderId]),
        );
        const user = users.find((u) => u.uid === senderId);
        if (user) {
          const name = user.displayName || 'Unknown';
          senderNameCache.current[senderId] = name;
          recordCacheLoad(false);
          return name;
        }
        recordCacheLoad(false);
        return 'Unknown';
      } catch (error) {
        console.warn('Failed to fetch sender name:', error);
        recordCacheLoad(false);
        return 'Unknown';
      }
    },
    [userBatchFetcher, recordCacheLoad],
  );

  const loadCachedChatData = useCallback((): CombinedChat[] => {
    const cacheKey = getCacheKey('combined', 'chats');
    const cachedData = getCachedData<{ data: CombinedChat[] }>(cacheKey);
    if (cachedData?.data) {
      recordCacheLoad(true);
      return cachedData.data.map((chat) => ({
        ...chat,
        lastMessageTime: chat.lastMessageTime
          ? new Date(chat.lastMessageTime)
          : undefined,
      }));
    }
    recordCacheLoad(false);
    return [];
  }, [recordCacheLoad]);

  const saveCachedChatData = useCallback((chats: CombinedChat[]) => {
    const cacheKey = getCacheKey('combined', 'chats');
    const dataToCache = chats.map((chat) => ({
      ...chat,
      lastMessageTime: chat.lastMessageTime
        ? chat.lastMessageTime.toISOString()
        : null,
    }));
    setCachedData(cacheKey, { data: dataToCache });
  }, []);

  const getChatMetadata = useCallback(
    (chatId: string): ChatMetadata | null => {
      const cacheKey = getCacheKey('metadata', chatId);
      const cachedData = getCachedData<ChatMetadata>(cacheKey);
      if (cachedData) {
        recordCacheLoad(true);
        return cachedData;
      }
      recordCacheLoad(false);
      return null;
    },
    [recordCacheLoad],
  );

  const saveChatMetadata = useCallback((chatId: string, data: ChatMetadata) => {
    const cacheKey = getCacheKey('metadata', chatId);
    setCachedData(cacheKey, data);
  }, []);

  const fetchLastMessageFromFirestore = useCallback(
    async (
      chatId: string,
      chatType: 'direct' | 'group' | 'crew',
    ): Promise<{
      text: string;
      senderId: string;
      senderName: string;
      createdAt: Date;
      imageUrl?: string;
      isPoll?: boolean;
      pollQuestion?: string;
    } | null> => {
      if (!user) return null;
      try {
        let messagesRef;
        if (chatType === 'direct') {
          messagesRef = collection(db, 'direct_messages', chatId, 'messages');
        } else if (chatType === 'group') {
          messagesRef = collection(db, 'crew_date_chats', chatId, 'messages');
        } else {
          // 'crew'
          messagesRef = collection(db, 'crews', chatId, 'messages');
        }

        const messagesQuery = query(
          messagesRef,
          orderBy('createdAt', 'desc'),
          limit(1),
        );
        const querySnapshot = await getDocs(messagesQuery);

        if (!querySnapshot.empty) {
          const docSnap = querySnapshot.docs[0];
          const msgData = docSnap.data();
          const senderId: string = msgData.senderId;
          const senderName = await getSenderName(senderId);

          return {
            text: msgData.text || '',
            senderId,
            senderName,
            createdAt: msgData.createdAt
              ? msgData.createdAt.toDate()
              : new Date(),
            imageUrl: msgData.imageUrl,
            isPoll: !!msgData.poll,
            pollQuestion: msgData.poll?.question || null,
          };
        }
        return null;
      } catch {
        return null;
      }
    },
    [user, getSenderName],
  );

  const fetchLastMessage = useCallback(
    async (chatId: string, chatType: 'direct' | 'group' | 'crew') => {
      const cached = getChatMetadata(chatId);
      if (
        cached?.lastMessage &&
        cached?.lastMessageTime &&
        cached.lastMessageSenderId
      ) {
        const cachedResult = {
          text: cached.lastMessage,
          senderId: cached.lastMessageSenderId,
          senderName: cached.lastMessageSenderName ?? 'Unknown',
          createdAt: new Date(cached.lastMessageTime),
          imageUrl: cached.imageUrl,
          isPoll: cached.isPoll,
          pollQuestion: cached.pollQuestion,
        };
        (async () => {
          const updated = await fetchLastMessageFromFirestore(chatId, chatType);
          if (
            updated &&
            updated.createdAt.getTime() !== cachedResult.createdAt.getTime()
          ) {
            saveChatMetadata(chatId, {
              lastMessage: updated.text,
              lastMessageTime: updated.createdAt.toISOString(),
              lastMessageSenderId: updated.senderId,
              lastMessageSenderName: updated.senderName,
              imageUrl: updated.imageUrl,
              isPoll: updated.isPoll,
              pollQuestion: updated.pollQuestion,
            });
          }
        })();
        return cachedResult;
      } else {
        const result = await fetchLastMessageFromFirestore(chatId, chatType);
        if (result) {
          saveChatMetadata(chatId, {
            lastMessage: result.text,
            lastMessageTime: result.createdAt.toISOString(),
            lastMessageSenderId: result.senderId,
            lastMessageSenderName: result.senderName,
            imageUrl: result.imageUrl,
            isPoll: result.isPoll,
            pollQuestion: result.pollQuestion,
          });
        }
        return result;
      }
    },
    [getChatMetadata, saveChatMetadata, fetchLastMessageFromFirestore],
  );

  const fetchUnreadFromFirestore = useCallback(
    async (
      chatId: string,
      chatType: 'direct' | 'group' | 'crew',
    ): Promise<number> => {
      if (chatType === 'direct') return await fetchDMUnreadCount(chatId);
      if (chatType === 'group') return await fetchGroupUnreadCount(chatId);
      if (chatType === 'crew') return await fetchCrewUnreadCount(chatId);
      return 0;
    },
    [fetchDMUnreadCount, fetchGroupUnreadCount, fetchCrewUnreadCount],
  );

  const getCrewName = useCallback(
    async (crewId: string): Promise<string> => {
      const crew = crews.find((c) => c.id === crewId);
      if (crew) return crew.name;
      const fetchedCrew = await fetchCrew(crewId);
      return fetchedCrew ? fetchedCrew.name : 'Unknown Crew';
    },
    [crews, fetchCrew],
  );

  const getFormattedChatDate = useCallback((chatId: string): string => {
    const date = chatId.split('_')[1];
    return moment(date).format('MMM Do');
  }, []);

  const getIconUrlForCrew = useCallback(
    (crewId: string): string | undefined => {
      const crew = crews.find((c) => c.id === crewId);
      return crew?.iconUrl;
    },
    [crews],
  );

  const debouncedUpdateTypingStatus = useMemo(
    () =>
      debounce((chatId: string, typingUsers: string[]) => {
        setTypingStatus((prev) => ({ ...prev, [chatId]: typingUsers }));
      }, 300),
    [],
  );

  const allChatItems = useMemo(
    () => [
      ...dms.map((dm) => ({ id: dm.id, type: 'direct' as const })),
      ...groupChats.map((gc) => ({ id: gc.id, type: 'group' as const })),
      ...crewChats.map((cc) => ({ id: cc.id, type: 'crew' as const })),
    ],
    [dms, groupChats, crewChats],
  );

  // FIX: This useEffect now intelligently manages listeners instead of resetting them on every render.
  useEffect(() => {
    if (!user?.uid || !isFocused) {
      // If not focused, clean up all listeners.
      Object.values(typingListenersRef.current).forEach((unsub) => unsub());
      typingListenersRef.current = {};
      return;
    }

    const currentListenerKeys = new Set(
      Object.keys(typingListenersRef.current),
    );
    const allChatItemMap = new Map(
      allChatItems.map((chat) => [`${chat.type}_${chat.id}`, chat]),
    );

    // Subscribe to new chats that don't have a listener yet.
    allChatItemMap.forEach((chat, key) => {
      if (!currentListenerKeys.has(key)) {
        let collectionPath;
        if (chat.type === 'direct') collectionPath = 'direct_messages';
        else if (chat.type === 'group') collectionPath = 'crew_date_chats';
        else collectionPath = 'crews';

        const docPath =
          chat.type === 'crew'
            ? doc(db, collectionPath, chat.id, 'messages', 'metadata')
            : doc(db, collectionPath, chat.id);

        const unsubscribe = onSnapshot(docPath, (docSnap) => {
          if (!docSnap.exists() || !user?.uid) return;
          const data = docSnap.data();
          if (data.typingStatus) {
            const typingUsers = Object.keys(data.typingStatus)
              .filter((k) => !k.endsWith('LastUpdate') && k !== user.uid)
              .filter((uid) => {
                const lastUpdate = data.typingStatus[`${uid}LastUpdate`];
                return (
                  data.typingStatus[uid] &&
                  lastUpdate &&
                  Date.now() - (lastUpdate as Timestamp).toMillis() <
                    TYPING_TIMEOUT * 10
                );
              });
            debouncedUpdateTypingStatus(chat.id, typingUsers);
          } else {
            debouncedUpdateTypingStatus(chat.id, []);
          }
        });
        typingListenersRef.current[key] = unsubscribe;
      }
    });

    // Unsubscribe from chats that are no longer in the user's list.
    currentListenerKeys.forEach((key) => {
      if (!allChatItemMap.has(key)) {
        typingListenersRef.current[key]();
        delete typingListenersRef.current[key];
        const chatId = key.split('_').slice(1).join('_');
        setTypingStatus((prev) => {
          const newState = { ...prev };
          delete newState[chatId];
          return newState;
        });
      }
    });

    return () => {
      debouncedUpdateTypingStatus.cancel();
    };
  }, [isFocused, user?.uid, allChatItems, debouncedUpdateTypingStatus]);

  const combineChats = useCallback(async () => {
    if (!user) return;

    if (!initialLoadCompleted.current) {
      // Only reset metrics on the very first load
    }

    const cachedCombined = loadCachedChatData();
    if (
      cachedCombined.length > 0 &&
      !isFocused &&
      initialLoadCompleted.current
    ) {
      setCombinedChats(cachedCombined);
      setLoading(false);
      return;
    }

    try {
      const allUserIds = new Set<string>();
      dms.forEach((dm) =>
        dm.participants.forEach((uid) => allUserIds.add(uid)),
      );
      if (allUserIds.size > 0)
        await userBatchFetcher.fetchUserDetailsBatch(allUserIds);

      const dmPromises = dms.map(async (dm) => {
        const otherParticipant = usersCache[dm.participants[0]] || {
          displayName: 'Unknown',
          isOnline: false,
          photoURL: undefined,
        };
        const lastMsg = await fetchLastMessage(dm.id, 'direct');
        const unreadCount = await fetchUnreadFromFirestore(dm.id, 'direct');
        return {
          id: dm.id,
          type: 'direct' as const,
          title: otherParticipant.displayName,
          iconUrl: otherParticipant.photoURL,
          lastMessage: lastMsg?.text,
          lastMessageTime: lastMsg?.createdAt,
          lastMessageSenderId: lastMsg?.senderId,
          lastMessageSenderName: lastMsg?.senderName,
          lastMessageImageUrl: lastMsg?.imageUrl,
          lastMessageIsPoll: lastMsg?.isPoll,
          lastMessagePollQuestion: lastMsg?.pollQuestion,
          unreadCount,
          isOnline: otherParticipant.isOnline,
        };
      });

      const groupChatPromises = groupChats.map(async (gc) => {
        const crewName = await getCrewName(gc.id.split('_')[0]);
        const chatDate = getFormattedChatDate(gc.id);
        const lastMsg = await fetchLastMessage(gc.id, 'group');
        const unreadCount = await fetchUnreadFromFirestore(gc.id, 'group');
        return {
          id: gc.id,
          type: 'group' as const,
          title: `${crewName} (${chatDate})`,
          iconUrl: getIconUrlForCrew(gc.id.split('_')[0]),
          lastMessage: lastMsg?.text,
          lastMessageTime: lastMsg?.createdAt,
          lastMessageSenderId: lastMsg?.senderId,
          lastMessageSenderName: lastMsg?.senderName,
          lastMessageImageUrl: lastMsg?.imageUrl,
          lastMessageIsPoll: lastMsg?.isPoll,
          lastMessagePollQuestion: lastMsg?.pollQuestion,
          unreadCount,
        };
      });

      const crewChatPromises = crewChats.map(async (cc) => {
        const lastMsg = await fetchLastMessage(cc.id, 'crew');
        const unreadCount = await fetchUnreadFromFirestore(cc.id, 'crew');
        return {
          id: cc.id,
          type: 'crew' as const,
          title: cc.crewName,
          iconUrl: cc.avatarUrl,
          lastMessage: lastMsg?.text,
          lastMessageTime: lastMsg?.createdAt,
          lastMessageSenderId: lastMsg?.senderId,
          lastMessageSenderName: lastMsg?.senderName,
          lastMessageImageUrl: lastMsg?.imageUrl,
          lastMessageIsPoll: lastMsg?.isPoll,
          lastMessagePollQuestion: lastMsg?.pollQuestion,
          unreadCount,
        };
      });

      const [directData, groupData, crewData] = await Promise.all([
        Promise.all(dmPromises),
        Promise.all(groupChatPromises),
        Promise.all(crewChatPromises),
      ]);

      const combined = [...directData, ...groupData, ...crewData].sort(
        (a, b) =>
          (b.lastMessageTime?.getTime() || 0) -
          (a.lastMessageTime?.getTime() || 0),
      );

      setCombinedChats(combined);
      saveCachedChatData(combined);
    } catch (error) {
      if (
        error instanceof Error ||
        (error instanceof FirebaseError && error.message.includes('offline'))
      ) {
        Toast.show({
          text1: 'Error',
          text2: 'Failed to load chats. Check your connection.',
          type: 'error',
        });
      } else {
        console.error('Error combining chats:', error);
      }
    } finally {
      if (!initialLoadCompleted.current) {
        recordFullLoad();
        if (__DEV__) console.log('🚀 Chats List Performance:', getMetrics());
        initialLoadCompleted.current = true;
      }
      setLoading(false);
    }
  }, [
    user,
    dms,
    groupChats,
    crewChats,
    getCrewName,
    getFormattedChatDate,
    getIconUrlForCrew,
    fetchLastMessage,
    fetchUnreadFromFirestore,
    loadCachedChatData,
    saveCachedChatData,
    isFocused,
    usersCache,
    userBatchFetcher,
    recordFullLoad,
    getMetrics,
  ]);

  useEffect(() => {
    combineChats();
  }, [isFocused, dms, groupChats, crewChats, combineChats]);

  const filteredChats = useMemo(() => {
    if (searchQuery.trim() === '') {
      return combinedChats;
    }
    return combinedChats.filter((chat) =>
      chat.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery, combinedChats]);

  const handleNavigation = useCallback(
    (chatId: string, chatType: 'direct' | 'group' | 'crew') => {
      setNavigatingChatId(chatId);
      if (chatType === 'direct') {
        const otherUserId = chatId.split('_').find((uid) => uid !== user?.uid);
        if (otherUserId)
          router.push({ pathname: '/chats/dm-chat', params: { otherUserId } });
      } else if (chatType === 'group') {
        const [crewId, date] = chatId.split('_');
        router.push({
          pathname: '/chats/crew-date-chat',
          params: { crewId, date, id: chatId },
        });
      } else {
        // 'crew'
        router.push({
          pathname: '/chats/crew-chat',
          params: { crewId: chatId },
        });
      }
      setTimeout(() => setNavigatingChatId(null), 100);
    },
    [user?.uid],
  );

  const getTypingIndicatorText = useCallback(
    (chatId: string, chatType: 'direct' | 'group' | 'crew') => {
      const typingUserIds = typingStatus[chatId] || [];
      if (typingUserIds.length === 0) return null;
      if (chatType === 'direct') return 'typing...';

      const typingNames = typingUserIds
        .map((uid) => usersCache[uid]?.displayName || 'Someone')
        .slice(0, 2);
      if (typingNames.length === 1) return `${typingNames[0]} is typing...`;
      if (typingNames.length === 2)
        return `${typingNames[0]} and ${typingNames[1]} are typing...`;
      return `${typingNames[0]} and ${typingUserIds.length - 1} others are typing...`;
    },
    [typingStatus, usersCache],
  );

  const renderItem = useCallback(
    ({ item }: { item: CombinedChat }) => {
      const typingIndicator = getTypingIndicatorText(item.id, item.type);
      const isNavigating = navigatingChatId === item.id;

      return (
        <TouchableOpacity
          style={[styles.chatItem, isNavigating && styles.chatItemPressed]}
          onPress={() => handleNavigation(item.id, item.type)}
          activeOpacity={0.7}
        >
          <View style={styles.avatar}>
            <ProfilePicturePicker
              size={55}
              imageUrl={item.iconUrl ?? null}
              iconName={
                item.type === 'direct' ? 'person-outline' : 'people-outline'
              }
              editable={false}
              onImageUpdate={() => {}}
              isOnline={item.isOnline ?? false}
            />
          </View>
          <View style={styles.chatDetails}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {item.lastMessageTime && !typingIndicator && !isNavigating && (
                <Text style={styles.chatTimestamp}>
                  {moment(item.lastMessageTime).fromNow()}
                </Text>
              )}
              {isNavigating && (
                <View style={styles.navigatingIndicator}>
                  <ActivityIndicator size="small" color="#0a84ff" />
                </View>
              )}
            </View>
            <Text
              style={
                typingIndicator ? styles.typingText : styles.chatLastMessage
              }
              numberOfLines={2}
            >
              {typingIndicator ||
                (item.lastMessageImageUrl ? (
                  <>
                    <Text style={styles.senderName}>
                      {item.lastMessageSenderName}:{' '}
                    </Text>
                    <Ionicons name="image-outline" size={14} color="#555" />
                    <Text> Image</Text>
                  </>
                ) : item.lastMessageIsPoll ? (
                  <>
                    <Text style={styles.senderName}>
                      {item.lastMessageSenderName}:{' '}
                    </Text>
                    <Ionicons
                      name="stats-chart-outline"
                      size={14}
                      color="#555"
                    />
                    <Text> {item.lastMessagePollQuestion || 'Poll'}</Text>
                  </>
                ) : item.lastMessage ? (
                  <>
                    <Text style={styles.senderName}>
                      {item.lastMessageSenderName}:{' '}
                    </Text>
                    <Text>{item.lastMessage}</Text>
                  </>
                ) : (
                  'No messages yet.'
                ))}
            </Text>
          </View>
          {item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [getTypingIndicatorText, handleNavigation, navigatingChatId],
  );

  const keyExtractor = useCallback(
    (item: CombinedChat) => `${item.type}_${item.id}`,
    [],
  );
  const ItemSeparatorComponent = useCallback(
    () => <View style={styles.separator} />,
    [],
  );
  const ListEmptyComponent = useCallback(
    () => <Text style={styles.emptyText}>No chats available.</Text>,
    [],
  );

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#0a84ff" />
      </View>
    );
  }

  return (
    <View style={globalStyles.container}>
      <ScreenTitle title="Chats" />
      <CustomSearchInput
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />
      <FlatList
        data={filteredChats}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={ItemSeparatorComponent}
        ListEmptyComponent={ListEmptyComponent}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={10}
        getItemLayout={(data, index) => ({
          length: 85,
          offset: 85 * index,
          index,
        })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  chatItem: {
    flexDirection: 'row',
    paddingVertical: 15,
    alignItems: 'center',
    position: 'relative',
  },
  chatItemPressed: { opacity: 0.6, backgroundColor: '#f0f0f0' },
  navigatingIndicator: { position: 'absolute', right: 0 },
  avatar: { marginRight: 15 },
  chatDetails: { flex: 1 },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    paddingRight: 20,
  },
  chatTimestamp: {
    fontSize: 12,
    color: '#999',
    position: 'absolute',
    right: 0,
  },
  chatTitle: { fontSize: 16, fontWeight: '600', maxWidth: '80%' },
  chatLastMessage: { fontSize: 14, color: '#555', marginTop: 4 },
  typingText: {
    fontSize: 14,
    color: '#0a84ff',
    fontStyle: 'italic',
    marginTop: 4,
  },
  senderName: { color: '#555', fontWeight: '500' },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 85 },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#999',
  },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  unreadBadge: {
    position: 'absolute',
    right: 0,
    top: 48,
    backgroundColor: '#0a84ff',
    borderRadius: 12,
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

export default ChatsListScreen;
