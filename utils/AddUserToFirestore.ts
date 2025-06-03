import { isDevice } from 'expo-device';
import Constants from 'expo-constants';
import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { db } from '@/firebase';
import { User } from '@/types/User';
import Toast from 'react-native-toast-message';

export const registerForPushNotificationsAsync = async (user: User) => {
  let token: string | undefined;

  if (isDevice) {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    console.log('Existing permission status:', existingStatus);
    if (existingStatus !== 'granted') {
      console.log('Requesting permission for push notifications');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('Permission status:', finalStatus);
    }
    if (finalStatus !== 'granted') {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to get push token',
      });
      return;
    }
    console.log('Getting Expo push token');
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        throw new Error('Project ID is not defined in Expo config');
      }
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (error) {
      if (error instanceof Error) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: `Error getting Expo push token: ${error.message}`,
        });
        console.error('Error getting Expo push token:', error);
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Error getting Expo push token',
        });
        console.error('Error getting Expo push token:', error);
      }
    }
    console.log('Expo Push Token:', token);
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  if (token) {
    try {
      const userRef = doc(db, 'users', user.uid);
      // If storing a single token
      console.log('Updating user with token:', token);
      await updateDoc(userRef, {
        expoPushToken: token,
      });
      console.log('Expo push token saved successfully.');

      // If supporting multiple tokens per user (e.g., multiple devices)
      // await updateDoc(userRef, {
      //   expoPushTokens: arrayUnion(token),
      // });
    } catch (error) {
      console.error('Error saving Expo push token:', error);
    }
  }

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }
};

export const addUserToFirestore = async (user: User, phoneNumber?: string) => {
  const userDocRef = doc(db, 'users', user.uid);
  try {
    const userData: User = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      photoURL: user.photoURL,
      badgeCount: 0,
      phoneNumber: phoneNumber || '', // Add this line
      locationTrackingEnabled: true, // Default to enabled for new users
    };
    const userExists = (await getDoc(userDocRef)).exists();
    if (userExists) {
      console.log('User document already exists in Firestore.');
      if (phoneNumber) {
        await updateDoc(userDocRef, { phoneNumber });
        console.log('User phone number updated in Firestore.');
      }
      return;
    }
    await setDoc(userDocRef, userData, { merge: true });
    console.log('User document added to Firestore.');
  } catch (err: unknown) {
    console.error('Error adding user document:', err);
  }
};
