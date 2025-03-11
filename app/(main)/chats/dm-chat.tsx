import React, {
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { View, StyleSheet, Text, AppState, AppStateStatus } from 'react-native';
import {
  GiftedChat,
  IMessage,
  Bubble,
  Send,
  SendProps,
  InputToolbar,
  LoadEarlier,
} from 'react-native-gifted-chat';
import { useUser } from '@/context/UserContext';
import { useDirectMessages } from '@/context/DirectMessagesContext';
import { useCrews } from '@/context/CrewsContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import { generateDMConversationId } from '@/utils/chatHelpers';
import {
  doc,
  getDoc,
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
import { throttle, debounce } from 'lodash';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';

const TYPING_TIMEOUT = 1000;
const READ_UPDATE_DEBOUNCE = 1000; // 1 second debounce for read status updates

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
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<Date | null>(null);
  const insets = useSafeAreaInsets();
  // Add state for optimistic messages
  const [optimisticMessages, setOptimisticMessages] = useState<IMessage[]>([]);
  // Add state for loading earlier messages
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);

  // Generate conversationId from current and other user IDs.
  const conversationId = useMemo(() => {
    if (!user?.uid || !otherUserId) return '';
    return generateDMConversationId(user.uid, otherUserId);
  }, [user?.uid, otherUserId]);

  // Get pagination info for this conversation
  const paginationInfo = conversationId
    ? messagePaginationInfo[conversationId]
    : undefined;

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
      Toast.show({
        type: 'info',
        text1: 'No more messages',
        text2: 'You have reached the beginning of this conversation',
        position: 'bottom',
      });
      return;
    }

    console.log(`[DMChat] Loading earlier messages for ${conversationId}...`);
    setIsLoadingEarlier(true);

    try {
      const hasMore = await loadEarlierMessages(conversationId);
      console.log('[DMChat] loadEarlierMessages result:', hasMore);

      if (!hasMore) {
        Toast.show({
          type: 'info',
          text1: 'No more messages',
          text2: 'You have reached the beginning of this conversation',
          position: 'bottom',
        });
      }
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

  // Fetch details for the other user.
  useEffect(() => {
    if (usersCache[otherUserId]) {
      setOtherUser(usersCache[otherUserId]);
    } else {
      console.log('Fetching user details from DMChatScreen for', otherUserId);
      fetchUserDetails(otherUserId).then((userData) => {
        setOtherUser(userData);
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

  // Use a ref for the typing timeout to ensure proper cleanup.
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Throttled function to update typing status.
  const updateTypingStatus = useMemo(
    () =>
      throttle(async (isTyping: boolean) => {
        if (!conversationId || !user?.uid) return;
        const convoRef = doc(db, 'direct_messages', conversationId);
        try {
          const chatSnap = await getDoc(convoRef);
          if (!chatSnap.exists()) {
            await setDoc(
              convoRef,
              {
                typingStatus: {
                  [user.uid]: isTyping,
                  [`${user.uid}LastUpdate`]: serverTimestamp(),
                },
              },
              { merge: true },
            );
          } else {
            await updateDoc(convoRef, {
              typingStatus: {
                [user.uid]: isTyping,
                [`${user.uid}LastUpdate`]: serverTimestamp(),
              },
            });
          }
        } catch (error) {
          console.error('Error updating typing status:', error);
        }
      }, 500),
    [conversationId, user?.uid],
  );

  const handleInputTextChanged = useCallback(
    (text: string) => {
      const isTyping = text.length > 0;
      updateTypingStatus(isTyping);
      if (isTyping) {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          updateTypingStatus(false);
          typingTimeoutRef.current = null;
        }, TYPING_TIMEOUT);
      } else {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
      }
    },
    [updateTypingStatus],
  );

  const conversationMessages = messages[conversationId] || [];

  // Modified to include optimistic messages and message status
  const giftedChatMessages: IMessage[] = useMemo(() => {
    // Get messages from server
    const serverMessages = conversationMessages
      .map((message) => {
        // Determine if message has been read by other user
        const isRead =
          lastReadTimestamp &&
          message.senderId === user?.uid &&
          new Date(message.createdAt) < lastReadTimestamp;

        return {
          _id: message.id,
          text: message.text,
          createdAt:
            message.createdAt instanceof Date
              ? message.createdAt
              : new Date(message.createdAt),
          user: {
            _id: message.senderId,
            name:
              message.senderId === user?.uid
                ? user?.displayName || 'You'
                : otherUser?.displayName || 'Unknown',
            avatar:
              message.senderId === user?.uid
                ? user?.photoURL
                : otherUser?.photoURL,
            isOnline:
              message.senderId === user?.uid ? true : otherUser?.isOnline,
          },
          sent: true, // All server messages were successfully sent
          received: isRead || false, // Message is "received" when it has been read
        };
      })
      .reverse();

    // Find and remove any optimistic messages that have been confirmed
    const newOptimisticMessages = optimisticMessages.filter((optMsg) => {
      // If this message appears in server messages, remove it from optimistic messages
      return !serverMessages.some(
        (serverMsg) =>
          serverMsg.text === optMsg.text &&
          Math.abs(
            new Date(serverMsg.createdAt).getTime() -
              new Date(optMsg.createdAt).getTime(),
          ) < 5000,
      );
    });

    // Update optimistic messages if any were confirmed
    if (newOptimisticMessages.length !== optimisticMessages.length) {
      setOptimisticMessages(newOptimisticMessages);
    }

    // Merge server messages with remaining optimistic messages
    return [...newOptimisticMessages, ...serverMessages];
  }, [
    conversationMessages,
    user,
    otherUser,
    optimisticMessages,
    lastReadTimestamp,
  ]);

  useEffect(() => {
    if (!conversationId) return;
    const unsubscribeMessages = listenToDMMessages(conversationId);
    return () => unsubscribeMessages();
  }, [conversationId, listenToDMMessages]);

  const onSend = useCallback(
    async (msgs: IMessage[] = []) => {
      const text = msgs[0].text;
      if (text && text.trim() !== '') {
        // Add the message optimistically
        const optimisticMsg: IMessage = {
          _id: `temp-${Date.now()}`,
          text: text.trim(),
          createdAt: new Date(),
          user: {
            _id: user?.uid || '',
            name: user?.displayName || 'You',
            avatar: user?.photoURL,
          },
          pending: true,
          // Note: We don't set sent or received yet
        };

        // Add to optimistic messages
        setOptimisticMessages((prev) => [...prev, optimisticMsg]);

        // Send to server
        try {
          await sendMessage(conversationId, text.trim());
          updateTypingStatus(false);
          await updateLastRead(conversationId);
        } catch (error) {
          console.error('Failed to send message:', error);
          // Show error and keep optimistic message with error state
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Failed to send message',
          });
        }
      }
    },
    [conversationId, sendMessage, updateTypingStatus, updateLastRead, user],
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

  // Custom render function for the LoadEarlier component
  const renderLoadEarlier = useCallback(
    (props: any) => {
      return (
        <LoadEarlier
          {...props}
          label={isLoadingEarlier ? 'Loading...' : 'Load earlier messages'}
          containerStyle={styles.loadEarlierContainer}
          wrapperStyle={styles.loadEarlierWrapper}
          textStyle={styles.loadEarlierText}
          activityIndicatorSize="small"
          activityIndicatorColor="#0a84ff"
        />
      );
    },
    [isLoadingEarlier],
  );

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
        // Add pagination support with improved property binding
        loadEarlier={Boolean(paginationInfo?.hasMore)}
        isLoadingEarlier={isLoadingEarlier}
        onLoadEarlier={handleLoadEarlier}
        renderLoadEarlier={renderLoadEarlier}
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
  // Add styles for load earlier button
  loadEarlierContainer: {
    marginVertical: 10,
  },
  loadEarlierWrapper: {
    backgroundColor: '#f0f0f0',
    borderRadius: 15,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  loadEarlierText: {
    fontSize: 14,
    color: '#0a84ff',
    fontWeight: '500',
  },
});
