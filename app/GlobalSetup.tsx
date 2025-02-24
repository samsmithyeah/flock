// app/GlobalSetup.tsx
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { captureConsoleIntegration } from '@sentry/core';
import { useUser } from '@/context/UserContext';
import Toast from 'react-native-toast-message';

Sentry.init({
  dsn: 'https://ea17b86dea77e3f6b37bd8ad04223206@o4508365591281664.ingest.de.sentry.io/4508365591674960',
  integrations: [captureConsoleIntegration({ levels: ['warn', 'error'] })],
  tracesSampleRate: 1.0,
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function handleNotificationRedirect(
  data: any,
  router: ReturnType<typeof useRouter>,
) {
  const { screen, crewId, chatId, senderId, date, userId } = data;
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
    case 'Invitations':
      router.push('/(main)/invitations');
      break;
    default:
      console.warn(`Unknown screen "${screen}" received in notification.`);
  }
}

export default function GlobalSetup() {
  const { user } = useUser();
  const router = useRouter();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!user) return;

    // Listener to display a custom toast on notification reception
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        Toast.show({
          type: 'notification',
          text1: notification.request.content.title || 'Notification',
          text2: notification.request.content.body ?? undefined,
          onPress: () =>
            handleNotificationRedirect(
              notification.request.content.data,
              router,
            ),
        });
      });

    // Listener for handling notification responses (e.g. tapped from the system tray)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationRedirect(
          response.notification.request.content.data,
          router,
        );
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
