import React, { useEffect, useRef } from 'react';
import { ExpoRoot, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { captureConsoleIntegration } from '@sentry/core';
import { useUser } from '@/context/UserContext';

Sentry.init({
  dsn: 'https://ea17b86dea77e3f6b37bd8ad04223206@o4508365591281664.ingest.de.sentry.io/4508365591674960',
  integrations: [captureConsoleIntegration({ levels: ['warn', 'error'] })],
  tracesSampleRate: 1.0,
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Create a dummy context that mimics a require context.
// A proper require context is a function that has additional properties:
// keys, resolve, and id.
function dummyRequireContext(id: string) {
  throw new Error('Module not found: ' + id);
}
dummyRequireContext.keys = () => [];
dummyRequireContext.resolve = (id: string) => id;
dummyRequireContext.id = 'dummy';

function AppWrapper() {
  const { user } = useUser();
  const router = useRouter();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!user) return;

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log('Notification Received:', notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log('Notification Response:', response);
        const { screen, crewId, chatId, senderId, date, userId } =
          response.notification.request.content.data;

        switch (screen) {
          case 'Crew':
            if (crewId) {
              router.push({
                pathname: '/(main)/crews/[crewId]',
                params: { crewId, ...(date ? { date } : {}) },
              });
            }
            break;
          case 'CrewDateChat':
            if (chatId) {
              const [crewId, chatDate] = chatId.split('_');
              router.push({
                pathname: '/(main)/crews/crew-date-chat',
                params: { id: chatId, crewId, date: chatDate },
              });
            }
            break;
          case 'DMChat':
            if (senderId) {
              console.log('Navigating to DMChat');
              router.push({
                pathname: '/(main)/chats/dm-chat',
                params: { otherUserId: senderId },
              });
            }
            break;
          case 'OtherUserProfile':
            if (userId) {
              router.push({
                pathname: '/(main)/contacts/other-user-profile',
                params: { userId },
              });
            }
            break;
          default:
            console.warn(
              `Unknown screen "${screen}" received in notification.`,
            );
        }
      });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(
          notificationListener.current,
        );
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user, router]);

  return <ExpoRoot context={dummyRequireContext} />;
}

export default Sentry.wrap(AppWrapper);
