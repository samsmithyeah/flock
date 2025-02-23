// app/(main)/chats/dm-chat.tsx

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
import { throttle } from 'lodash';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';

const TYPING_TIMEOUT = 1000;

const DMChatScreen: React.FC = () => {
  const { otherUserId } = useLocalSearchParams<{ otherUserId: string }>();
  const navigation = useNavigation();
  const { sendMessage, updateLastRead, messages, listenToDMMessages } =
    useDirectMessages();
  const { usersCache, fetchUserDetails } = useCrews();
  const isFocused = useIsFocused();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, addActiveChat, removeActiveChat } = useUser();
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const insets = useSafeAreaInsets();

  // Generate conversationId from current and other user IDs.
  const conversationId = useMemo(() => {
    if (!user?.uid || !otherUserId) return '';
    return generateDMConversationId(user.uid, otherUserId);
  }, [user?.uid, otherUserId]);

  // Listen for typing status updates.
  useEffect(() => {
    if (!conversationId) return;
    const convoRef = doc(db, 'direct_messages', conversationId);
    const unsubscribe = onSnapshot(
      convoRef,
      (docSnap) => {
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
      },
      (error) => {
        if (error.code === 'permission-denied') return;
        console.error('Error listening to typing status:', error);
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
  }, [conversationMessages, user, otherUser]);

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
});
