// app/GlobalSetup.tsx
import { useEffect, useRef, useState } from 'react'; // Added useState
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { captureConsoleIntegration } from '@sentry/core';
import { useUser } from '@/context/UserContext';
import Toast from 'react-native-toast-message';
import { useContacts } from '@/context/ContactsContext';
import * as Location from 'expo-location'; // Added
import { firebase } from '../firebase'; // Added
import { doc, updateDoc, serverTimestamp, GeoPoint } from 'firebase/firestore'; // Added
import { AppState, AppStateStatus } from 'react-native'; // Added


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

export default function GlobalSetup() {
  const { user: currentUser, loadingUser } = useUser(); // Renamed user to currentUser, added loadingUser
  const { refreshContacts } = useContacts();
  const router = useRouter();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // For periodic location updates
  const [appState, setAppState] = useState(AppState.currentState);
  const locationUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const updateLastKnownLocation = async () => {
    if (!currentUser) return;

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission not granted for background update.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, 
      });

      if (location) {
        const userDocRef = doc(firebase.firestore, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
          lastKnownLocation: new GeoPoint(location.coords.latitude, location.coords.longitude),
          lastKnownLocationTimestamp: serverTimestamp(),
        });
        console.log('User lastKnownLocation updated via GlobalSetup.');
      }
    } catch (error) {
      console.error('Error updating lastKnownLocation via GlobalSetup:', error);
    }
  };

  // Effect for AppState listener
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      setAppState(nextAppState);
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      // Clear interval here too, as component might unmount while app is active
      if (locationUpdateIntervalRef.current) {
        clearInterval(locationUpdateIntervalRef.current);
        locationUpdateIntervalRef.current = null;
        console.log('Cleared location interval on AppState listener cleanup.');
      }
    };
  }, []);


  // Effect for managing periodic location updates based on user and appState
  useEffect(() => {
    if (currentUser && appState === 'active') {
      if (locationUpdateIntervalRef.current) {
        clearInterval(locationUpdateIntervalRef.current);
      }
      
      console.log('Attempting initial location update...');
      updateLastKnownLocation(); 
      
      locationUpdateIntervalRef.current = setInterval(updateLastKnownLocation, 5 * 60 * 1000); // 5 minutes
      console.log('Started periodic location updates from GlobalSetup.');

    } else {
      if (locationUpdateIntervalRef.current) {
        clearInterval(locationUpdateIntervalRef.current);
        locationUpdateIntervalRef.current = null;
        console.log('Stopped periodic location updates from GlobalSetup.');
      }
    }

    // Cleanup function for this effect
    return () => {
      if (locationUpdateIntervalRef.current) {
        clearInterval(locationUpdateIntervalRef.current);
        locationUpdateIntervalRef.current = null;
        console.log('Cleaned up location interval on user/appState change in GlobalSetup.');
      }
    };
  }, [currentUser, appState]);


  // Existing useEffect for notifications
  useEffect(() => {
    if (!currentUser) return; // Use currentUser consistently

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
  }, [currentUser, router]); // Depend on currentUser

  const handleNotificationRedirect = (
    data: any,
    router: ReturnType<typeof useRouter>,
  ) => {
    const { screen, crewId, chatId, senderId, date, userId, pollId, screenIdentifier, signalId: notificationSignalId } = data;

    // Handle BatSignalResponse first
    if (screenIdentifier === 'BatSignalResponse' && notificationSignalId && senderId) {
      router.push({
        pathname: '/(main)/signal/BatSignalResponseScreen',
        params: { signalId: notificationSignalId, senderIdFromNotification: senderId },
      });
      return; 
    }

    switch (screen) {
      case 'Crew':
        if (crewId && date) {
          router.push(
            {
              pathname: '/(main)/crews/[crewId]/calendar',
              params: { crewId, ...{ date } },
            },
            { withAnchor: true },
          );
          break;
        }
        if (crewId) {
          router.push(
            {
              pathname: '/(main)/crews/[crewId]',
              params: { crewId },
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
          refreshContacts();
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
      case 'EventPollRespond':
        if (pollId) {
          router.push(
            {
              pathname: '/(main)/crews/event-poll/respond',
              params: { pollId },
            },
            { withAnchor: true },
          );
        }
        break;
      case 'EventPollDetails':
        if (pollId) {
          router.push(
            {
              pathname: '/(main)/crews/event-poll/[pollId]',
              params: { pollId },
            },
            { withAnchor: true },
          );
        }
        break;
      default:
        console.warn(`Unknown screen "${screen}" received in notification.`);
    }
  };

  return null;
}
