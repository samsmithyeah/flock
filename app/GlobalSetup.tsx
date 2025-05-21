// app/GlobalSetup.tsx
import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { captureConsoleIntegration } from '@sentry/core';
import { useUser } from '@/context/UserContext';
import Toast from 'react-native-toast-message';
import { useContacts } from '@/context/ContactsContext';
import * as Location from 'expo-location';
import { firebase } from '../firebase';
import { doc, updateDoc, serverTimestamp, GeoPoint } from 'firebase/firestore';
import { AppState, AppStateStatus } from 'react-native';


Sentry.init({
  dsn: 'https://ea17b86dea77e3f6b37bd8ad04223206@o4508365591281664.ingest.de.sentry.io/4508365591674960',
  integrations: [captureConsoleIntegration({ levels: ['warn', 'error'] })],
  tracesSampleRate: 1.0,
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false, // Setting to false, custom toast will be shown
    shouldPlaySound: false, // Controlled by custom toast or specific notification data
    shouldSetBadge: false,  // Badge count is managed separately
  }),
});

export default function GlobalSetup() {
  const { user: currentUser } = useUser(); // loadingUser removed as it's not used
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
      // Check current permission status without asking again.
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission not granted for background update. Will not attempt to fetch.');
        // Optionally, could attempt to request permission here if desired,
        // but for a background task, usually rely on pre-existing permission.
        // const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        // if (newStatus !== 'granted') return;
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
    };
  }, []);


  // Effect for managing periodic location updates based on user and appState
  useEffect(() => {
    if (currentUser && appState === 'active') {
      // Clear any existing interval before starting a new one
      if (locationUpdateIntervalRef.current) {
        clearInterval(locationUpdateIntervalRef.current);
      }
      
      console.log('Attempting initial location update (GlobalSetup)...');
      updateLastKnownLocation(); 
      
      locationUpdateIntervalRef.current = setInterval(updateLastKnownLocation, 5 * 60 * 1000); // 5 minutes
      console.log('Started periodic location updates from GlobalSetup.');

    } else {
      // If user logs out or app is not active, clear the interval
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
        console.log('Cleaned up location interval on unmount or user/appState change in GlobalSetup.');
      }
    };
  }, [currentUser, appState]); // Dependencies: currentUser and appState


  // Existing useEffect for notifications
  useEffect(() => {
    if (!currentUser) return; 

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        Toast.show({
          type: 'notification', // Ensure you have a 'notification' type defined in Toast config
          text1: notification.request.content.title || 'Notification',
          text2: notification.request.content.body ?? undefined,
          props: {
            // Pass raw data if your custom toast needs it or for complex onPress
            notificationData: notification.request.content.data 
          },
          onPress: () => {
            Notifications.dismissNotificationAsync(notification.request.identifier); // Dismiss it from shade
            handleNotificationRedirect(
              notification.request.content.data,
              router,
            );
          }
        });
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        // User tapped on the notification in the system tray
        handleNotificationRedirect(
          response.notification.request.content.data,
          router,
        );
      });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [currentUser, router]); 

  const handleNotificationRedirect = (
    data: any, // data is an object: { [key: string]: unknown }
    // router: ReturnType<typeof useRouter>, // router is already available in the component scope
  ) => {
    const { screen, crewId, chatId, senderId, date, userId, pollId, 
            screenIdentifier, signalId: notificationSignalId, 
            recipientId: notificationRecipientId, recipientName: notificationRecipientName } = data || {};

    if (screenIdentifier === 'BatSignalResponse' && notificationSignalId && senderId) {
      console.log("Redirecting to BatSignalResponseScreen for signal:", notificationSignalId);
      router.push({
        pathname: '/(main)/signal/BatSignalResponseScreen',
        params: { signalId: notificationSignalId, senderIdFromNotification: senderId },
      });
      return; 
    }

    if (screenIdentifier === 'SignalAcceptedNotification' && notificationSignalId && notificationRecipientId) {
      console.log(`Signal ${notificationSignalId} accepted by ${notificationRecipientId} (${notificationRecipientName || 'N/A'})`);
      // Navigate to the main signal screen. The screen itself has listeners
      // to handle displaying consent modals if needed.
      // Pass params that might be useful for the signal screen to highlight the interaction.
      router.push({
        pathname: '/(main)/signal/index', // Assuming this is the sender's main signal screen
        params: { 
          activeSignalId: notificationSignalId, // To potentially show this signal as active
          highlightRecipientId: notificationRecipientId, // To potentially highlight this recipient
          action: 'viewConsent' // A hint to the screen to check consent status for this recipient
        },
      });
      return;
    }

    // Existing switch cases
    switch (screen) {
      case 'Crew':
        if (crewId && date) {
          router.push({ pathname: '/(main)/crews/[crewId]/calendar', params: { crewId, date } });
        } else if (crewId) {
          router.push({ pathname: '/(main)/crews/[crewId]', params: { crewId } });
        }
        break;
      case 'CrewDateChat':
        if (chatId) {
          const [parsedCrewId, chatDate] = chatId.split('_');
          router.push({ pathname: '/(main)/chats/crew-date-chat', params: { id: chatId, crewId: parsedCrewId, date: chatDate } });
        }
        break;
      case 'DMChat':
        if (senderId) {
          router.push({ pathname: '/(main)/chats/dm-chat', params: { otherUserId: senderId } });
        }
        break;
      case 'OtherUserProfile':
        if (userId) {
          refreshContacts(); // Assuming this is a desired side-effect
          router.push({ pathname: '/(main)/contacts/other-user-profile', params: { userId } });
        }
        break;
      case 'Invitations':
        router.push('/(main)/invitations');
        break;
      case 'EventPollRespond':
        if (pollId) {
          router.push({ pathname: '/(main)/crews/event-poll/respond', params: { pollId } });
        }
        break;
      case 'EventPollDetails':
        if (pollId) {
          router.push({ pathname: '/(main)/crews/event-poll/[pollId]', params: { pollId } });
        }
        break;
      default:
        if(screenIdentifier) { // If it was a known screenIdentifier but not caught above
             console.warn(`Unhandled known screenIdentifier "${screenIdentifier}" in notification.`);
        } else if (screen) { // If it was an old screen type
            console.warn(`Unknown screen "${screen}" received in notification.`);
        } else {
            console.warn("Notification data did not contain a recognized screen or screenIdentifier.");
        }
    }
  };

  return null;
}
