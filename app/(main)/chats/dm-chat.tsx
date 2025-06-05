// app/(main)/chats/dm-chat.tsx

import React, {
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
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
  IMessage,
  Bubble,
  Send,
  SendProps,
  InputToolbar,
  Actions,
  MessageImageProps,
} from 'react-native-gifted-chat';
import { useUser } from '@/context/UserContext';
import { useDirectMessages } from '@/context/DirectMessagesContext';
import { useCrews } from '@/context/CrewsContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import { generateDMConversationId } from '@/utils/chatHelpers';
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { User } from '@/types/User';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import { debounce } from 'lodash';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { pickImage, uploadImage, takePhoto } from '@/utils/imageUpload';
import ChatImageViewer from '@/components/ChatImageViewer';
import ImageOptionsMenu from '@/components/ImageOptionsMenu';
import {
  usePerformanceMonitoring,
  useTypingHandler,
  useOptimisticMessages,
  useCachedChatState,
  getCacheKey,
  getCachedData,
  setCachedData,
  ensureMessagesArray,
  cleanupLegacyCache,
  createOptimisticMessage,
  READ_UPDATE_DEBOUNCE,
} from '@/utils/chatUtils';

const DMChatScreen: React.FC = () => {
  const { otherUserId } = useLocalSearchParams<{ otherUserId: string }>();
  const navigation = useNavigation();
  const {
    sendMessage,
    updateLastRead,
    messages,
    listenToDMMessages,
    // Add pagination related items
    loadEarlierMessages,
    messagePaginationInfo,
  } = useDirectMessages();
  const { usersCache, fetchUserDetails } = useCrews();
  const isFocused = useIsFocused();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, addActiveChat, removeActiveChat } = useUser();
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<Date | null>(null);
  const insets = useSafeAreaInsets();
  // Add state for loading earlier messages
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isImageMenuVisible, setIsImageMenuVisible] = useState(false);

  // Generate conversationId from current and other user IDs.
  const conversationId = useMemo(() => {
    if (!user?.uid || !otherUserId) return '';
    return generateDMConversationId(user.uid, otherUserId);
  }, [user?.uid, otherUserId]);

  // 🚀 Performance monitoring
  const { recordCacheLoad } = usePerformanceMonitoring(conversationId);

  // 💾 Cached state management for instant loading
  // In DM context, we mainly use this for the recordCacheLoad functionality
  useCachedChatState(conversationId, recordCacheLoad);

  // Initialize other user from cache for instant loading
  const [otherUser, setOtherUser] = useState<User | null>(() => {
    if (!otherUserId) return null;
    const cached = getCachedData<User>(getCacheKey('user', otherUserId));
    recordCacheLoad(Boolean(cached));
    return cached;
  });

  // Get pagination info for this conversation
  const paginationInfo = conversationId
    ? messagePaginationInfo[conversationId]
    : undefined;

  // 🗂️ Message array validation and caching
  const conversationMessages = useMemo(() => {
    if (!conversationId || !messages || !messages[conversationId]) return [];
    return ensureMessagesArray(messages[conversationId], conversationId);
  }, [conversationId, messages]);

  // Handle loading earlier messages
  const handleLoadEarlier = useCallback(async () => {
    if (!conversationId || isLoadingEarlier) {
      console.log(
        "[DMChat] Can't load earlier messages:",
        !conversationId ? 'Invalid conversationId' : 'Already loading',
      );
      return;
    }

    console.log(
      '[DMChat] Load earlier button clicked, paginationInfo:',
      paginationInfo,
    );

    // Check if there are more messages in pagination info
    if (!paginationInfo?.hasMore) {
      console.log(
        '[DMChat] No more earlier messages available according to paginationInfo',
      );
      return;
    }

    console.log(`[DMChat] Loading earlier messages for ${conversationId}...`);
    setIsLoadingEarlier(true);

    try {
      const hasMore = await loadEarlierMessages(conversationId);
      console.log('[DMChat] loadEarlierMessages result:', hasMore);
    } catch (error) {
      console.error('[DMChat] Error loading earlier messages:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not load earlier messages',
        position: 'bottom',
      });
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [conversationId, paginationInfo, loadEarlierMessages, isLoadingEarlier]);

  // Add this effect to ensure we use the correct pagination info
  useEffect(() => {
    if (conversationId && paginationInfo) {
      console.log(`[DMChat] Current pagination info for ${conversationId}:`, {
        hasMore: paginationInfo.hasMore,
        loading: paginationInfo.loading,
        lastDocId: paginationInfo.lastDoc?.id || 'null',
      });
    }
  }, [conversationId, paginationInfo]);

  // Listen for typing status and last read updates
  useEffect(() => {
    if (!conversationId) return;
    const convoRef = doc(db, 'direct_messages', conversationId);
    const unsubscribe = onSnapshot(
      convoRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Handle typing status
          if (data.typingStatus) {
            const otherTyping = data.typingStatus[otherUserId] || false;
            setIsOtherUserTyping(Boolean(otherTyping));
          } else {
            setIsOtherUserTyping(false);
          }

          // Handle last read timestamp
          if (data.lastRead && data.lastRead[otherUserId]) {
            const timestamp = data.lastRead[otherUserId];
            setLastReadTimestamp(timestamp.toDate());
          }
        } else {
          setIsOtherUserTyping(false);
        }
      },
      (error) => {
        if (error.code === 'permission-denied') return;
        console.error('Error listening to DM document:', error);
        setIsOtherUserTyping(false);
      },
    );
    return () => unsubscribe();
  }, [conversationId, otherUserId]);

  // 🧹 One-time cache cleanup on mount
  useEffect(() => {
    if (!conversationId) return;
    cleanupLegacyCache(conversationId);
  }, [conversationId]);

  // Fetch details for the other user and cache them
  useEffect(() => {
    if (usersCache[otherUserId]) {
      const cachedUser = usersCache[otherUserId];
      setOtherUser(cachedUser);
      // Update cache with latest user data
      setCachedData(getCacheKey('user', otherUserId), cachedUser);
    } else {
      console.log('Fetching user details from DMChatScreen for', otherUserId);
      fetchUserDetails(otherUserId).then((userData) => {
        setOtherUser(userData);
        // Cache the fetched user data
        if (userData) {
          setCachedData(getCacheKey('user', otherUserId), userData);
        }
      });
    }
  }, [otherUserId, usersCache, fetchUserDetails]);

  // Set navigation options.
  useLayoutEffect(() => {
    if (otherUser) {
      navigation.setOptions({
        title: otherUser.displayName,
        headerStatusBarHeight: insets.top,
      });
    }
  }, [navigation, otherUser, insets.top]);

  // ⌨️ Optimized typing handler with utilities
  const updateTypingStatusImmediately = useCallback(
    async (isTyping: boolean) => {
      if (!conversationId || !user?.uid) return;
      try {
        await updateDoc(doc(db, 'direct_messages', conversationId), {
          [`typingStatus.${user.uid}`]: isTyping,
          [`typingStatus.${user.uid}LastUpdate`]: serverTimestamp(),
        });
      } catch (error: any) {
        if (error.code === 'not-found') {
          try {
            await setDoc(
              doc(db, 'direct_messages', conversationId),
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
    [conversationId, user?.uid],
  );

  const { handleInputTextChanged } = useTypingHandler(
    updateTypingStatusImmediately,
  );

  // Remove duplicate conversationMessages line since we have it above
  // const conversationMessages = messages[conversationId] || [];

  // 📱 Optimistic messaging with proper user display using chat utils
  const { giftedChatMessages, setOptimisticMessages } = useOptimisticMessages(
    conversationMessages,
    user,
    (userId: string) => {
      if (userId === user?.uid) return user.displayName || 'You';
      return otherUser?.displayName || 'Unknown';
    },
    (userId: string) => {
      if (userId === user?.uid) return user.photoURL;
      return otherUser?.photoURL;
    },
    (messageTimestamp: Date) => {
      // Message is read if lastReadTimestamp exists and is after the message
      return Boolean(lastReadTimestamp && messageTimestamp < lastReadTimestamp);
    },
  );
  const handlePickImage = useCallback(async () => {
    if (!conversationId || !user?.uid) return;

    try {
      const imageUri = await pickImage();
      if (!imageUri) return;

      setIsUploading(true);

      // Upload image to Firebase Storage
      const imageUrl = await uploadImage(imageUri, user.uid, conversationId);

      // Send message with image
      await sendMessage(conversationId, '', imageUrl);

      // Explicitly set typing status to false when sending a message
      updateTypingStatusImmediately(false);
      await updateLastRead(conversationId);
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
    conversationId,
    user?.uid,
    sendMessage,
    updateTypingStatusImmediately,
    updateLastRead,
  ]);

  // New function to handle taking a photo
  const handleTakePhoto = useCallback(async () => {
    if (!conversationId || !user?.uid) return;

    try {
      const photoUri = await takePhoto();
      if (!photoUri) return;

      setIsUploading(true);

      // Upload image to Firebase Storage
      const imageUrl = await uploadImage(photoUri, user.uid, conversationId);

      // Send message with image
      await sendMessage(conversationId, '', imageUrl);

      // Explicitly set typing status to false when sending a message
      updateTypingStatusImmediately(false);
      await updateLastRead(conversationId);
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
    conversationId,
    user?.uid,
    sendMessage,
    updateTypingStatusImmediately,
    updateLastRead,
  ]);

  useEffect(() => {
    if (!conversationId) return;
    const unsubscribeMessages = listenToDMMessages(conversationId);
    return () => unsubscribeMessages();
  }, [conversationId, listenToDMMessages]);

  // 💾 Cache messages for instant loading on next visit
  useEffect(() => {
    if (conversationId && conversationMessages.length > 0) {
      const componentCacheKey = `dm_messages_${conversationId}`;
      setCachedData(componentCacheKey, {
        messages: conversationMessages.slice(-50), // Cache last 50 messages
      });
    }
  }, [conversationId, conversationMessages.length]);

  // Modified onSend function to handle text-only messages using chat utilities
  const onSend = useCallback(
    async (msgs: IMessage[] = []) => {
      const text = msgs[0].text;
      if (text && text.trim() !== '') {
        // Create optimistic message using utility
        const optimisticMsg = createOptimisticMessage(text.trim(), user);

        // Add to optimistic messages
        setOptimisticMessages((prev) => [...prev, optimisticMsg]);

        // Send to server
        try {
          await sendMessage(conversationId, text.trim());
          // Explicitly set typing status to false when sending a message
          updateTypingStatusImmediately(false);
          await updateLastRead(conversationId);
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
      conversationId,
      sendMessage,
      updateTypingStatusImmediately,
      updateLastRead,
      user,
      setOptimisticMessages,
    ],
  );

  // Create a ref to track the previous message count for comparison
  const previousMessageCountRef = useRef<number>(0);

  // Debounced function to update last read status
  const debouncedUpdateLastRead = useMemo(
    () =>
      debounce((chatId: string) => {
        updateLastRead(chatId);
      }, READ_UPDATE_DEBOUNCE),
    [updateLastRead],
  );

  // Effect to auto-mark messages as read when receiving new messages while screen is focused
  useEffect(() => {
    if (!conversationId || !isFocused) return;

    const currentMessageCount = conversationMessages.length;

    // Only update if we received new messages (not on initial load)
    if (
      previousMessageCountRef.current > 0 &&
      currentMessageCount > previousMessageCountRef.current
    ) {
      // Messages have increased while screen is focused - mark as read
      debouncedUpdateLastRead(conversationId);
    }

    // Update the ref with current count for next comparison
    previousMessageCountRef.current = currentMessageCount;
  }, [
    conversationMessages,
    conversationId,
    isFocused,
    debouncedUpdateLastRead,
  ]);

  // Reset the counter when changing conversations
  useEffect(() => {
    previousMessageCountRef.current = 0;
  }, [conversationId]);

  // Manage active chat state using focus.
  useFocusEffect(
    useCallback(() => {
      if (conversationId) {
        updateLastRead(conversationId);
        addActiveChat(conversationId);
      }
      return () => {
        if (conversationId) removeActiveChat(conversationId);
      };
    }, [conversationId, updateLastRead, addActiveChat, removeActiveChat]),
  );

  // Handle AppState changes:
  // Remove active chat when the app goes to background,
  // and re-add it when returning to active if the screen is focused.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const prevAppState = appStateRef.current;
      if (
        prevAppState === 'active' &&
        (nextAppState === 'inactive' || nextAppState === 'background')
      ) {
        if (conversationId) removeActiveChat(conversationId);
      }
      if (
        (prevAppState === 'inactive' || prevAppState === 'background') &&
        nextAppState === 'active'
      ) {
        if (isFocused && conversationId) {
          addActiveChat(conversationId);
          updateLastRead(conversationId);
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => {
      subscription.remove();
    };
  }, [
    conversationId,
    isFocused,
    addActiveChat,
    removeActiveChat,
    updateLastRead,
  ]);

  const renderAvatar = useCallback(() => {
    return (
      <ProfilePicturePicker
        imageUrl={otherUser?.photoURL || null}
        onImageUpdate={() => {}}
        editable={false}
        size={36}
        isOnline={otherUser?.isOnline}
      />
    );
  }, [otherUser]);

  const renderInputToolbar = (props: any) => (
    <InputToolbar {...props} containerStyle={styles.inputToolbarContainer} />
  );

  // Custom render function for message ticks (WhatsApp style)
  const renderTicks = useCallback(
    (message: IMessage) => {
      // Only show ticks for the current user's messages
      if (message.user._id !== user?.uid) {
        return null;
      }

      // For pending/optimistic messages
      if (message.pending) {
        return (
          <View style={styles.tickContainer}>
            <Ionicons name="time-outline" size={10} color="#92AAB0" />
          </View>
        );
      }

      // For sent messages
      if (message.received) {
        // Double blue ticks for received/read messages
        return (
          <View style={styles.tickContainer}>
            <Ionicons name="checkmark-done" size={14} color="#4FC3F7" />
          </View>
        );
      } else if (message.sent) {
        // Single gray tick for delivered but unread messages
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

  // Log when pagination info changes
  useEffect(() => {
    if (paginationInfo) {
      console.log('[DMChat] Pagination info updated:', {
        hasMore: paginationInfo.hasMore,
        loading: paginationInfo.loading,
      });
    }
  }, [paginationInfo]);

  // Add this debug effect to log when messages change
  useEffect(() => {
    if (conversationMessages.length > 0) {
      console.log(`[DMChat] Message count: ${conversationMessages.length}`);
    }
  }, [conversationMessages.length]);

  // Add more debugging for pagination info and message count
  useEffect(() => {
    if (paginationInfo) {
      console.log('[DMChat] Pagination info updated:', {
        chatId: conversationId,
        hasMore: paginationInfo.hasMore,
        loading: paginationInfo.loading,
      });
    }
  }, [paginationInfo, conversationId]);

  // More detailed logging for message count changes
  useEffect(() => {
    if (conversationId && conversationMessages.length > 0) {
      console.log(
        `[DMChat] Messages for ${conversationId}: ${conversationMessages.length}`,
      );

      // Log first and last message timestamps to help debug ordering
      const firstMsg = conversationMessages[0];
      const lastMsg = conversationMessages[conversationMessages.length - 1];
      if (firstMsg && lastMsg) {
        console.log(
          `[DMChat] First msg: ${new Date(firstMsg.createdAt).toISOString()}`,
        );
        console.log(
          `[DMChat] Last msg: ${new Date(lastMsg.createdAt).toISOString()}`,
        );
      }
    }
  }, [conversationId, conversationMessages.length]);

  // Render custom actions (image picker button)
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
                <Ionicons name="image-outline" size={24} color="#1E90FF" />
              )}
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
      </>
    );
  }, [handlePickImage, handleTakePhoto, isUploading, isImageMenuVisible]);

  // Custom render for image messages
  const renderMessageImage = useCallback(
    (props: MessageImageProps<IMessage>) => {
      return <ChatImageViewer {...props} imageStyle={styles.messageImage} />;
    },
    [],
  );

  if (!conversationId) return <LoadingOverlay />;
  return (
    <View style={styles.container}>
      <GiftedChat
        messages={giftedChatMessages}
        onSend={onSend}
        user={{
          _id: user?.uid || '',
          name: user?.displayName || 'You',
          avatar: user?.photoURL || undefined,
        }}
        isTyping={false}
        bottomOffset={tabBarHeight - insets.bottom}
        onInputTextChanged={handleInputTextChanged}
        renderAvatar={renderAvatar}
        renderActions={renderActions}
        renderMessageImage={renderMessageImage}
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
        renderSend={(props: SendProps<IMessage>) => (
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
        renderInputToolbar={renderInputToolbar}
        renderFooter={() =>
          isOtherUserTyping ? (
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>
                {otherUser?.displayName} is typing...
              </Text>
            </View>
          ) : null
        }
        loadEarlier={paginationInfo?.hasMore}
        isLoadingEarlier={isLoadingEarlier}
        listViewProps={{
          onEndReached: () => handleLoadEarlier(),
        }}
        inverted={true}
      />
    </View>
  );
};

export default DMChatScreen;

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
    marginRight: 4,
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
