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
  AvatarProps,
} from 'react-native-gifted-chat';
import { useUser } from '@/context/UserContext';
import { useCrewChat } from '@/context/CrewChatContext';
import { useCrews } from '@/context/CrewsContext';
import LoadingOverlay from '@/components/LoadingOverlay';
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
import { debounce } from 'lodash';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';

const TYPING_TIMEOUT = 1000;
const READ_UPDATE_DEBOUNCE = 1000; // 1 second debounce for read status updates

const CrewChatScreen: React.FC = () => {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const navigation = useNavigation();
  const {
    sendMessage,
    updateLastRead,
    messages,
    listenToMessages,
    crewChats,
    loadEarlierMessages,
    messagePaginationInfo,
  } = useCrewChat();
  const { usersCache } = useCrews();
  const isFocused = useIsFocused();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, addActiveChat, removeActiveChat } = useUser();
  const [otherUsersTyping, setOtherUsersTyping] = useState<{
    [key: string]: boolean;
  }>({});
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<IMessage[]>([]);
  const [crew, setCrew] = useState<{ name: string; iconUrl?: string } | null>(
    null,
  );
  const insets = useSafeAreaInsets();

  // Get pagination info for this chat
  const paginationInfo = crewId ? messagePaginationInfo[crewId] : undefined;

  useLayoutEffect(() => {
    if (crew) {
      navigation.setOptions({
        headerTitle: `${crew.name} Chat`,
        headerStatusBarHeight: insets.top,
      });
    }
  }, [navigation, crew, insets.top]);

  // Find crew details from crewChats
  useEffect(() => {
    if (crewId) {
      const currentCrew = crewChats.find((chat) => chat.id === crewId);
      if (currentCrew) {
        setCrew({
          name: currentCrew.name,
          iconUrl: currentCrew.iconUrl,
        });
      }
    }
  }, [crewId, crewChats]);

  // Handle loading earlier messages
  const handleLoadEarlier = useCallback(async () => {
    if (!crewId || isLoadingEarlier) {
      console.log(
        "[CrewChat] Can't load earlier messages:",
        !crewId ? 'Invalid crewId' : 'Already loading',
      );
      return;
    }

    if (!paginationInfo?.hasMore) {
      console.log('[CrewChat] No more earlier messages available');
      return;
    }

    console.log('[CrewChat] Loading earlier messages...');
    setIsLoadingEarlier(true);

    try {
      const hasMore = await loadEarlierMessages(crewId);
      console.log('[CrewChat] Loaded earlier messages, has more:', hasMore);
    } catch (error) {
      console.error('[CrewChat] Error loading earlier messages:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not load earlier messages',
        position: 'bottom',
      });
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [crewId, paginationInfo, loadEarlierMessages, isLoadingEarlier]);

  // Typing status for group chat
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track previous typing state to prevent unnecessary updates
  const prevTypingStateRef = useRef<boolean>(false);

  // Function to immediately update typing status when typing starts
  const updateTypingStatusImmediately = useCallback(
    async (isTyping: boolean) => {
      if (!crewId || !user?.uid) return;
      try {
        await updateDoc(doc(db, 'crew_chats', crewId), {
          [`typingStatus.${user.uid}`]: isTyping,
          [`typingStatus.${user.uid}LastUpdate`]: serverTimestamp(),
        });
      } catch (error: any) {
        if (error.code === 'not-found') {
          try {
            await setDoc(
              doc(db, 'crew_chats', crewId),
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
    [crewId, user?.uid],
  );

  // Only debounce the "stop typing" signal to reduce Firebase operations
  const debouncedStopTyping = useMemo(
    () =>
      debounce(() => {
        updateTypingStatusImmediately(false);
        prevTypingStateRef.current = false;
      }, 500),
    [updateTypingStatusImmediately],
  );

  // Optimize the input text change handler
  const handleInputTextChanged = useCallback(
    (text: string) => {
      const isTyping = text.length > 0;

      // Clear any existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      // Only send updates when typing state changes to avoid unnecessary writes
      if (isTyping !== prevTypingStateRef.current) {
        // If typing started, update immediately
        if (isTyping) {
          updateTypingStatusImmediately(true);
          prevTypingStateRef.current = true;
        } else {
          // If typing stopped, use debounce to avoid flickering
          debouncedStopTyping();
        }
      }

      // Set timeout to clear typing status after inactivity
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          updateTypingStatusImmediately(false);
          prevTypingStateRef.current = false;
          typingTimeoutRef.current = null;
        }, TYPING_TIMEOUT);
      }
    },
    [updateTypingStatusImmediately, debouncedStopTyping],
  );

  // Make sure to cancel debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedStopTyping.cancel();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [debouncedStopTyping]);

  // Listen for typing status from other users
  useEffect(() => {
    if (!crewId || !user?.uid) return;

    const chatRef = doc(db, 'crew_chats', crewId);
    const unsubscribe = onSnapshot(
      chatRef,
      (docSnapshot) => {
        if (!docSnapshot.exists() || !user?.uid) return;

        const data = docSnapshot.data();

        if (data.typingStatus) {
          const typingUsers: { [uid: string]: boolean } = {};

          Object.keys(data.typingStatus).forEach((key) => {
            if (key.endsWith('LastUpdate') || key === user.uid) return;

            const uid = key;
            const isTyping = data.typingStatus[uid];
            const lastUpdate = data.typingStatus[`${uid}LastUpdate`];

            if (isTyping && lastUpdate) {
              const now = Date.now();
              const lastUpdateTime = lastUpdate.toMillis();
              typingUsers[uid] = now - lastUpdateTime < 10000; // 10s timeout
            }
          });

          setOtherUsersTyping(typingUsers);
        }
      },
      (error) => {
        if (!user?.uid) return;
        if (error.code === 'permission-denied') return;
        console.error('Error listening to crew chat document:', error);
      },
    );

    return () => unsubscribe();
  }, [crewId, user?.uid]);

  const conversationMessages = messages[crewId || ''] || [];

  // Transform the messages for GiftedChat
  const giftedChatMessages: IMessage[] = useMemo(() => {
    // Get messages from server
    const serverMessages = conversationMessages
      .map((message) => {
        return {
          _id: message.id,
          text: message.text,
          createdAt:
            message.createdAt instanceof Date
              ? message.createdAt
              : new Date(message.createdAt),
          user: {
            _id: message.senderId,
            name: message.senderName || 'Unknown',
            avatar:
              message.senderId === user?.uid
                ? user.photoURL
                : usersCache[message.senderId]?.photoURL,
          },
          sent: true,
        };
      })
      .reverse();

    // Filter out optimistic messages that have been confirmed
    const newOptimisticMessages = optimisticMessages.filter((optMsg) => {
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

    // Combine optimistic and server messages
    return [...newOptimisticMessages, ...serverMessages];
  }, [conversationMessages, user, usersCache, optimisticMessages]);

  // Set up message listener
  useEffect(() => {
    if (!crewId) return;
    console.log('[CrewChat] Setting up message listener for:', crewId);
    const unsubscribeMessages = listenToMessages(crewId);
    return () => unsubscribeMessages();
  }, [crewId, listenToMessages]);

  const onSend = useCallback(
    async (msgs: IMessage[] = []) => {
      const text = msgs[0].text;
      if (text && text.trim() !== '' && crewId) {
        // Create optimistic message
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
        };

        // Add to optimistic messages
        setOptimisticMessages((prev) => [...prev, optimisticMsg]);

        // Send to server
        try {
          await sendMessage(crewId, text.trim());
          // Explicitly set typing status to false when sending a message
          updateTypingStatusImmediately(false);
          prevTypingStateRef.current = false;
          await updateLastRead(crewId);
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
    [crewId, sendMessage, updateTypingStatusImmediately, updateLastRead, user],
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

  // Effect to auto-mark messages as read when receiving new messages
  useEffect(() => {
    if (!crewId || !isFocused) return;

    const currentMessageCount = conversationMessages.length;

    // Only update if we received new messages (not on initial load)
    if (
      previousMessageCountRef.current > 0 &&
      currentMessageCount > previousMessageCountRef.current
    ) {
      // Messages have increased while screen is focused - mark as read
      debouncedUpdateLastRead(crewId);
    }

    // Update the ref with current count for next comparison
    previousMessageCountRef.current = currentMessageCount;
  }, [conversationMessages, crewId, isFocused, debouncedUpdateLastRead]);

  // Reset the counter when changing chats
  useEffect(() => {
    previousMessageCountRef.current = 0;
  }, [crewId]);

  // Manage active chat state using focus
  useFocusEffect(
    useCallback(() => {
      if (crewId) {
        updateLastRead(crewId);
        addActiveChat(crewId);
      }
      return () => {
        if (crewId) removeActiveChat(crewId);
      };
    }, [crewId, updateLastRead, addActiveChat, removeActiveChat]),
  );

  // Handle AppState changes
  const appState = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/active/) &&
        nextAppState.match(/inactive|background/)
      ) {
        if (crewId) removeActiveChat(crewId);
      } else if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        if (isFocused && crewId) addActiveChat(crewId);
      }
      appState.current = nextAppState;
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [crewId, isFocused, addActiveChat, removeActiveChat]);

  // Get names of users who are currently typing
  const typingUserIds = useMemo(
    () => Object.keys(otherUsersTyping).filter((uid) => otherUsersTyping[uid]),
    [otherUsersTyping],
  );

  const typingDisplayNames = useMemo(() => {
    return typingUserIds.map((uid) => {
      return usersCache[uid]?.displayName || 'Someone';
    });
  }, [typingUserIds, usersCache]);

  // Custom input toolbar styled to resemble iOS
  const renderInputToolbar = (props: any) => (
    <InputToolbar {...props} containerStyle={styles.inputToolbarContainer} />
  );

  // Custom render function for message ticks
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
      if (message.sent) {
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

  // Only show typing indicator in footer
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

  // Add a custom avatar renderer
  const renderAvatar = useCallback(
    (props: AvatarProps<IMessage>) => {
      const messageUserId = props.currentMessage.user._id as string;
      const isCurrentUser = messageUserId === user?.uid;

      const imageUrl = isCurrentUser
        ? user?.photoURL || null
        : usersCache[messageUserId]?.photoURL || null;

      return (
        <ProfilePicturePicker
          imageUrl={imageUrl}
          onImageUpdate={() => {}}
          editable={false}
          size={36}
        />
      );
    },
    [user, usersCache],
  );

  if (!crewId) return <LoadingOverlay />;

  return (
    <View style={styles.container}>
      <GiftedChat
        messages={giftedChatMessages}
        onSend={(messages) => onSend(messages)}
        user={{
          _id: user?.uid || '',
          name: user?.displayName || 'You',
          avatar: user?.photoURL || undefined,
        }}
        bottomOffset={tabBarHeight - insets.bottom}
        isTyping={false}
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
        renderInputToolbar={renderInputToolbar}
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

export default CrewChatScreen;

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
});
