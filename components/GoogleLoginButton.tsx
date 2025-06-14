// components/GoogleLoginButton.tsx

import React, { useState } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { auth, db } from '@/firebase';
import {
  addUserToFirestore,
  registerForPushNotificationsAsync,
} from '@/utils/AddUserToFirestore';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/types/NotificationSettings';
import CustomButton from '@/components/CustomButton';
import Toast from 'react-native-toast-message';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { User } from '@/types/User';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useUser } from '@/context/UserContext';
import { router } from 'expo-router';

GoogleSignin.configure({
  webClientId:
    '814136772684-8bgo4g20f9q1p4g532kvqhj7lt497v7e.apps.googleusercontent.com',
  offlineAccess: true,
});

const GoogleLoginButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { setUser } = useUser();

  const handleGoogleSignIn = async () => {
    console.log('Google Sign In');
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      if (userInfo.data?.idToken) {
        const credential = GoogleAuthProvider.credential(userInfo.data.idToken);
        const userCredential = await signInWithCredential(auth, credential);
        const firebaseUser = userCredential.user;

        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data() as User;

          // Migration: Set default notification settings for existing users
          if (!userData.notificationSettings) {
            await updateDoc(userDocRef, {
              notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
            });
            userData.notificationSettings = DEFAULT_NOTIFICATION_SETTINGS;
          }

          await registerForPushNotificationsAsync(userData);

          if (!userData.phoneNumber) {
            router.push({
              pathname: '/phone-verification',
              params: { uid: firebaseUser.uid },
            });
          } else {
            setUser(userData);
          }
        } else {
          const firestoreUser: User = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || '',
            firstName: firebaseUser.displayName?.split(' ')[0] || '',
            lastName: firebaseUser.displayName?.split(' ')[1] || '',
            photoURL: firebaseUser.photoURL || '',
            badgeCount: 0,
            notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
          };
          await addUserToFirestore(firestoreUser);
          await registerForPushNotificationsAsync(firestoreUser);

          Toast.show({
            type: 'success',
            text1: 'Success',
            text2: 'Account created and logged in successfully!',
          });
          router.push({
            pathname: '/phone-verification',
            params: { uid: firebaseUser.uid },
          });
        }
      }
    } catch (error) {
      console.error('Login Error:', error);
      if (error instanceof Error) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: `Could not sign in with Google: ${error.message}`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <CustomButton
      title="Login with Google"
      onPress={handleGoogleSignIn}
      variant="danger"
      accessibilityLabel="Login with Google"
      accessibilityHint="Authenticate using your Google account"
      icon={{
        name: 'logo-google',
        color: '#fff',
      }}
      loading={loading}
      disabled={loading}
    />
  );
};

export default GoogleLoginButton;
