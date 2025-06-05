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

// Types and interfaces
interface Poll {
  question: string;
  options: string[];
  votes: { [optionIndex: number]: string[] };
  totalVotes: number;
}

interface ExtendedMessage extends IMessage {
  poll?: Poll;
}

// Constants
const TYPING_TIMEOUT = 1000;
const READ_UPDATE_DEBOUNCE = 1000;

// Custom hooks for state management
const useChatState = (chatId: string | null, user: any) => {
  const [otherMembers, setOtherMembers] = useState<User[]>([]);
  const [crew, setCrew] = useState<{ name: string; iconUrl?: string } | null>(
    null,
  );
  const [otherUsersTyping, setOtherUsersTyping] = useState<{
    [key: string]: boolean;
  }>({});
  const [lastReadByUsers, setLastReadByUsers] = useState<{
    [uid: string]: Date;
  }>({});
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isImageMenuVisible, setIsImageMenuVisible] = useState(false);
  const [isPollModalVisible, setIsPollModalVisible] = useState(false);

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

const useTypingHandler = (
  chatId: string | null,
  user: any,
  updateTypingStatusImmediately: any,
) => {
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevTypingStateRef = useRef<boolean>(false);

  const debouncedStopTyping = useMemo(
    () =>
      debounce(() => {
        updateTypingStatusImmediately(false);
        prevTypingStateRef.current = false;
      }, 500),
    [updateTypingStatusImmediately],
  );

  const handleInputTextChanged = useCallback(
    (text: string) => {
      const isTyping = text.length > 0;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      if (isTyping !== prevTypingStateRef.current) {
        if (isTyping) {
          updateTypingStatusImmediately(true);
          prevTypingStateRef.current = true;
        } else {
          debouncedStopTyping();
        }
      }

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

  useEffect(() => {
    return () => {
      debouncedStopTyping.cancel();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [debouncedStopTyping]);

  return { handleInputTextChanged };
};

const useOptimisticMessages = (
  conversationMessages: any[],
  user: any,
  otherMembers: User[],
  lastReadByUsers: any,
) => {
  const [optimisticMessages, setOptimisticMessages] = useState<
    ExtendedMessage[]
  >([]);

  const isMessageReadByAll = useCallback(
    (messageTimestamp: Date) => {
      if (!otherMembers.length || !Object.keys(lastReadByUsers).length) {
        return false;
      }
      return otherMembers.every((member) => {
        const lastReadTime = lastReadByUsers[member.uid];
        return lastReadTime && messageTimestamp < lastReadTime;
      });
    },
    [otherMembers, lastReadByUsers],
  );

  const giftedChatMessages: ExtendedMessage[] = useMemo(() => {
    const serverMessages = conversationMessages
      .map((message) => {
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
          sent: true,
          received: isReadByAll || false,
          image: message.imageUrl,
          poll: message.poll,
        };
      })
      .reverse();

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

    if (newOptimisticMessages.length !== optimisticMessages.length) {
      setOptimisticMessages(newOptimisticMessages);
    }

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

  return {
    giftedChatMessages,
    setOptimisticMessages,
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
  } = useChatState(chatId, user);

  const conversationMessages = messages[chatId || ''] || [];
  const paginationInfo = chatId ? messagePaginationInfo[chatId] : undefined;

  const { giftedChatMessages, setOptimisticMessages } = useOptimisticMessages(
    conversationMessages,
    user,
    otherMembers,
    lastReadByUsers,
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
    chatId,
    user,
    updateTypingStatusImmediately,
  );

  // Fetch crew details
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
  }, [crewId, crews, user?.uid, setCrew]);

  // Fetch other members
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
  }, [chatId, user?.uid, usersCache, setUsersCache, setOtherMembers]);

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

  // Computed values
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
