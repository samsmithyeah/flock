// app/(main)/chats/crew-date-chat.tsx

import React, {
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useCallback,
  useState,
} from 'react';
import { View, StyleSheet, Text, AppState, AppStateStatus } from 'react-native';
import {
  GiftedChat,
  IMessage,
  Bubble,
  Send,
  SendProps,
  AvatarProps,
  InputToolbar,
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
import { throttle } from 'lodash';
import moment from 'moment';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';

const TYPING_TIMEOUT = 1000;

const CrewDateChatScreen: React.FC = () => {
  const { crewId, date, id } = useLocalSearchParams<{
    crewId: string;
    date: string;
    id?: string;
  }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { sendMessage, updateLastRead, messages, listenToMessages } =
    useCrewDateChat();
  const { crews, usersCache, setUsersCache } = useCrews();
  const isFocused = navigation.isFocused();
  const tabBarHeight = useBottomTabBarHeight();
  const isFocusedRef = useRef(isFocused);
  const { user, addActiveChat, removeActiveChat } = useUser();
  const [otherMembers, setOtherMembers] = useState<User[]>([]);
  const [crew, setCrew] = useState<{ name: string; iconUrl?: string } | null>(
    null,
  );
  const [otherUsersTyping, setOtherUsersTyping] = useState<{
    [key: string]: boolean;
  }>({});

  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  const chatId = useMemo(() => {
    if (id) return id;
    if (crewId && date) return generateChatId(crewId, date);
    return null;
  }, [crewId, date, id]);

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
  const giftedChatMessages: IMessage[] = useMemo(() => {
    return conversationMessages
      .map((message) => ({
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
              : otherMembers.find((m) => m.uid === message.senderId)
                  ?.displayName || 'Unknown',
          avatar:
            message.senderId === user?.uid
              ? user?.photoURL
              : otherMembers.find((m) => m.uid === message.senderId)?.photoURL,
        },
      }))
      .reverse();
  }, [
    conversationMessages,
    user?.uid,
    user?.displayName,
    user?.photoURL,
    otherMembers,
  ]);

  useEffect(() => {
    if (!chatId) return;
    const unsubscribeMessages = listenToMessages(chatId);
    return () => unsubscribeMessages();
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !user?.uid) return;
    const chatRef = doc(db, 'crew_date_chats', chatId);
    const unsubscribeTyping = onSnapshot(
      chatRef,
      (docSnapshot) => {
        if (!user?.uid) return;
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
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
                if (now - lastUpdateMillis < TYPING_TIMEOUT) {
                  updatedTypingStatus[uid] = true;
                } else {
                  updatedTypingStatus[uid] = false;
                }
              } else {
                updatedTypingStatus[uid] = false;
              }
            });
            if (user?.uid) delete updatedTypingStatus[user.uid];
            setOtherUsersTyping(updatedTypingStatus);
          } else {
            setOtherUsersTyping({});
          }
        } else {
          setOtherUsersTyping({});
        }
      },
      (error) => {
        if (!user?.uid) return;
        if (error.code === 'permission-denied') return;
        console.error('Error listening to typing status (group):', error);
      },
    );
    return () => unsubscribeTyping();
  }, [chatId, user?.uid]);

  const onSend = useCallback(
    async (msgs: IMessage[] = []) => {
      const text = msgs[0].text;
      if (text && text.trim() !== '') {
        await sendMessage(chatId!, text.trim());
        updateTypingStatus(false);
        await updateLastRead(chatId!);
      }
    },
    [chatId, sendMessage, updateTypingStatus, updateLastRead],
  );

  useEffect(() => {
    if (isFocused && chatId) {
      updateLastRead(chatId);
      addActiveChat(chatId);
    } else if (!isFocused && chatId) {
      removeActiveChat(chatId);
    }
  }, [isFocused, chatId, updateLastRead, addActiveChat, removeActiveChat]);

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
        if (isFocusedRef.current && chatId) addActiveChat(chatId);
      }
      appState.current = nextAppState;
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [chatId, addActiveChat, removeActiveChat]);

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
            wrapperStyle={{ left: { backgroundColor: '#BFF4BE' } }}
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
        renderFooter={() =>
          typingDisplayNames.length > 0 ? (
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>
                {typingDisplayNames.join(', ')}{' '}
                {typingDisplayNames.length === 1 ? 'is' : 'are'} typing...
              </Text>
            </View>
          ) : null
        }
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
});
