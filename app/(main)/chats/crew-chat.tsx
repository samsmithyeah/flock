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
  IMessage,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { pickImage, uploadImage, takePhoto } from '@/utils/imageUpload';
import ChatImageViewer from '@/components/ChatImageViewer';
import ImageOptionsMenu from '@/components/ImageOptionsMenu';
import PollCreationModal from '@/components/PollCreationModal';
import PollMessage from '@/components/PollMessage';

// Add Poll interface and extend IMessage
interface Poll {
  question: string;
  options: string[];
  votes: { [optionIndex: number]: string[] };
  totalVotes: number;
}

// Extend IMessage to include our poll property
interface ExtendedMessage extends IMessage {
  poll?: Poll;
}

const TYPING_TIMEOUT = 1000;
const READ_UPDATE_DEBOUNCE = 1000; // 1 second debounce for read status updates

const CrewChatScreen: React.FC = () => {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
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
  const { crews, usersCache, setUsersCache } = useCrews();
  const isFocused = useIsFocused();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, addActiveChat, removeActiveChat } = useUser();
  const [members, setMembers] = useState<User[]>([]);
  const [crew, setCrew] = useState<{ name: string; iconUrl?: string } | null>(
    null,
  );
  const [otherUsersTyping, setOtherUsersTyping] = useState<{
    [key: string]: boolean;
  }>({});
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<
    ExtendedMessage[]
  >([]);
  const [lastReadByUsers, setLastReadByUsers] = useState<{
    [uid: string]: Date;
  }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isImageMenuVisible, setIsImageMenuVisible] = useState(false);
  const [isPollModalVisible, setIsPollModalVisible] = useState(false);

  // Get pagination info for this chat
  const paginationInfo = crewId ? messagePaginationInfo[crewId] : undefined;

  // Handle loading earlier messages with debugging
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

  // Fetch members details using the global usersCache.
  useEffect(() => {
    if (!crewId || !user?.uid) return;
    const fetchMembers = async () => {
      try {
        const crewRef = doc(db, 'crews', crewId);
        const crewSnap = await getDoc(crewRef);
        if (crewSnap.exists()) {
          const crewData = crewSnap.data();
          const memberIds: string[] = crewData.memberIds || [];
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
          setMembers(fetchedMembers);
        } else {
          setMembers([]);
        }
      } catch (error) {
        console.error('Error fetching crew members:', error);
        setMembers([]);
      }
    };

    fetchMembers();
  }, [crewId, user?.uid]);

  // Log when pagination info changes
  useEffect(() => {
    if (paginationInfo) {
      console.log('[CrewChat] Pagination info updated:', {
        hasMore: paginationInfo.hasMore,
        loading: paginationInfo.loading,
      });
    }
  }, [paginationInfo]);

  useLayoutEffect(() => {
    if (crew) {
      navigation.setOptions({
        headerTitle: `${crew.name}`,
        headerStatusBarHeight: insets.top,
      });
    }
  }, [navigation, crew, insets.top]);

  // Typing status for crew chat.
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track previous typing state to prevent unnecessary updates
  const prevTypingStateRef = useRef<boolean>(false);

  // Function to immediately update typing status when typing starts
  const updateTypingStatusImmediately = useCallback(
    async (isTyping: boolean) => {
      if (!crewId || !user?.uid) return;
      try {
        await updateDoc(doc(db, 'crews', crewId, 'messages', 'metadata'), {
          [`typingStatus.${user.uid}`]: isTyping,
          [`typingStatus.${user.uid}LastUpdate`]: serverTimestamp(),
        });
      } catch (error: any) {
        if (error.code === 'not-found') {
          try {
            await setDoc(
              doc(db, 'crews', crewId, 'messages', 'metadata'),
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
          // If typing stopped, use debounce to avoid flickering when
          // user is just pausing between words
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

  const conversationMessages = messages[crewId || ''] || [];

  // Function to check if a message has been read by all participants
  const isMessageReadByAll = useCallback(
    (messageTimestamp: Date) => {
      // If we don't have member data or timestamp data, assume not read
      if (!members.length || !Object.keys(lastReadByUsers).length) {
        return false;
      }

      // Check if all other members have read the message
      return members.every((member) => {
        const lastReadTime = lastReadByUsers[member.uid];
        return lastReadTime && messageTimestamp < lastReadTime;
      });
    },
    [members, lastReadByUsers],
  );

  // Modified to include optimistic messages and read status
  const giftedChatMessages: ExtendedMessage[] = useMemo(() => {
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
                : members.find((m) => m.uid === message.senderId)
                    ?.displayName || 'Unknown',
            avatar:
              message.senderId === user?.uid
                ? user?.photoURL
                : members.find((m) => m.uid === message.senderId)?.photoURL,
          },
          sent: true, // All server messages were successfully sent
          received: isReadByAll || false, // Received when read by all members
          image: message.imageUrl, // Add image URL if it exists
          poll: message.poll, // Add poll data if it exists
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
    members,
    optimisticMessages,
    isMessageReadByAll,
  ]);

  useEffect(() => {
    if (!crewId) return;
    console.log('[CrewChat] Setting up message listener for:', crewId);
    const unsubscribeMessages = listenToMessages(crewId);
    return () => unsubscribeMessages();
  }, [crewId]);

  // Listen for last read timestamps from all members
  useEffect(() => {
    if (!crewId || !user?.uid) return;
    const chatRef = doc(db, 'crews', crewId, 'messages', 'metadata');
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
  }, [crewId, user?.uid]);

  const onSend = useCallback(
    async (msgs: ExtendedMessage[] = []) => {
      const text = msgs[0].text;
      if (text && text.trim() !== '' && crewId) {
        // Create optimistic message
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

  // Handle image picking and sending
  const handlePickImage = useCallback(async () => {
    if (!crewId || !user?.uid) return;

    try {
      const imageUri = await pickImage();
      if (!imageUri) return;

      setIsUploading(true);

      // Upload image to Firebase Storage
      const imageUrl = await uploadImage(imageUri, user.uid, crewId);

      // Send message with image
      await sendMessage(crewId, '', imageUrl);

      // Explicitly set typing status to false when sending a message
      updateTypingStatusImmediately(false);
      prevTypingStateRef.current = false;
      await updateLastRead(crewId);
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
    crewId,
    user?.uid,
    sendMessage,
    updateTypingStatusImmediately,
    updateLastRead,
  ]);

  // New function to handle taking a photo
  const handleTakePhoto = useCallback(async () => {
    if (!crewId || !user?.uid) return;

    try {
      const photoUri = await takePhoto();
      if (!photoUri) return;

      setIsUploading(true);

      // Upload image to Firebase Storage
      const imageUrl = await uploadImage(photoUri, user.uid, crewId);

      // Send message with image
      await sendMessage(crewId, '', imageUrl);

      // Explicitly set typing status to false
      updateTypingStatusImmediately(false);
      prevTypingStateRef.current = false;
      await updateLastRead(crewId);
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
    crewId,
    user?.uid,
    sendMessage,
    updateTypingStatusImmediately,
    updateLastRead,
  ]);

  // Handle poll creation
  const handleCreatePoll = useCallback(
    async (question: string, options: string[]) => {
      if (!crewId) return;
      try {
        await createPoll(crewId, question, options);
      } catch (error) {
        console.error('Error creating poll:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not create poll',
        });
      }
    },
    [crewId, createPoll],
  );

  // Handle voting in a poll
  const handleVotePoll = useCallback(
    async (messageId: string, optionIndex: number) => {
      if (!crewId) return;
      try {
        await votePoll(crewId, messageId, optionIndex);
      } catch (error) {
        console.error('Error voting in poll:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not submit vote',
        });
      }
    },
    [crewId, votePoll],
  );

  // Modified render actions function to show menu
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
  ]);

  // Custom render for poll messages - fixed with proper typing
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
            messageId={String(currentMessage._id)} // Convert to string for consistency
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

  // Manage active chat state when screen gains/loses focus.
  useFocusEffect(
    useCallback(() => {
      if (crewId) {
        updateLastRead(crewId);
        addActiveChat(crewId);
      }
      return () => {
        if (crewId) {
          removeActiveChat(crewId);
        }
      };
    }, [crewId, updateLastRead, addActiveChat, removeActiveChat]),
  );

  // Handle AppState changes.
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

  // Create a ref to track the previous message count for comparison
  const previousMessageCountRef = useRef<number>(0);

  // Debounced function to update last read status
  const debouncedUpdateLastRead = useMemo(
    () =>
      debounce((crewId: string) => {
        updateLastRead(crewId);
      }, READ_UPDATE_DEBOUNCE),
    [updateLastRead],
  );

  // Effect to auto-mark messages as read when receiving new messages while screen is focused
  useEffect(() => {
    if (!crewId || !isFocused) return;

    const currentMessageCount = conversationMessages.length;

    // Only update if we received new messages (not on initial load)
    if (
      previousMessageCountRef.current > 0 &&
      currentMessageCount > previousMessageCountRef.current
    ) {
      // New messages arrived while screen is focused - mark as read
      debouncedUpdateLastRead(crewId);
    }

    // Update the ref with current count for next comparison
    previousMessageCountRef.current = currentMessageCount;
  }, [conversationMessages, crewId, isFocused, debouncedUpdateLastRead]);

  // Reset the counter when changing chats
  useEffect(() => {
    previousMessageCountRef.current = 0;
  }, [crewId]);

  const typingUserIds = useMemo(
    () => Object.keys(otherUsersTyping).filter((uid) => otherUsersTyping[uid]),
    [otherUsersTyping],
  );

  const typingDisplayNames = useMemo(() => {
    return typingUserIds.map((uid) => {
      const member = members.find((m) => m.uid === uid);
      return member ? member.displayName : 'Someone';
    });
  }, [typingUserIds, members]);

  const renderAvatar = useCallback(
    (props: AvatarProps<ExtendedMessage>) => {
      const messageUserId = props.currentMessage.user._id;
      const messageUser = members.find((m) => m.uid === messageUserId);
      return (
        <ProfilePicturePicker
          imageUrl={messageUser?.photoURL || null}
          onImageUpdate={() => {}}
          editable={false}
          size={36}
        />
      );
    },
    [members],
  );

  // Custom input toolbar styled to resemble iOS.
  const renderInputToolbar = (props: any) => (
    <InputToolbar {...props} containerStyle={styles.inputToolbarContainer} />
  );

  // Custom render function for message ticks (WhatsApp style)
  const renderTicks = useCallback(
    (message: ExtendedMessage) => {
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

  // Custom render for image messages
  const renderMessageImage = useCallback(
    (props: MessageImageProps<ExtendedMessage>) => {
      return <ChatImageViewer {...props} imageStyle={styles.messageImage} />;
    },
    [],
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
