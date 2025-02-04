// screens/DMChatScreen.tsx

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
} from 'react-native-gifted-chat';
import { useUser } from '@/context/UserContext';
import { useDirectMessages } from '@/context/DirectMessagesContext';
import { useCrews } from '@/context/CrewsContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { NavParamList } from '@/navigation/AppNavigator';
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
import {
  useIsFocused,
  useNavigation,
  NavigationProp,
} from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { User } from '@/types/User';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import { throttle } from 'lodash';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type DMChatScreenProps = NativeStackScreenProps<NavParamList, 'DMChat'>;
type RouteParams = { otherUserId: string };

const TYPING_TIMEOUT = 1000;

const DMChatScreen: React.FC<DMChatScreenProps> = ({ route }) => {
  const { otherUserId } = route.params as RouteParams;
  const navigation = useNavigation<NavigationProp<NavParamList>>();
  const { sendMessage, updateLastRead, messages, listenToDMMessages } =
    useDirectMessages();
  const { usersCache, setUsersCache, fetchUserDetails } = useCrews();
  const isFocused = useIsFocused();
  const tabBarHeight = useBottomTabBarHeight();
  const isFocusedRef = useRef(isFocused);
  const { user, addActiveChat, removeActiveChat } = useUser();
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const insets = useSafeAreaInsets();

  // Generate conversationId from current and other user IDs.
  const conversationId = useMemo(() => {
    if (!user?.uid || !otherUserId) return '';
    return generateDMConversationId(user.uid, otherUserId);
  }, [user?.uid, otherUserId]);

  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  // Listen for typing status updates.
  useEffect(() => {
    if (!conversationId) return;
    const convoRef = doc(db, 'direct_messages', conversationId);
    const unsubscribe = onSnapshot(convoRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.typingStatus) {
          const otherTyping = data.typingStatus[otherUserId] || false;
          setIsOtherUserTyping(Boolean(otherTyping));
        } else {
          setIsOtherUserTyping(false);
        }
      } else {
        setIsOtherUserTyping(false);
      }
    });
    return () => unsubscribe();
  }, [conversationId, otherUserId]);

  useEffect(() => {
    if (usersCache[otherUserId]) {
      setOtherUser(usersCache[otherUserId]);
    } else {
      console.log(
        'Fetching user details from dmchatscreen line 100 for',
        otherUserId,
      );
      fetchUserDetails(otherUserId).then((user) => {
        setOtherUser(user);
      });
    }
  }, [otherUserId, usersCache, setUsersCache, fetchUserDetails]);

  useLayoutEffect(() => {
    if (otherUser) {
      navigation.setOptions({
        title: otherUser.displayName,
        headerStatusBarHeight: insets.top,
      });
    }
  }, [navigation, otherUser, insets.top]);

  let typingTimeout: NodeJS.Timeout;
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

  const conversationMessages = messages[conversationId] || [];
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
              : otherUser?.displayName || 'Unknown',
          avatar:
            message.senderId === user?.uid
              ? user?.photoURL
              : otherUser?.photoURL,
          isOnline: message.senderId === user?.uid ? true : otherUser?.isOnline,
        },
      }))
      .reverse();
  }, [
    conversationMessages,
    user?.uid,
    user?.displayName,
    user?.photoURL,
    otherUser,
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
        await sendMessage(conversationId, text.trim());
        updateTypingStatus(false);
        await updateLastRead(conversationId);
      }
    },
    [conversationId, sendMessage, updateTypingStatus, updateLastRead],
  );

  useEffect(() => {
    if (isFocused && conversationId) {
      updateLastRead(conversationId);
      addActiveChat(conversationId);
    } else if (!isFocused && conversationId) {
      removeActiveChat(conversationId);
    }
  }, [
    isFocused,
    conversationId,
    updateLastRead,
    addActiveChat,
    removeActiveChat,
  ]);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/active/) &&
        nextAppState.match(/inactive|background/)
      ) {
        if (conversationId) removeActiveChat(conversationId);
      } else if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        if (isFocusedRef.current && conversationId)
          addActiveChat(conversationId);
      }
      appState.current = nextAppState;
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [conversationId, addActiveChat, removeActiveChat]);

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

  if (!conversationId) return <LoadingOverlay />;
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
          />
        )}
        renderSend={(props: SendProps<IMessage>) => (
          <Send
            {...props}
            containerStyle={{
              justifyContent: 'center',
              paddingHorizontal: 10,
              opacity: props.text ? 1 : 0.5,
            }}
            alwaysShowSend
          >
            <Ionicons size={30} color={'#1E90FF'} name={'arrow-up-circle'} />
          </Send>
        )}
        renderFooter={() =>
          isOtherUserTyping ? (
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>
                {otherUser?.displayName} is typing...
              </Text>
            </View>
          ) : null
        }
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
});
