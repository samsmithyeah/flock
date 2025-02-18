// App.tsx
import React, { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import AppNavigator from '@/navigation/AppNavigator';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { useUser } from '@/context/UserContext';
import { NavParamList } from '@/navigation/AppNavigator';
import * as Sentry from '@sentry/react-native';
import { captureConsoleIntegration } from '@sentry/core';

Sentry.init({
  dsn: 'https://ea17b86dea77e3f6b37bd8ad04223206@o4508365591281664.ingest.de.sentry.io/4508365591674960',
  integrations: [captureConsoleIntegration({ levels: ['warn', 'error'] })],
  tracesSampleRate: 1.0,
});

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const App: React.FC = () => {
  const { user } = useUser();
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const navigation = useNavigation<StackNavigationProp<NavParamList>>();

  useEffect(() => {
    if (!user) return;
    // Listen to incoming notifications while the app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log('Notification Received:', notification);
      });

    // Listen to notification responses (when user taps on a notification)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log('Notification Response:', response);
        const { screen, crewId, chatId, senderId, date, userId } =
          response.notification.request.content.data;

        switch (screen) {
          case 'Crew':
            if (crewId) {
              navigation.navigate('CrewsStack', {
                screen,
                params: { crewId, ...(date && { date }) },
                initial: false,
              });
            }
            break;
          case 'CrewDateChat':
            if (chatId) {
              const crewId = chatId.split('_')[0];
              const date = chatId.split('_')[1];
              navigation.navigate('ChatsStack', {
                screen,
                params: { id: chatId, crewId, date },
                initial: false,
              });
            }
            break;
          case 'DMChat':
            if (senderId) {
              console.log('Navigating to DMChat');
              console.log('Sender ID:', senderId);
              navigation.navigate('ChatsStack', {
                screen,
                params: { otherUserId: senderId },
                initial: false,
              });
            }
            break;
          case 'OtherUserProfile':
            if (userId) {
              navigation.navigate('ContactsStack', {
                screen,
                params: { userId },
                initial: false,
              });
            }
            break;
          default:
            if (screen) {
              navigation.navigate(screen);
            } else {
              console.log('No screen to navigate to');
            }
        }
      });

    return () => {
      Notifications.removeNotificationSubscription(
        notificationListener.current,
      );
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [user]);

  return <AppNavigator />;
};

export default Sentry.wrap(App);
