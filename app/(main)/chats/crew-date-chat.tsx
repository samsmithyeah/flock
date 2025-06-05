// app/(main)/chats/crew-date-chat.tsx

import React, {
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useCallback,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  Text,
  AppState,
  AppStateStatus,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {
  GiftedChat,
  Bubble,
  Send,
  SendProps,
  AvatarProps,
  InputToolbar,
  Actions,
  MessageImageProps,
  MessageProps,
} from 'react-native-gifted-chat';
import { useUser } from '@/context/UserContext';
import { useCrewDateChat } from '@/context/CrewDateChatContext';
import { useCrews } from '@/context/CrewsContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import { generateChatId } from '@/utils/chatHelpers';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { User } from '@/types/User';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import { debounce } from 'lodash';
import moment from 'moment';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { pickImage, uploadImage, takePhoto } from '@/utils/imageUpload';
import ChatImageViewer from '@/components/ChatImageViewer';
import ImageOptionsMenu from '@/components/ImageOptionsMenu';
import PollCreationModal from '@/components/PollCreationModal';
import PollMessage from '@/components/PollMessage';
import {
  getCacheKey,
  getCachedData,
  setCachedData,
  usePerformanceMonitoring,
  useTypingHandler,
  useOptimisticMessages,
  ensureMessagesArray,
  cleanupLegacyCache,
  ExtendedMessage,
  CachedMemberData,
  TYPING_TIMEOUT,
  READ_UPDATE_DEBOUNCE,
} from '@/utils/chatUtils';

// ============================================================================
// CREW-SPECIFIC CACHE INTERFACES
// ============================================================================

interface CachedCrewData {
  name: string;
  iconUrl?: string;
  timestamp: number;
}

// ============================================================================
// CREW-SPECIFIC CACHE INTERFACES
// ============================================================================

interface CachedCrewData {
  name: string;
  iconUrl?: string;
  timestamp: number;
}

// ============================================================================
// CREW-SPECIFIC CACHE INTERFACES
// ============================================================================

interface CachedCrewData {
  name: string;
  iconUrl?: string;
  timestamp: number;
}

// Custom hooks for crew-specific state management with MMKV caching
const useChatState = (
  chatId: string | null,
  user: any,
  recordCacheLoad: (isHit: boolean) => void,
) => {
  // Initialize with cached data for instant loading using crew-specific cache keys
  const [otherMembers, setOtherMembers] = useState<User[]>(() => {
    if (!chatId) return [];
    const cachedMembers = getCachedData<CachedMemberData>(
      `crew_chat_members_${chatId}`, // Use crew-specific cache key
    );
    const hasCache = Boolean(
      cachedMembers?.members && cachedMembers.members.length > 0,
    );
    recordCacheLoad(hasCache);
    return cachedMembers?.members || [];
  });

  const [crew, setCrew] = useState<{ name: string; iconUrl?: string } | null>(
    () => {
      if (!chatId) return null;
      const cachedCrew = getCachedData<CachedCrewData>(
        `crew_chat_crew_${chatId}`, // Use crew-specific cache key
      );
      const hasCache = Boolean(cachedCrew && cachedCrew.name);
      recordCacheLoad(hasCache);
      return cachedCrew
        ? { name: cachedCrew.name, iconUrl: cachedCrew.iconUrl }
        : null;
    },
  );

  const [otherUsersTyping, setOtherUsersTyping] = useState<
    Record<string, boolean>
  >(() => {
    if (!chatId) return {};
    const cachedState = getCachedData<any>(
      `crew_chat_state_${chatId}`, // Use crew-specific cache key
    );
    const hasCache = Boolean(cachedState?.otherUsersTyping);
    recordCacheLoad(hasCache);
    return cachedState?.otherUsersTyping || {};
  });

  const [lastReadByUsers, setLastReadByUsers] = useState<Record<string, Date>>(
    () => {
      if (!chatId) return {};
      const cachedState = getCachedData<any>(
        `crew_chat_state_${chatId}`, // Use crew-specific cache key
      );
      const hasCache = Boolean(cachedState?.lastReadByUsers);
      recordCacheLoad(hasCache);
      return cachedState?.lastReadByUsers || {};
    },
  );

  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isImageMenuVisible, setIsImageMenuVisible] = useState(false);
  const [isPollModalVisible, setIsPollModalVisible] = useState(false);

  // Cache crew data when it changes
  useEffect(() => {
    if (chatId && crew) {
      setCachedData(`crew_chat_crew_${chatId}`, {
        name: crew.name,
        iconUrl: crew.iconUrl,
      });
    }
  }, [chatId, crew]);

  // Cache members when they change
  useEffect(() => {
    if (chatId && otherMembers.length > 0) {
      setCachedData(`crew_chat_members_${chatId}`, { members: otherMembers });
    }
  }, [chatId, otherMembers]);

  // Cache chat state when it changes
  useEffect(() => {
    if (chatId) {
      setCachedData(`crew_chat_state_${chatId}`, {
        lastReadByUsers,
        otherUsersTyping,
      });
    }
  }, [chatId, lastReadByUsers, otherUsersTyping]);

  return {
    otherMembers,
    setOtherMembers,
    crew,
    setCrew,
    otherUsersTyping,
    setOtherUsersTyping,
    lastReadByUsers,
    setLastReadByUsers,
    isLoadingEarlier,
    setIsLoadingEarlier,
    isUploading,
    setIsUploading,
    isImageMenuVisible,
    setIsImageMenuVisible,
    isPollModalVisible,
    setIsPollModalVisible,
  };
};

const CrewDateChatScreen: React.FC = () => {
  const { crewId, date, id } = useLocalSearchParams<{
    crewId: string;
    date: string;
    id?: string;
  }>();

  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const tabBarHeight = useBottomTabBarHeight();

  const { user, addActiveChat, removeActiveChat } = useUser();
  const { crews, usersCache, setUsersCache } = useCrews();
  const {
    sendMessage,
    updateLastRead,
    messages,
    listenToMessages,
    loadEarlierMessages,
    messagePaginationInfo,
    createPoll,
    votePoll,
  } = useCrewDateChat();

  const chatId = useMemo(() => {
    if (id) return id;
    if (crewId && date) return generateChatId(crewId, date);
    return null;
  }, [crewId, date, id]);

  // Performance monitoring
  const { recordCacheLoad, recordFullLoad } = usePerformanceMonitoring(chatId);

  const {
    otherMembers,
    setOtherMembers,
    crew,
    setCrew,
    otherUsersTyping,
    setOtherUsersTyping,
    lastReadByUsers,
    setLastReadByUsers,
    isLoadingEarlier,
    setIsLoadingEarlier,
    isUploading,
    setIsUploading,
    isImageMenuVisible,
    setIsImageMenuVisible,
    isPollModalVisible,
    setIsPollModalVisible,
  } = useChatState(chatId, user, recordCacheLoad);

  const conversationMessages = useMemo(() => {
    if (!chatId || !messages || !messages[chatId]) return [];
    return ensureMessagesArray(messages[chatId], chatId);
  }, [chatId, messages]);

  const paginationInfo = chatId ? messagePaginationInfo[chatId] : undefined;

  // ============================================================================
  // ONE-TIME CACHE CLEANUP
  // ============================================================================

  // Clean up any legacy cache entries that might be causing conflicts
  useEffect(() => {
    if (!chatId) return;
    cleanupLegacyCache(chatId);
  }, [chatId]);

  // ============================================================================
  // INSTANT LOADING STATE MANAGEMENT
  // ============================================================================

  // Cache messages for instant loading on next visit
  useEffect(() => {
    if (chatId && conversationMessages.length > 0) {
      const componentCacheKey = `component_messages_${chatId}`;
      setCachedData(componentCacheKey, { messages: conversationMessages });
      recordFullLoad();
    }
  }, [chatId, conversationMessages.length, recordFullLoad]);

  const { giftedChatMessages, setOptimisticMessages } = useOptimisticMessages(
    conversationMessages,
    user,
    (userId: string) => {
      return (
        otherMembers.find((m) => m.uid === userId)?.displayName || 'Unknown'
      );
    },
    (userId: string) => {
      return otherMembers.find((m) => m.uid === userId)?.photoURL;
    },
    (messageTimestamp: Date) => {
      if (!otherMembers.length || !Object.keys(lastReadByUsers).length) {
        return false;
      }
      return otherMembers.every((member) => {
        const lastReadTime = lastReadByUsers[member.uid];
        return lastReadTime && messageTimestamp < lastReadTime;
      });
    },
  );

  // Typing status management
  const updateTypingStatusImmediately = useCallback(
    async (isTyping: boolean) => {
      if (!chatId || !user?.uid) return;
      try {
        await updateDoc(doc(db, 'crew_date_chats', chatId), {
          [`typingStatus.${user.uid}`]: isTyping,
          [`typingStatus.${user.uid}LastUpdate`]: serverTimestamp(),
        });
      } catch (error: any) {
        if (error.code === 'not-found') {
          try {
            await setDoc(
              doc(db, 'crew_date_chats', chatId),
              {
                typingStatus: {
                  [user.uid]: isTyping,
                  [`${user.uid}LastUpdate`]: serverTimestamp(),
                },
              },
              { merge: true },
            );
          } catch (innerError) {
            console.error('Error creating typing status:', innerError);
          }
        } else {
          console.error('Error updating typing status:', error);
        }
      }
    },
    [chatId, user?.uid],
  );

  const { handleInputTextChanged } = useTypingHandler(
    updateTypingStatusImmediately,
  );

  // Fetch crew details with instant loading from cache
  useEffect(() => {
    if (!crewId || !user?.uid) {
      setCrew({ name: 'Unknown Crew', iconUrl: undefined });
      return;
    }

    const fetchCrew = async () => {
      // First check if we already have cached crew data (from useChatState initialization)
      if (crew && crew.name !== 'Unknown Crew') {
        return; // Already have valid cached data
      }

      // Check crews context
      const crewData = crews.find((c) => c.id === crewId);
      if (crewData) {
        setCrew({ name: crewData.name, iconUrl: crewData.iconUrl });
        return;
      }

      // If not in context, check cache for this specific crew
      const cachedCrew = getCachedData<CachedCrewData>(
        getCacheKey('crew', chatId!),
      );
      if (cachedCrew) {
        setCrew({ name: cachedCrew.name, iconUrl: cachedCrew.iconUrl });
        // Still fetch from Firestore in background to update cache
      }

      // Fetch from Firestore (either as fallback or to update cache)
      try {
        const crewDoc = await getDoc(doc(db, 'crews', crewId));
        if (crewDoc.exists()) {
          const data = crewDoc.data();
          const crewInfo = {
            name: data.name || 'Unknown Crew',
            iconUrl: data.iconUrl,
          };
          setCrew(crewInfo);
        } else {
          setCrew({ name: 'Unknown Crew', iconUrl: undefined });
        }
      } catch (error) {
        console.error('Error fetching crew details:', error);
        // Only set error state if we don't have cached data
        if (!cachedCrew) {
          setCrew({ name: 'Unknown Crew', iconUrl: undefined });
        }
      }
    };

    fetchCrew();
  }, [crewId, crews, user?.uid, setCrew, crew, chatId]);

  // Fetch other members with instant loading from cache
  useEffect(() => {
    if (!chatId || !user?.uid) return;

    const fetchMembers = async () => {
      // Return early if we already have cached members (from useChatState initialization)
      if (otherMembers.length > 0) {
        return; // Already have cached data
      }

      try {
        const chatRef = doc(db, 'crew_date_chats', chatId);
        const chatSnap = await getDoc(chatRef);

        if (chatSnap.exists()) {
          const chatData = chatSnap.data();
          const memberIds: string[] = chatData.memberIds || [];
          const otherMemberIds = memberIds.filter((id) => id !== user?.uid);

          // Check if we have all members in usersCache for instant loading
          const cachedMembers = otherMemberIds
            .map((uid) => usersCache[uid])
            .filter(Boolean);

          // If we have all members cached, use them immediately
          if (cachedMembers.length === otherMemberIds.length) {
            setOtherMembers(cachedMembers);
            return;
          }

          // For missing members, fetch from Firestore
          const fetchedMembers = await Promise.all(
            otherMemberIds.map(async (uid) => {
              if (usersCache[uid]) return usersCache[uid];

              try {
                const userDoc = await getDoc(doc(db, 'users', uid));
                if (userDoc.exists()) {
                  const data = userDoc.data() as User;
                  setUsersCache((prev) => ({ ...prev, [uid]: data }));
                  return data;
                } else {
                  return {
                    uid,
                    displayName: 'Unknown',
                    email: '',
                    photoURL: undefined,
                  } as User;
                }
              } catch (error) {
                console.error(`Error fetching user ${uid}:`, error);
                return {
                  uid,
                  displayName: 'Unknown',
                  email: '',
                  photoURL: undefined,
                } as User;
              }
            }),
          );

          setOtherMembers(fetchedMembers);
        } else {
          setOtherMembers([]);
        }
      } catch (error) {
        console.error('Error fetching chat members:', error);
        setOtherMembers([]);
      }
    };

    fetchMembers();
  }, [
    chatId,
    user?.uid,
    usersCache,
    setUsersCache,
    setOtherMembers,
    otherMembers.length,
  ]);

  // Set navigation title
  useLayoutEffect(() => {
    if (crew) {
      navigation.setOptions({
        headerTitle: `${crew.name} (${moment(date).format('MMM Do')})`,
        headerStatusBarHeight: insets.top,
      });
    }
  }, [navigation, crew, date, insets.top]);

  // Listen to messages
  useEffect(() => {
    if (!chatId) return;
    console.log('[CrewDateChat] Setting up message listener for:', chatId);
    const unsubscribeMessages = listenToMessages(chatId);
    return () => unsubscribeMessages();
  }, [chatId]); // Remove listenToMessages from dependencies

  // Cache warming & background prefetching
  useEffect(() => {
    if (!crewId || !date || !crew) return;

    const warmupAdjacentChats = async () => {
      try {
        const currentDate = moment(date);
        const prevDate = currentDate
          .clone()
          .subtract(1, 'day')
          .format('YYYY-MM-DD');
        const nextDate = currentDate.clone().add(1, 'day').format('YYYY-MM-DD');

        const adjacentChatIds = [
          generateChatId(crewId, prevDate),
          generateChatId(crewId, nextDate),
        ];

        // Prefetch crew data for adjacent chats (they'll be the same crew)
        const crewCacheKey = getCacheKey('crew', chatId!);
        if (!getCachedData(crewCacheKey)) {
          setCachedData(crewCacheKey, {
            name: crew.name,
            iconUrl: crew.iconUrl,
          });
        }

        // Prefetch member data for adjacent chats (likely similar members)
        for (const adjChatId of adjacentChatIds) {
          const membersCacheKey = getCacheKey('members', adjChatId);
          if (otherMembers.length > 0 && !getCachedData(membersCacheKey)) {
            setCachedData(membersCacheKey, { members: otherMembers });
          }
        }
      } catch (error) {
        console.warn('Cache warming failed:', error);
      }
    };

    // Warm cache after component has rendered
    setTimeout(warmupAdjacentChats, 1000);
  }, [crewId, date, chatId, crew, otherMembers]);

  // Listen for typing status and read receipts
  useEffect(() => {
    if (!chatId || !user?.uid) return;

    const chatRef = doc(db, 'crew_date_chats', chatId);
    const unsubscribe = onSnapshot(
      chatRef,
      (docSnapshot) => {
        if (!user?.uid) return;
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();

          // Handle read receipts
          if (data.lastRead) {
            const lastReadData: { [uid: string]: Date } = {};
            Object.keys(data.lastRead).forEach((uid) => {
              const timestamp = data.lastRead[uid];
              if (timestamp) {
                lastReadData[uid] = timestamp.toDate();
              }
            });
            setLastReadByUsers(lastReadData);
          }

          // Handle typing status
          if (data.typingStatus) {
            const updatedTypingStatus: { [key: string]: boolean } = {};
            Object.keys(data.typingStatus).forEach((key) => {
              if (key.endsWith('LastUpdate')) return;
              const uid = key;
              const isTyping = data.typingStatus[uid];
              const lastUpdate = data.typingStatus[`${uid}LastUpdate`];
              if (isTyping && lastUpdate) {
                const now = Date.now();
                const lastUpdateMillis = (lastUpdate as Timestamp).toMillis();
                updatedTypingStatus[uid] =
                  now - lastUpdateMillis < TYPING_TIMEOUT;
              } else {
                updatedTypingStatus[uid] = false;
              }
            });
            if (user?.uid) delete updatedTypingStatus[user.uid];
            setOtherUsersTyping(updatedTypingStatus);
          } else {
            setOtherUsersTyping({});
          }
        }
      },
      (error) => {
        if (!user?.uid) return;
        if (error.code === 'permission-denied') return;
        console.error('Error listening to chat document:', error);
      },
    );
    return () => unsubscribe();
  }, [chatId, user?.uid, setLastReadByUsers, setOtherUsersTyping]);

  // Handle loading earlier messages
  const handleLoadEarlier = useCallback(async () => {
    if (!chatId || isLoadingEarlier || !paginationInfo?.hasMore) return;

    console.log('[CrewDateChat] Loading earlier messages...');
    setIsLoadingEarlier(true);

    try {
      const hasMore = await loadEarlierMessages(chatId);
      console.log('[CrewDateChat] Loaded earlier messages, has more:', hasMore);
    } catch (error) {
      console.error('[CrewDateChat] Error loading earlier messages:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not load earlier messages',
        position: 'bottom',
      });
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [
    chatId,
    paginationInfo,
    loadEarlierMessages,
    isLoadingEarlier,
    setIsLoadingEarlier,
  ]);

  // Message handling
  const onSend = useCallback(
    async (msgs: ExtendedMessage[] = []) => {
      const text = msgs[0].text;
      if (text && text.trim() !== '' && chatId) {
        const optimisticMsg: ExtendedMessage = {
          _id: `temp-${Date.now()}`,
          text: text.trim(),
          createdAt: new Date(),
          user: {
            _id: user?.uid || '',
            name: user?.displayName || 'You',
            avatar: user?.photoURL,
          },
          pending: true,
        };

        setOptimisticMessages((prev) => [...prev, optimisticMsg]);

        try {
          await sendMessage(chatId, text.trim());
          updateTypingStatusImmediately(false);
          await updateLastRead(chatId);
        } catch (error) {
          console.error('Failed to send message:', error);
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Failed to send message',
          });
        }
      }
    },
    [
      chatId,
      sendMessage,
      updateTypingStatusImmediately,
      updateLastRead,
      user,
      setOptimisticMessages,
    ],
  );

  // Image handling
  const handlePickImage = useCallback(async () => {
    if (!chatId || !user?.uid) return;

    try {
      const imageUri = await pickImage();
      if (!imageUri) return;

      setIsUploading(true);
      const imageUrl = await uploadImage(imageUri, user.uid, chatId);
      await sendMessage(chatId, '', imageUrl);
      updateTypingStatusImmediately(false);
      await updateLastRead(chatId);
    } catch (error) {
      console.error('Error sending image:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to send image',
      });
    } finally {
      setIsUploading(false);
    }
  }, [
    chatId,
    user?.uid,
    sendMessage,
    updateTypingStatusImmediately,
    updateLastRead,
    setIsUploading,
  ]);

  const handleTakePhoto = useCallback(async () => {
    if (!chatId || !user?.uid) return;

    try {
      const photoUri = await takePhoto();
      if (!photoUri) return;

      setIsUploading(true);
      const imageUrl = await uploadImage(photoUri, user.uid, chatId);
      await sendMessage(chatId, '', imageUrl);
      updateTypingStatusImmediately(false);
      await updateLastRead(chatId);
    } catch (error) {
      console.error('Error sending photo:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to send photo',
      });
    } finally {
      setIsUploading(false);
    }
  }, [
    chatId,
    user?.uid,
    sendMessage,
    updateTypingStatusImmediately,
    updateLastRead,
    setIsUploading,
  ]);

  // Poll handling
  const handleCreatePoll = useCallback(
    async (question: string, options: string[]) => {
      if (!chatId) return;
      try {
        await createPoll(chatId, question, options);
      } catch (error) {
        console.error('Error creating poll:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not create poll',
        });
      }
    },
    [chatId, createPoll],
  );

  const handleVotePoll = useCallback(
    async (messageId: string, optionIndex: number) => {
      if (!chatId) return;
      try {
        await votePoll(chatId, messageId, optionIndex);
      } catch (error) {
        console.error('Error voting in poll:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not submit vote',
        });
      }
    },
    [chatId, votePoll],
  );

  // Render functions
  const renderActions = useCallback(() => {
    return (
      <>
        <Actions
          containerStyle={styles.actionsContainer}
          icon={() => (
            <TouchableOpacity
              onPress={() => setIsImageMenuVisible(true)}
              disabled={isUploading}
              style={styles.iconButton}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#1E90FF" />
              ) : (
                <Ionicons name="images-outline" size={24} color="#1E90FF" />
              )}
            </TouchableOpacity>
          )}
        />

        <Actions
          containerStyle={styles.pollActionsContainer}
          icon={() => (
            <TouchableOpacity
              onPress={() => setIsPollModalVisible(true)}
              style={styles.iconButton}
            >
              <Ionicons name="stats-chart-outline" size={24} color="#1E90FF" />
            </TouchableOpacity>
          )}
        />

        <ImageOptionsMenu
          visible={isImageMenuVisible}
          onClose={() => setIsImageMenuVisible(false)}
          onGalleryPress={() => {
            setIsImageMenuVisible(false);
            handlePickImage();
          }}
          onCameraPress={() => {
            setIsImageMenuVisible(false);
            handleTakePhoto();
          }}
        />

        <PollCreationModal
          visible={isPollModalVisible}
          onClose={() => setIsPollModalVisible(false)}
          onCreatePoll={handleCreatePoll}
        />
      </>
    );
  }, [
    handlePickImage,
    handleTakePhoto,
    handleCreatePoll,
    isUploading,
    isImageMenuVisible,
    isPollModalVisible,
    setIsImageMenuVisible,
    setIsPollModalVisible,
  ]);

  const renderCustomView = useCallback(
    (props: MessageProps<ExtendedMessage>) => {
      const { currentMessage } = props;
      if (currentMessage && currentMessage.poll) {
        return (
          <PollMessage
            question={currentMessage.poll.question}
            options={currentMessage.poll.options}
            votes={currentMessage.poll.votes || {}}
            totalVotes={currentMessage.poll.totalVotes || 0}
            messageId={String(currentMessage._id)}
            onVote={(optionIndex) =>
              handleVotePoll(String(currentMessage._id), optionIndex)
            }
          />
        );
      }
      return null;
    },
    [handleVotePoll],
  );

  const renderAvatar = useCallback(
    (props: AvatarProps<ExtendedMessage>) => {
      const messageUserId = props.currentMessage.user._id;
      const messageUser = otherMembers.find((m) => m.uid === messageUserId);
      return (
        <ProfilePicturePicker
          imageUrl={messageUser?.photoURL || null}
          onImageUpdate={() => {}}
          editable={false}
          size={36}
        />
      );
    },
    [otherMembers],
  );

  const renderTicks = useCallback(
    (message: ExtendedMessage) => {
      if (message.user._id !== user?.uid) return null;

      if (message.pending) {
        return (
          <View style={styles.tickContainer}>
            <Ionicons name="time-outline" size={10} color="#92AAB0" />
          </View>
        );
      }

      if (message.received) {
        return (
          <View style={styles.tickContainer}>
            <Ionicons name="checkmark-done" size={14} color="#4FC3F7" />
          </View>
        );
      } else if (message.sent) {
        return (
          <View style={styles.tickContainer}>
            <Ionicons name="checkmark" size={14} color="#92AAB0" />
          </View>
        );
      }

      return null;
    },
    [user?.uid],
  );

  const renderMessageImage = useCallback(
    (props: MessageImageProps<ExtendedMessage>) => {
      return <ChatImageViewer {...props} imageStyle={styles.messageImage} />;
    },
    [],
  );

  const renderInputToolbar = (props: any) => (
    <InputToolbar {...props} containerStyle={styles.inputToolbarContainer} />
  );

  // Computed values with memoization for performance
  const typingUserIds = useMemo(
    () => Object.keys(otherUsersTyping).filter((uid) => otherUsersTyping[uid]),
    [otherUsersTyping],
  );

  const typingDisplayNames = useMemo(() => {
    return typingUserIds.map((uid) => {
      const member = otherMembers.find((m) => m.uid === uid);
      return member ? member.displayName : 'Someone';
    });
  }, [typingUserIds, otherMembers]);

  // Memoize GiftedChat user prop to prevent unnecessary re-renders
  const giftedChatUser = useMemo(
    () => ({
      _id: user?.uid || '',
      name: user?.displayName || 'You',
      avatar: user?.photoURL || undefined,
    }),
    [user?.uid, user?.displayName, user?.photoURL],
  );

  const renderFooter = useCallback(() => {
    if (typingDisplayNames.length > 0) {
      return (
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>
            {typingDisplayNames.join(', ')}{' '}
            {typingDisplayNames.length === 1 ? 'is' : 'are'} typing...
          </Text>
        </View>
      );
    }
    return null;
  }, [typingDisplayNames]);

  // Focus and app state management
  useFocusEffect(
    useCallback(() => {
      if (chatId) {
        updateLastRead(chatId);
        addActiveChat(chatId);
      }
      return () => {
        if (chatId) {
          removeActiveChat(chatId);
        }
      };
    }, [chatId, updateLastRead, addActiveChat, removeActiveChat]),
  );

  const appState = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/active/) &&
        nextAppState.match(/inactive|background/)
      ) {
        if (chatId) removeActiveChat(chatId);
      } else if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        if (isFocused && chatId) addActiveChat(chatId);
      }
      appState.current = nextAppState;
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [chatId, isFocused, addActiveChat, removeActiveChat]);

  // Auto-mark messages as read
  const previousMessageCountRef = useRef<number>(0);
  const debouncedUpdateLastRead = useMemo(
    () =>
      debounce(
        (chatId: string) => updateLastRead(chatId),
        READ_UPDATE_DEBOUNCE,
      ),
    [updateLastRead],
  );

  useEffect(() => {
    if (!chatId || !isFocused) return;

    const currentMessageCount = conversationMessages.length;
    if (
      previousMessageCountRef.current > 0 &&
      currentMessageCount > previousMessageCountRef.current
    ) {
      debouncedUpdateLastRead(chatId);
    }
    previousMessageCountRef.current = currentMessageCount;
  }, [conversationMessages, chatId, isFocused, debouncedUpdateLastRead]);

  useEffect(() => {
    previousMessageCountRef.current = 0;
  }, [chatId]);

  // ============================================================================
  // INSTANT LOADING RENDER LOGIC - SIMPLIFIED FOR INSTANT DISPLAY
  // ============================================================================

  // Only show loading if we don't have a valid chatId
  if (!chatId) return <LoadingOverlay />;

  // Always show the chat interface immediately - let data load in background
  return (
    <View style={styles.container}>
      <GiftedChat
        messages={giftedChatMessages}
        onSend={(messages) => onSend(messages)}
        user={giftedChatUser}
        bottomOffset={tabBarHeight - insets.bottom}
        isTyping={false}
        onInputTextChanged={handleInputTextChanged}
        renderAvatar={renderAvatar}
        renderActions={renderActions}
        renderMessageImage={renderMessageImage}
        renderCustomView={renderCustomView}
        renderBubble={(props) => (
          <Bubble
            {...props}
            wrapperStyle={{
              left: { backgroundColor: '#BFF4BE' },
            }}
            renderTicks={(message) => renderTicks(message)}
            tickStyle={styles.tick}
          />
        )}
        renderInputToolbar={renderInputToolbar}
        renderSend={(props: SendProps<ExtendedMessage>) => (
          <Send
            {...props}
            containerStyle={[
              styles.sendContainer,
              { opacity: props.text && props.text.trim() ? 1 : 0.5 },
            ]}
            alwaysShowSend
          >
            <Ionicons size={30} color={'#1E90FF'} name={'arrow-up-circle'} />
          </Send>
        )}
        renderFooter={renderFooter}
        loadEarlier={paginationInfo?.hasMore}
        isLoadingEarlier={isLoadingEarlier}
        listViewProps={{
          onEndReached: () => handleLoadEarlier(),
        }}
      />
    </View>
  );
};

export default CrewDateChatScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  footerContainer: {
    marginTop: 5,
    marginLeft: 10,
    marginBottom: 10,
  },
  footerText: { fontSize: 14, color: '#aaa' },
  inputToolbarContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 5,
    marginVertical: 5,
    borderRadius: 20,
    borderTopWidth: 0,
  },
  sendContainer: {
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  tickContainer: {
    flexDirection: 'row',
    marginRight: 10,
    alignItems: 'center',
  },
  tick: {
    fontSize: 10,
    color: '#92AAB0',
    marginRight: 2,
  },
  actionsContainer: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    marginRight: 0,
    marginBottom: 0,
  },
  pollActionsContainer: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
    marginRight: 0,
    marginBottom: 0,
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 13,
    margin: 3,
    resizeMode: 'cover',
  },
});
