// app/(main)/chats/crew-chat.tsx

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
import { useCrewChat } from '@/context/CrewChatContext';
import { useCrews } from '@/context/CrewsContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import {
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
  updateDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { User } from '@/types/User';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
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
  READ_UPDATE_DEBOUNCE,
  createOptimisticMessage,
} from '@/utils/chatUtils';
import { debounce } from 'lodash';

// ============================================================================
// COMPONENT-SPECIFIC STATE MANAGEMENT HOOK
// ============================================================================
const useChatState = (
  chatId: string | null,
  recordCacheLoad: (isHit: boolean) => void,
) => {
  const [crew, setCrew] = useState<{ name: string; iconUrl?: string } | null>(
    () => {
      if (!chatId) return null;
      const cached = getCachedData<any>(getCacheKey('crew', chatId));
      recordCacheLoad(!!cached);
      return cached;
    },
  );

  const [members, setMembers] = useState<User[]>(() => {
    if (!chatId) return [];
    const cached = getCachedData<CachedMemberData>(
      getCacheKey('members', chatId),
    );
    recordCacheLoad(!!cached?.members?.length);
    return cached?.members || [];
  });

  const [otherUsersTyping, setOtherUsersTyping] = useState<
    Record<string, boolean>
  >({});
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [lastReadByUsers, setLastReadByUsers] = useState<Record<string, Date>>(
    {},
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isImageMenuVisible, setIsImageMenuVisible] = useState(false);
  const [isPollModalVisible, setIsPollModalVisible] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Cache effects
  useEffect(() => {
    if (chatId && crew) {
      setCachedData(getCacheKey('crew', chatId), crew);
    }
  }, [chatId, crew]);

  useEffect(() => {
    if (chatId && members.length > 0) {
      setCachedData(getCacheKey('members', chatId), { members });
    }
  }, [chatId, members]);

  return {
    crew,
    setCrew,
    members,
    setMembers,
    otherUsersTyping,
    setOtherUsersTyping,
    isLoadingEarlier,
    setIsLoadingEarlier,
    lastReadByUsers,
    setLastReadByUsers,
    isUploading,
    setIsUploading,
    isImageMenuVisible,
    setIsImageMenuVisible,
    isPollModalVisible,
    setIsPollModalVisible,
    isInitialLoading,
    setIsInitialLoading,
  };
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const CrewChatScreen: React.FC = () => {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const tabBarHeight = useBottomTabBarHeight();
  const chatId = crewId;

  // Contexts
  const { user, addActiveChat, removeActiveChat } = useUser();
  const { crews, usersCache } = useCrews();
  const {
    sendMessage,
    updateLastRead,
    messages,
    listenToMessages,
    loadEarlierMessages,
    messagePaginationInfo,
    createPoll,
    votePoll,
  } = useCrewChat();

  // Hooks
  const { recordCacheLoad, recordFullLoad } = usePerformanceMonitoring(chatId);
  const {
    crew,
    setCrew,
    members,
    setMembers,
    otherUsersTyping,
    setOtherUsersTyping,
    isLoadingEarlier,
    setIsLoadingEarlier,
    lastReadByUsers,
    setLastReadByUsers,
    isUploading,
    setIsUploading,
    isImageMenuVisible,
    setIsImageMenuVisible,
    isPollModalVisible,
    setIsPollModalVisible,
    isInitialLoading,
    setIsInitialLoading,
  } = useChatState(chatId, recordCacheLoad);

  const paginationInfo = chatId ? messagePaginationInfo[chatId] : undefined;
  const conversationMessages = useMemo(() => {
    if (!chatId || !messages || !messages[chatId]) return [];
    return ensureMessagesArray(messages[chatId], chatId);
  }, [chatId, messages]);

  // One-time legacy cache cleanup on mount
  useEffect(() => {
    if (chatId) cleanupLegacyCache(chatId);
  }, [chatId]);

  // Clear loading state when messages are received or after a timeout for empty chats
  useEffect(() => {
    if (!isInitialLoading) {
      return; // Already loaded
    }

    if (conversationMessages.length > 0) {
      setIsInitialLoading(false);
      recordFullLoad();
      return;
    }

    // Fallback for empty chats or slow networks
    const timer = setTimeout(() => {
      setIsInitialLoading(false);
      recordFullLoad(); // Record that the "full load" is complete, even if empty
    }, 2500); // Give it 2.5 seconds

    return () => clearTimeout(timer); // Clean up on unmount or re-render
  }, [isInitialLoading, conversationMessages.length, recordFullLoad]);

  // Fetch crew and member details with caching
  useEffect(() => {
    if (!chatId || !user?.uid) return;

    const crewData = crews.find((c) => c.id === chatId);
    if (crewData) {
      setCrew({ name: crewData.name, iconUrl: crewData.iconUrl });
      const memberIds = crewData.memberIds.filter((id) => id !== user.uid);
      const fetchedMembers = memberIds
        .map((uid) => usersCache[uid])
        .filter((u): u is User => !!u);
      setMembers(fetchedMembers);
    }
  }, [chatId, crews, user?.uid, usersCache, setCrew, setMembers]);

  // Listen for real-time updates (messages, typing, read receipts)
  useEffect(() => {
    if (!chatId || !user?.uid) return;

    const unsubscribeMessages = listenToMessages(chatId);
    const metadataRef = doc(db, 'crews', chatId, 'messages', 'metadata');
    const unsubscribeMetadata = onSnapshot(metadataRef, (docSnap) => {
      if (!docSnap.exists() || !user?.uid) return;
      const data = docSnap.data();

      // Typing status
      const updatedTyping: Record<string, boolean> = {};
      if (data.typingStatus) {
        Object.keys(data.typingStatus)
          .filter((uid) => uid !== user.uid && !uid.endsWith('LastUpdate'))
          .forEach((uid) => {
            updatedTyping[uid] = data.typingStatus[uid];
          });
      }
      setOtherUsersTyping(updatedTyping);

      // Read receipts
      const updatedReads: Record<string, Date> = {};
      if (data.lastRead) {
        Object.keys(data.lastRead).forEach((uid) => {
          const timestamp = data.lastRead[uid];
          // FIX: Check if timestamp is a valid Firestore Timestamp before calling toDate()
          if (timestamp && typeof timestamp.toDate === 'function') {
            updatedReads[uid] = timestamp.toDate();
          }
        });
      }
      setLastReadByUsers(updatedReads);
    });

    return () => {
      unsubscribeMessages();
      unsubscribeMetadata();
    };
  }, [
    chatId,
    user?.uid,
    listenToMessages,
    setOtherUsersTyping,
    setLastReadByUsers,
  ]);

  // Setup navigation options
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: crew?.name || 'Crew Chat',
      headerStatusBarHeight: insets.top,
    });
  }, [navigation, crew, insets.top]);

  // Optimistic messaging and read receipt logic
  const { giftedChatMessages, setOptimisticMessages } = useOptimisticMessages(
    conversationMessages,
    user,
    (userId) => members.find((m) => m.uid === userId)?.displayName || 'Unknown',
    (userId) => members.find((m) => m.uid === userId)?.photoURL,
    (messageTimestamp) => {
      if (!members.length || !Object.keys(lastReadByUsers).length) return false;
      return members.every((member) => {
        const lastReadTime = lastReadByUsers[member.uid];
        return lastReadTime && messageTimestamp < lastReadTime;
      });
    },
  );

  // Typing handler
  const { handleInputTextChanged } = useTypingHandler(
    useCallback(
      async (isTyping: boolean) => {
        if (!chatId || !user?.uid) return;
        try {
          const metadataRef = doc(db, 'crews', chatId, 'messages', 'metadata');
          await updateDoc(metadataRef, {
            [`typingStatus.${user.uid}`]: isTyping,
            [`typingStatus.${user.uid}LastUpdate`]: serverTimestamp(),
          });
        } catch (error) {
          if (
            error instanceof Error &&
            (error.message.includes('No document to update') ||
              (error as any).code === 'not-found')
          ) {
            const metadataRef = doc(
              db,
              'crews',
              chatId,
              'messages',
              'metadata',
            );
            await setDoc(
              metadataRef,
              {
                typingStatus: {
                  [user.uid]: isTyping,
                  [`${user.uid}LastUpdate`]: serverTimestamp(),
                },
              },
              { merge: true },
            );
          } else {
            console.error('Error updating typing status:', error);
          }
        }
      },
      [chatId, user?.uid],
    ),
  );

  // Send message handler
  const onSend = useCallback(
    async (msgs: ExtendedMessage[] = []) => {
      if (!chatId || !user) return;
      const text = msgs[0].text;
      if (text && text.trim()) {
        const optimisticMsg = createOptimisticMessage(text.trim(), user);
        setOptimisticMessages((prev) => [...prev, optimisticMsg]);
        try {
          await sendMessage(chatId, text.trim());
          handleInputTextChanged('');
          await updateLastRead(chatId);
        } catch (error) {
          console.error('Failed to send message:', error);
          setOptimisticMessages((prev) =>
            prev.filter((p) => p._id !== optimisticMsg._id),
          );
        }
      }
    },
    [
      chatId,
      user,
      sendMessage,
      handleInputTextChanged,
      updateLastRead,
      setOptimisticMessages,
    ],
  );

  // Image and Poll handlers
  const sendImage = useCallback(
    async (imageUri: string) => {
      if (!chatId || !user?.uid) return;
      setIsUploading(true);
      try {
        const imageUrl = await uploadImage(imageUri, user.uid, chatId);
        await sendMessage(chatId, '', imageUrl);
        handleInputTextChanged('');
        await updateLastRead(chatId);
      } catch (error) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Failed to send image',
        });
      } finally {
        setIsUploading(false);
      }
    },
    [chatId, user, sendMessage, handleInputTextChanged, updateLastRead],
  );

  const handlePickImage = useCallback(
    () =>
      pickImage().then((uri) => {
        if (uri) sendImage(uri);
        return null;
      }),
    [sendImage],
  );
  const handleTakePhoto = useCallback(
    () =>
      takePhoto().then((uri) => {
        if (uri) sendImage(uri);
        return null;
      }),
    [sendImage],
  );
  const handleCreatePoll = useCallback(
    (question: string, options: string[]) => {
      if (chatId) createPoll(chatId, question, options);
    },
    [chatId, createPoll],
  );
  const handleVotePoll = useCallback(
    (messageId: string, optionIndex: number) => {
      if (chatId) votePoll(chatId, messageId, optionIndex);
    },
    [chatId, votePoll],
  );
  const handleLoadEarlier = useCallback(() => {
    if (chatId && !isLoadingEarlier && paginationInfo?.hasMore) {
      setIsLoadingEarlier(true);
      loadEarlierMessages(chatId).finally(() => setIsLoadingEarlier(false));
    }
  }, [chatId, isLoadingEarlier, paginationInfo, loadEarlierMessages]);

  // Active chat and AppState management
  useFocusEffect(
    useCallback(() => {
      if (chatId) {
        addActiveChat(chatId);
        updateLastRead(chatId);
      }
      return () => {
        if (chatId) removeActiveChat(chatId);
      };
    }, [chatId, addActiveChat, removeActiveChat, updateLastRead]),
  );

  const appState = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (
        appState.current.match(/active/) &&
        next.match(/inactive|background/)
      ) {
        if (chatId) removeActiveChat(chatId);
      } else if (
        appState.current.match(/inactive|background/) &&
        next === 'active'
      ) {
        if (isFocused && chatId) addActiveChat(chatId);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [chatId, isFocused, addActiveChat, removeActiveChat]);

  // Debounced read receipt updates
  const previousMessageCountRef = useRef(0);
  const debouncedUpdateLastRead = useMemo(
    () => debounce(updateLastRead, READ_UPDATE_DEBOUNCE),
    [updateLastRead],
  );
  useEffect(() => {
    if (
      isFocused &&
      chatId &&
      conversationMessages.length > previousMessageCountRef.current
    ) {
      debouncedUpdateLastRead(chatId);
    }
    previousMessageCountRef.current = conversationMessages.length;
  }, [conversationMessages, isFocused, chatId, debouncedUpdateLastRead]);

  // Render functions for GiftedChat
  const renderActions = useCallback(
    () => (
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
    ),
    [
      isUploading,
      isImageMenuVisible,
      isPollModalVisible,
      handlePickImage,
      handleTakePhoto,
      handleCreatePoll,
    ],
  );

  const renderCustomView = useCallback(
    (props: MessageProps<ExtendedMessage>) =>
      props.currentMessage?.poll ? (
        <PollMessage
          question={props.currentMessage.poll.question}
          options={props.currentMessage.poll.options}
          votes={props.currentMessage.poll.votes || {}}
          totalVotes={props.currentMessage.poll.totalVotes || 0}
          messageId={String(props.currentMessage._id)}
          onVote={(i) => handleVotePoll(String(props.currentMessage?._id), i)}
        />
      ) : null,
    [handleVotePoll],
  );

  const renderAvatar = useCallback(
    (props: AvatarProps<ExtendedMessage>) => (
      <ProfilePicturePicker
        imageUrl={(props.currentMessage?.user?.avatar as string) || null}
        onImageUpdate={() => {}}
        editable={false}
        size={36}
      />
    ),
    [],
  );

  const renderTicks = useCallback(
    (message: ExtendedMessage) => {
      if (message.user._id !== user?.uid) return null;
      if (message.pending)
        return (
          <View style={styles.tickContainer}>
            <Ionicons name="time-outline" size={10} color="#92AAB0" />
          </View>
        );
      if (message.received)
        return (
          <View style={styles.tickContainer}>
            <Ionicons name="checkmark-done" size={14} color="#4FC3F7" />
          </View>
        );
      if (message.sent)
        return (
          <View style={styles.tickContainer}>
            <Ionicons name="checkmark" size={14} color="#92AAB0" />
          </View>
        );
      return null;
    },
    [user?.uid],
  );

  const renderMessageImage = useCallback(
    (props: MessageImageProps<ExtendedMessage>) => (
      <ChatImageViewer {...props} imageStyle={styles.messageImage} />
    ),
    [],
  );
  const renderInputToolbar = useCallback(
    (props: any) => (
      <InputToolbar {...props} containerStyle={styles.inputToolbarContainer} />
    ),
    [],
  );
  const renderFooter = useCallback(() => {
    const typingNames = Object.keys(otherUsersTyping)
      .filter((uid) => otherUsersTyping[uid])
      .map(
        (uid) => members.find((m) => m.uid === uid)?.displayName || 'Someone',
      );
    if (typingNames.length > 0) {
      return (
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>
            {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'}{' '}
            typing...
          </Text>
        </View>
      );
    }
    return null;
  }, [otherUsersTyping, members]);

  if (!chatId) return <LoadingOverlay />;

  return (
    <View style={styles.container}>
      <GiftedChat
        messages={giftedChatMessages}
        onSend={(msgs) => onSend(msgs as ExtendedMessage[])}
        user={{
          _id: user?.uid || '',
          name: user?.displayName || 'You',
          avatar: user?.photoURL || undefined,
        }}
        bottomOffset={tabBarHeight - insets.bottom}
        onInputTextChanged={handleInputTextChanged}
        renderAvatar={renderAvatar}
        renderActions={renderActions}
        renderMessageImage={renderMessageImage}
        renderCustomView={renderCustomView}
        renderBubble={(props) => (
          <Bubble
            {...props}
            wrapperStyle={{ left: { backgroundColor: '#BFF4BE' } }}
            renderTicks={renderTicks}
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
        onLoadEarlier={handleLoadEarlier}
        listViewProps={{ onEndReachedThreshold: 0.5 }}
      />
      {isInitialLoading && <LoadingOverlay />}
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  footerContainer: { marginTop: 5, marginLeft: 10, marginBottom: 10 },
  footerText: { fontSize: 14, color: '#aaa' },
  inputToolbarContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 5,
    marginVertical: 5,
    borderRadius: 20,
    borderTopWidth: 0,
  },
  sendContainer: { justifyContent: 'center', paddingHorizontal: 10 },
  tickContainer: {
    flexDirection: 'row',
    marginRight: 10,
    alignItems: 'center',
  },
  tick: { fontSize: 10, color: '#92AAB0', marginRight: 2 },
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

export default CrewChatScreen;
