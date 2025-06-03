// // app/(auth)/login.tsx

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { auth, db } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import GoogleLoginButton from '@/components/GoogleLoginButton';
import { useUser } from '@/context/UserContext';
import CustomButton from '@/components/CustomButton';
import CustomTextInput from '@/components/CustomTextInput';
import Colors from '@/styles/colors';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { User } from '@/types/User';
import { FirebaseError } from 'firebase/app';
import { registerForPushNotificationsAsync } from '@/utils/AddUserToFirestore';
import { router } from 'expo-router';
import { useSignal } from '@/context/SignalContext';

WebBrowser.maybeCompleteAuthSession();

const { height } = Dimensions.get('window');
const BASE_HEIGHT = 852;
const vs = (size: number) => (height / BASE_HEIGHT) * size;

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const { setUser } = useUser();
  const { requestLocationPermission, requestBackgroundLocationPermission } =
    useSignal();

  const handleEmailLogin = async () => {
    setFormError('');

    if (!email.trim() || !password) {
      setFormError('Please enter both email and password.');
      return;
    }

    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email.trim())) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      const thisUser = userCredential.user;

      // Fetch user data from Firestore
      const userDocRef = doc(db, 'users', thisUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data() as User;

        // Migration: Set default locationTrackingEnabled for existing users
        if (userData.locationTrackingEnabled === undefined) {
          await updateDoc(userDocRef, {
            locationTrackingEnabled: true,
          });
          userData.locationTrackingEnabled = true;
        }

        await registerForPushNotificationsAsync(userData);
        await requestLocationPermission();
        await requestBackgroundLocationPermission();

        if (!userData.phoneNumber) {
          // Redirect to PhoneVerificationScreen
          router.push({
            pathname: '/phone-verification',
            params: { uid: thisUser.uid },
          });
        } else {
          // Proceed to main app
          setUser(userData);
        }
      } else {
        setFormError('User data not found.');
      }
    } catch (error: unknown) {
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'auth/user-not-found':
            setFormError('No account found for this email.');
            return;
          case 'auth/wrong-password':
            setFormError('Incorrect password.');
            return;
          case 'auth/invalid-email':
            setFormError('Invalid email address.');
            return;
          case 'auth/invalid-credential':
            setFormError('Invalid credentials. Please try again.');
            return;
          default:
            setFormError('Failed to log in. Please try again.');
        }
      }
      console.error('Login Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <View style={styles.logoContainer}>
          <Image
            source={require('@/assets/images/flock-transparent.png')}
            style={styles.logo}
            contentFit="contain"
          />
        </View>

        <View style={styles.formContainer}>
          {formError ? <Text style={styles.error}>{formError}</Text> : null}

          <CustomTextInput
            iconName="mail-outline"
            placeholder="Email address"
            placeholderTextColor="#666"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (formError) setFormError('');
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="username"
            importantForAutofill="yes"
            hasBorder
          />

          <CustomTextInput
            iconName="lock-closed-outline"
            placeholder="Password"
            placeholderTextColor="#666"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (formError) setFormError('');
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            importantForAutofill="yes"
            hasBorder
          />

          <TouchableOpacity
            style={styles.forgotPasswordContainer}
            onPress={() => router.push('/forgot-password')}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          <CustomButton
            title="Login"
            onPress={handleEmailLogin}
            variant="primary"
            accessibilityLabel="Login"
            accessibilityHint="Press to log into your account"
            loading={loading}
          />

          <View style={styles.separatorContainer}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>OR</Text>
            <View style={styles.separatorLine} />
          </View>

          <GoogleLoginButton />

          <TouchableOpacity
            style={styles.signupContainer}
            onPress={() => router.push('/sign-up')}
          >
            <Text style={styles.signupText}>Don't have an account? </Text>
            <Text style={styles.signupLink}>Sign up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.flock,
    paddingTop: vs(60),
  },
  logoContainer: {
    marginTop: vs(10),
    alignItems: 'center',
  },
  logo: {
    width: vs(200),
    height: vs(200),
  },
  formContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 15,
    padding: vs(20),
    marginHorizontal: 20,
    marginTop: vs(30),
  },
  forgotPasswordContainer: {
    marginBottom: vs(15),
    paddingRight: 10,
    alignItems: 'flex-end',
  },
  forgotPasswordText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '500',
    marginTop: vs(-7),
  },
  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: vs(20),
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333',
  },
  separatorText: {
    marginHorizontal: 10,
    color: '#333',
    fontSize: 16,
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: vs(20),
  },
  signupText: {
    color: '#333',
    fontSize: 16,
  },
  signupLink: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#ff6b6b',
    marginBottom: vs(12),
    textAlign: 'center',
  },
});

export default LoginScreen;
