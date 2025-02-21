// app/GlobalSetup.tsx
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
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

export default function GlobalSetup() {
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
        const { screen, crewId, chatId, senderId, date, userId } =
          response.notification.request.content.data;

        switch (screen) {
          case 'Crew':
            if (crewId) {
              router.push(
                {
                  pathname: '/(main)/crews/[crewId]',
                  params: { crewId, ...(date ? { date } : {}) },
                },
                { withAnchor: true },
              );
            }
            break;
          case 'CrewDateChat':
            if (chatId) {
              const [crewId, chatDate] = chatId.split('_');
              router.push(
                {
                  pathname: '/(main)/chats/crew-date-chat',
                  params: { id: chatId, crewId, date: chatDate },
                },
                { withAnchor: true },
              );
            }
            break;
          case 'DMChat':
            if (senderId) {
              router.push(
                {
                  pathname: '/(main)/chats/dm-chat',
                  params: { otherUserId: senderId },
                },
                { withAnchor: true },
              );
            }
            break;
          case 'OtherUserProfile':
            if (userId) {
              router.push(
                {
                  pathname: '/(main)/contacts/other-user-profile',
                  params: { userId },
                },
                { withAnchor: true },
              );
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

  return null;
}
