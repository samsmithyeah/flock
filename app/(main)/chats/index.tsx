// // app/(main)/chats/index.tsx

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { useCrews } from '@/context/CrewsContext';
import {
  getDoc,
  doc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '@/firebase';
import moment from 'moment';
import { useUser } from '@/context/UserContext';
import ScreenTitle from '@/components/ScreenTitle';
import CustomSearchInput from '@/components/CustomSearchInput';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import { storage } from '@/storage';
import useGlobalStyles from '@/styles/globalStyles';
import { router, useNavigation } from 'expo-router';

interface CombinedChat {
  id: string;
  type: 'direct' | 'group';
  title: string;
  iconUrl?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
  unreadCount: number;
  isOnline?: boolean;
}

interface ChatMetadata {
  lastMessage?: string;
  lastMessageTime?: string;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
}

const ChatsListScreen: React.FC = () => {
  const { dms, fetchUnreadCount: fetchDMUnreadCount } = useDirectMessages();
  const { chats: groupChats, fetchUnreadCount: fetchGroupUnreadCount } =
    useCrewDateChat();
  const { crews, usersCache, fetchCrew } = useCrews();
  const { user } = useUser();
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation();
  const isFocused = navigation.isFocused();

  const [combinedChats, setCombinedChats] = useState<CombinedChat[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredChats, setFilteredChats] = useState<CombinedChat[]>([]);

  const senderNameCache = useRef<{ [senderId: string]: string }>({});

  const getSenderName = useCallback(
    async (senderId: string): Promise<string> => {
      if (senderNameCache.current[senderId]) {
        return senderNameCache.current[senderId];
      } else if (usersCache[senderId]) {
        senderNameCache.current[senderId] = usersCache[senderId].displayName;
        return usersCache[senderId].displayName;
      }
      try {
        const senderDoc = await getDoc(doc(db, 'users', senderId));
        if (senderDoc.exists()) {
          const senderData = senderDoc.data();
          const senderName = senderData.displayName || 'Unknown';
          senderNameCache.current[senderId] = senderName;
          return senderName;
        } else {
          return 'Unknown';
        }
      } catch {
        return 'Unknown';
      }
    },
    [usersCache],
  );

  const loadCachedChatData = useCallback((): CombinedChat[] => {
    const cachedDataString = storage.getString('combinedChats');
    if (!cachedDataString) return [];
    try {
      const cachedData = JSON.parse(cachedDataString) as CombinedChat[];
      return cachedData.map((chat) => ({
        ...chat,
        lastMessageTime: chat.lastMessageTime
          ? new Date(chat.lastMessageTime)
          : undefined,
      }));
    } catch {
      return [];
    }
  }, []);

  const saveCachedChatData = useCallback((chats: CombinedChat[]) => {
    const dataToCache = chats.map((chat) => ({
      ...chat,
      lastMessageTime: chat.lastMessageTime
        ? chat.lastMessageTime.toISOString()
        : null,
    }));
    storage.set('combinedChats', JSON.stringify(dataToCache));
  }, []);

  const getChatMetadata = useCallback((chatId: string): ChatMetadata | null => {
    const dataString = storage.getString(`chatMetadata_${chatId}`);
    if (!dataString) return null;
    return JSON.parse(dataString) as ChatMetadata;
  }, []);

  const saveChatMetadata = useCallback((chatId: string, data: ChatMetadata) => {
    storage.set(`chatMetadata_${chatId}`, JSON.stringify(data));
  }, []);

  const fetchLastMessageFromFirestore = useCallback(
    async (
      chatId: string,
      chatType: 'direct' | 'group',
    ): Promise<{
      text: string;
      senderId: string;
      senderName: string;
      createdAt: Date;
    } | null> => {
      if (!user) return null;
      try {
        const messagesRef =
          chatType === 'direct'
            ? collection(db, 'direct_messages', chatId, 'messages')
            : collection(db, 'crew_date_chats', chatId, 'messages');
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
            text: msgData.text,
            senderId,
            senderName,
            createdAt: msgData.createdAt
              ? msgData.createdAt.toDate()
              : new Date(),
          };
        } else {
          return null;
        }
      } catch {
        return null;
      }
    },
    [user, getSenderName],
  );

  const fetchLastMessage = useCallback(
    async (chatId: string, chatType: 'direct' | 'group') => {
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
        };
        (async () => {
          const updated = await fetchLastMessageFromFirestore(chatId, chatType);
          if (
            updated &&
            (updated.text !== cachedResult.text ||
              updated.senderId !== cachedResult.senderId ||
              updated.senderName !== cachedResult.senderName ||
              updated.createdAt.getTime() !== cachedResult.createdAt.getTime())
          ) {
            saveChatMetadata(chatId, {
              ...cached,
              lastMessage: updated.text,
              lastMessageTime: updated.createdAt.toISOString(),
              lastMessageSenderId: updated.senderId,
              lastMessageSenderName: updated.senderName,
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
          });
        }
        return result;
      }
    },
    [getChatMetadata, saveChatMetadata, fetchLastMessageFromFirestore],
  );

  const fetchUnreadFromFirestore = useCallback(
    async (chatId: string, chatType: 'direct' | 'group'): Promise<number> => {
      if (chatType === 'direct') {
        return await fetchDMUnreadCount(chatId);
      } else {
        return await fetchGroupUnreadCount(chatId);
      }
    },
    [fetchDMUnreadCount, fetchGroupUnreadCount],
  );

  const getCrewName = useCallback(
    async (chatId: string): Promise<string> => {
      const crewId = chatId.split('_')[0];
      const crew = crews.find((c) => c.id === crewId);
      if (crew) {
        return crew.name;
      } else {
        const crew = await fetchCrew(crewId);
        return crew ? crew.name : 'Unknown Crew';
      }
    },
    [crews],
  );

  const getFormattedChatDate = useCallback((chatId: string): string => {
    const date = chatId.split('_')[1];
    return moment(date).format('MMM Do');
  }, []);

  const getIconUrlForCrew = useCallback(
    (chatId: string): string | undefined => {
      const crewId = chatId.split('_')[0];
      const crew = crews.find((c) => c.id === crewId);
      return crew?.iconUrl;
    },
    [crews],
  );

  const combineChats = useCallback(async () => {
    if (!user) return;
    const cachedCombined = loadCachedChatData();
    if (cachedCombined.length > 0 && !isFocused) {
      setCombinedChats(cachedCombined);
      setFilteredChats(cachedCombined);
      setLoading(false);
    }

    try {
      // For direct messages, we now resolve participant UIDs using usersCache.
      const directMessagesPromises = dms.map(async (dm) => {
        // dm.participants is now an array of UIDs. Resolve each:
        const resolvedParticipants = dm.participants.map(
          (uid) =>
            usersCache[uid] || {
              displayName: 'Unknown',
              photoURL: null,
              isOnline: false,
            },
        );
        const title = resolvedParticipants.map((u) => u.displayName).join(', ');
        const iconUrl = resolvedParticipants[0]?.photoURL;
        const lastMsg = await fetchLastMessage(dm.id, 'direct');
        const unreadCount = await fetchUnreadFromFirestore(dm.id, 'direct');
        const isOnline = resolvedParticipants[0]?.isOnline ?? false;

        return {
          id: dm.id,
          type: 'direct' as const,
          title,
          iconUrl,
          lastMessage: lastMsg?.text,
          lastMessageTime: lastMsg?.createdAt,
          lastMessageSenderId: lastMsg?.senderId,
          lastMessageSenderName: lastMsg?.senderName,
          unreadCount,
          isOnline,
        };
      });

      const groupChatsPromises = groupChats.map(async (gc) => {
        const crewName = await getCrewName(gc.id);
        const chatDate = getFormattedChatDate(gc.id);
        const title = `${crewName} (${chatDate})`;
        const iconUrl = getIconUrlForCrew(gc.id);
        const lastMsg = await fetchLastMessage(gc.id, 'group');
        const unreadCount = await fetchUnreadFromFirestore(gc.id, 'group');

        return {
          id: gc.id,
          type: 'group' as const,
          title,
          iconUrl,
          lastMessage: lastMsg?.text,
          lastMessageTime: lastMsg?.createdAt,
          lastMessageSenderId: lastMsg?.senderId,
          lastMessageSenderName: lastMsg?.senderName,
          unreadCount,
        };
      });

      const [directMessages, groupChatsData] = await Promise.all([
        Promise.all(directMessagesPromises),
        Promise.all(groupChatsPromises),
      ]);

      const combined = [...directMessages, ...groupChatsData];
      combined.sort((a, b) => {
        if (a.lastMessageTime && b.lastMessageTime) {
          return b.lastMessageTime.getTime() - a.lastMessageTime.getTime();
        } else if (a.lastMessageTime) {
          return -1;
        } else if (b.lastMessageTime) {
          return 1;
        } else {
          return 0;
        }
      });

      setCombinedChats(combined);
      setFilteredChats(
        searchQuery.trim()
          ? combined.filter((chat) =>
              chat.title.toLowerCase().includes(searchQuery.toLowerCase()),
            )
          : combined,
      );
      saveCachedChatData(combined);
    } catch (error) {
      console.error('Error combining chats:', error);
    } finally {
      setLoading(false);
    }
  }, [
    dms,
    groupChats,
    getCrewName,
    getFormattedChatDate,
    getIconUrlForCrew,
    fetchLastMessage,
    fetchUnreadFromFirestore,
    loadCachedChatData,
    saveCachedChatData,
    searchQuery,
    isFocused,
    user,
    usersCache,
  ]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredChats(combinedChats);
    } else {
      const filtered = combinedChats.filter((chat) =>
        chat.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      setFilteredChats(filtered);
    }
  }, [searchQuery, combinedChats]);

  const handleNavigation = useCallback(
    (chatId: string, chatType: 'direct' | 'group') => {
      if (chatType === 'direct') {
        const otherUserId = chatId.split('_').find((uid) => uid !== user?.uid);
        if (otherUserId) {
          router.push({
            pathname: '/chats/dm-chat',
            params: { otherUserId },
          });
        }
      } else {
        const crewId = chatId.split('_')[0];
        const date = chatId.split('_')[1];
        router.push({
          pathname: '/chats/crew-date-chat',
          params: { crewId, date, id: chatId },
        });
      }
    },
    [navigation, user?.uid],
  );

  useEffect(() => {
    combineChats();
  }, [isFocused, dms, groupChats, combineChats]);

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#0a84ff" />
      </View>
    );
  }

  const renderItem = ({ item }: { item: CombinedChat }) => (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => handleNavigation(item.id, item.type)}
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
          {item.lastMessageTime && (
            <Text style={styles.chatTimestamp}>
              {moment(item.lastMessageTime).fromNow()}
            </Text>
          )}
        </View>
        <Text style={styles.chatLastMessage} numberOfLines={2}>
          {item.lastMessage ? (
            item.lastMessageSenderName ? (
              <Text>
                <Text key="sender" style={styles.senderName}>
                  {item.lastMessageSenderName}:{' '}
                </Text>
                <Text key="message">{item.lastMessage}</Text>
              </Text>
            ) : (
              item.lastMessage
            )
          ) : (
            'No messages yet.'
          )}
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

  return (
    <View style={globalStyles.container}>
      <ScreenTitle title="Chats" />
      <CustomSearchInput
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />
      <FlatList
        data={filteredChats}
        keyExtractor={(item) => item.title + item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No chats available.</Text>
        }
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
  avatar: {
    marginRight: 15,
  },
  chatDetails: {
    flex: 1,
  },
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
  chatTitle: {
    fontSize: 16,
    fontWeight: '600',
    maxWidth: '80%',
  },
  chatLastMessage: {
    fontSize: 14,
    color: '#555',
    marginTop: 4,
    flexDirection: 'row',
    flex: 1,
  },
  senderName: {
    color: '#555',
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginLeft: 85,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#999',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ChatsListScreen;
