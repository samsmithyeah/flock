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
  ActivityIndicator,
} from 'react-native';
import {
  GiftedChat,
  IMessage,
  Bubble,
  Send,
  SendProps,
  AvatarProps,
  InputToolbar,
  LoadEarlier,
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
import { throttle, debounce } from 'lodash';
import moment from 'moment';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';

const TYPING_TIMEOUT = 1000;
const READ_UPDATE_DEBOUNCE = 1000; // 1 second debounce for read status updates

const CrewDateChatScreen: React.FC = () => {
  const { crewId, date, id } = useLocalSearchParams<{
    crewId: string;
    date: string;
    id?: string;
  }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {
    sendMessage,
    updateLastRead,
    messages,
    listenToMessages,
    loadEarlierMessages,
    messagePaginationInfo,
  } = useCrewDateChat();
  const { crews, usersCache, setUsersCache } = useCrews();
  const isFocused = useIsFocused();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, addActiveChat, removeActiveChat } = useUser();
  const [otherMembers, setOtherMembers] = useState<User[]>([]);
  const [crew, setCrew] = useState<{ name: string; iconUrl?: string } | null>(
    null,
  );
  const [otherUsersTyping, setOtherUsersTyping] = useState<{
    [key: string]: boolean;
  }>({});
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  // Add states for optimistic messages and reading status
  const [optimisticMessages, setOptimisticMessages] = useState<IMessage[]>([]);
  const [lastReadByUsers, setLastReadByUsers] = useState<{
    [uid: string]: Date;
  }>({});

  const chatId = useMemo(() => {
    if (id) return id;
    if (crewId && date) return generateChatId(crewId, date);
    return null;
  }, [crewId, date, id]);

  // Get pagination info for this chat
  const paginationInfo = chatId ? messagePaginationInfo[chatId] : undefined;

  // Handle loading earlier messages with debugging
  const handleLoadEarlier = useCallback(async () => {
    if (!chatId || isLoadingEarlier) {
      console.log(
        "[CrewDateChat] Can't load earlier messages:",
        !chatId ? 'Invalid chatId' : 'Already loading',
      );
      return;
    }

    if (!paginationInfo?.hasMore) {
      console.log('[CrewDateChat] No more earlier messages available');
      Toast.show({
        type: 'info',
        text1: 'No more messages',
        text2: 'You have reached the beginning of this conversation',
        position: 'bottom',
      });
      return;
    }

    console.log('[CrewDateChat] Loading earlier messages...');
    setIsLoadingEarlier(true);

    try {
      const hasMore = await loadEarlierMessages(chatId);
      console.log('[CrewDateChat] Loaded earlier messages, has more:', hasMore);

      if (!hasMore) {
        Toast.show({
          type: 'info',
          text1: 'No more messages',
          text2: 'You have reached the beginning of this conversation',
          position: 'bottom',
        });
      }
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
  }, [chatId, paginationInfo, loadEarlierMessages, isLoadingEarlier]);

  // Fetch crew details from crews context.
  useEffect(() => {
    if (!crewId || !user?.uid) {
      setCrew({ name: 'Unknown Crew', iconUrl: undefined });
      return;
    }

    const fetchCrew = async () => {
      const crewData = crews.find((c) => c.id === crewId);
      if (crewData) {
        setCrew({ name: crewData.name, iconUrl: crewData.iconUrl });
      } else {
        try {
          const crewDoc = await getDoc(doc(db, 'crews', crewId));
          if (crewDoc.exists()) {
            const data = crewDoc.data();
            setCrew({
              name: data.name || 'Unknown Crew',
              iconUrl: data.iconUrl,
            });
          } else {
            setCrew({ name: 'Unknown Crew', iconUrl: undefined });
          }
        } catch (error) {
          console.error('Error fetching crew details:', error);
          setCrew({ name: 'Unknown Crew', iconUrl: undefined });
        }
      }
    };

    fetchCrew();
  }, [crewId, crews, user?.uid]);

  // Fetch other members details using the global usersCache.
  useEffect(() => {
    if (!chatId || !user?.uid) return;
    const fetchMembers = async () => {
      try {
        const chatRef = doc(db, 'crew_date_chats', chatId);
        const chatSnap = await getDoc(chatRef);
        if (chatSnap.exists()) {
          const chatData = chatSnap.data();
          const memberIds: string[] = chatData.memberIds || [];
          const otherMemberIds = memberIds.filter((id) => id !== user?.uid);
          // For each member, try to use the cache; if not present, fallback to a one-time fetch.
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
  }, [chatId, user?.uid]);

  // Log when pagination info changes
  useEffect(() => {
    if (paginationInfo) {
      console.log('[CrewDateChat] Pagination info updated:', {
        hasMore: paginationInfo.hasMore,
        loading: paginationInfo.loading,
      });
    }
  }, [paginationInfo]);

  useLayoutEffect(() => {
    if (crew) {
      navigation.setOptions({
        headerTitle: `${crew.name} - ${moment(date).format('MMM Do')}`,
        headerStatusBarHeight: insets.top,
      });
    }
  }, [navigation, crew, date, insets.top]);

  // Typing status for group chat.
  let typingTimeout: NodeJS.Timeout;
  const updateTypingStatus = useMemo(
    () =>
      throttle(async (isTyping: boolean) => {
        if (!chatId || !user?.uid) return;
        const chatRef = doc(db, 'crew_date_chats', chatId);
        try {
          const chatSnap = await getDoc(chatRef);
          if (!chatSnap.exists()) {
            await setDoc(
              chatRef,
              {
                typingStatus: {
                  [user.uid]: isTyping,
                  [`${user.uid}LastUpdate`]: serverTimestamp(),
                },
              },
              { merge: true },
            );
          } else {
            await updateDoc(chatRef, {
              [`typingStatus.${user.uid}`]: isTyping,
              [`typingStatus.${user.uid}LastUpdate`]: serverTimestamp(),
            });
          }
        } catch (error) {
          console.error('Error updating typing status:', error);
        }
      }, 500),
    [chatId, user?.uid],
  );

  const handleInputTextChanged = useCallback(
    (text: string) => {
      const isTyping = text.length > 0;
      updateTypingStatus(isTyping);
      if (isTyping) {
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          updateTypingStatus(false);
        }, TYPING_TIMEOUT);
      } else {
        if (typingTimeout) clearTimeout(typingTimeout);
      }
    },
    [updateTypingStatus],
  );

  const conversationMessages = messages[chatId || ''] || [];

  // Function to check if a message has been read by all participants
  const isMessageReadByAll = useCallback(
    (messageTimestamp: Date) => {
      // If we don't have member data or timestamp data, assume not read
      if (!otherMembers.length || !Object.keys(lastReadByUsers).length) {
        return false;
      }

      // Check if all other members have read the message
      return otherMembers.every((member) => {
        const lastReadTime = lastReadByUsers[member.uid];
        return lastReadTime && messageTimestamp < lastReadTime;
      });
    },
    [otherMembers, lastReadByUsers],
  );

  // Modified to include optimistic messages and read status
  const giftedChatMessages: IMessage[] = useMemo(() => {
    // Get messages from server
    const serverMessages = conversationMessages
      .map((message) => {
        // Determine if message has been read by all other participants
        const messageTime =
          message.createdAt instanceof Date
            ? message.createdAt
            : new Date(message.createdAt);

        const isReadByAll =
          message.senderId === user?.uid && isMessageReadByAll(messageTime);

        return {
          _id: message.id,
          text: message.text,
          createdAt: messageTime,
          user: {
            _id: message.senderId,
            name:
              message.senderId === user?.uid
                ? user?.displayName || 'You'
                : otherMembers.find((m) => m.uid === message.senderId)
                    ?.displayName || 'Unknown',
            avatar:
              message.senderId === user?.uid
                ? user?.photoURL
                : otherMembers.find((m) => m.uid === message.senderId)
                    ?.photoURL,
          },
          sent: true, // All server messages were successfully sent
          received: isReadByAll || false, // Received when read by all members
        };
      })
      .reverse();

    // Filter out optimistic messages that have been confirmed by the server
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
  }, [
    conversationMessages,
    user?.uid,
    user?.displayName,
    user?.photoURL,
    otherMembers,
    optimisticMessages,
    isMessageReadByAll,
  ]);

  useEffect(() => {
    if (!chatId) return;
    console.log('[CrewDateChat] Setting up message listener for:', chatId);
    const unsubscribeMessages = listenToMessages(chatId);
    return () => unsubscribeMessages();
  }, [chatId]);

  // Listen for last read timestamps from all members
  useEffect(() => {
    if (!chatId || !user?.uid) return;
    const chatRef = doc(db, 'crew_date_chats', chatId);
    const unsubscribe = onSnapshot(
      chatRef,
      (docSnapshot) => {
        if (!user?.uid) return;
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
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

          // Continue with typing status handling
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
  }, [chatId, user?.uid]);

  const onSend = useCallback(
    async (msgs: IMessage[] = []) => {
      const text = msgs[0].text;
      if (text && text.trim() !== '' && chatId) {
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
          // Note: We don't set sent or received yet
        };

        // Add to optimistic messages
        setOptimisticMessages((prev) => [...prev, optimisticMsg]);

        // Send to server
        try {
          await sendMessage(chatId, text.trim());
          updateTypingStatus(false);
          await updateLastRead(chatId);
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
    [chatId, sendMessage, updateTypingStatus, updateLastRead, user],
  );

  // Manage active chat state when screen gains/loses focus.
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

  // Handle AppState changes.
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
    if (!chatId || !isFocused) return;

    const currentMessageCount = conversationMessages.length;

    // Only update if we received new messages (not on initial load)
    if (
      previousMessageCountRef.current > 0 &&
      currentMessageCount > previousMessageCountRef.current
    ) {
      // New messages arrived while screen is focused - mark as read
      debouncedUpdateLastRead(chatId);
    }

    // Update the ref with current count for next comparison
    previousMessageCountRef.current = currentMessageCount;
  }, [conversationMessages, chatId, isFocused, debouncedUpdateLastRead]);

  // Reset the counter when changing chats
  useEffect(() => {
    previousMessageCountRef.current = 0;
  }, [chatId]);

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

  const renderAvatar = useCallback(
    (props: AvatarProps<IMessage>) => {
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

  // Custom input toolbar styled to resemble iOS.
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
        // Double blue ticks for read by all members
        return (
          <View style={styles.tickContainer}>
            <Ionicons name="checkmark-done" size={14} color="#4FC3F7" />
          </View>
        );
      } else if (message.sent) {
        // Single gray tick for delivered but not read by all
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

  // Only show typing indicator in footer, not loading earlier messages
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

  if (!chatId) return <LoadingOverlay />;
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
        loadEarlier={paginationInfo?.hasMore === true}
        isLoadingEarlier={isLoadingEarlier}
        onLoadEarlier={handleLoadEarlier}
        renderLoadEarlier={renderLoadEarlier}
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
