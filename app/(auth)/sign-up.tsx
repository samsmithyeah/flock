// app/(auth)/sign-up.tsx

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  TouchableOpacity,
} from 'react-native';
import { auth } from '@/firebase';
import {
  addUserToFirestore,
  registerForPushNotificationsAsync,
} from '@/utils/AddUserToFirestore';
import CustomButton from '@/components/CustomButton';
import CustomTextInput from '@/components/CustomTextInput';
import zxcvbn from 'zxcvbn';
import {
  createUserWithEmailAndPassword,
  User as FirebaseUser,
  updateProfile,
} from 'firebase/auth';
import Colors from '@/styles/colors';
import GoogleLoginButton from '@/components/GoogleLoginButton';
import { router } from 'expo-router';

const SignUpScreen: React.FC = () => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [passwordStrength, setPasswordStrength] = useState<number>(0);

  const evaluatePasswordStrength = (pass: string) => {
    const evaluation = zxcvbn(pass);
    setPasswordStrength(evaluation.score);
  };

  const getPasswordStrengthLabel = () => {
    switch (passwordStrength) {
      case 0:
      case 1:
        return { label: 'Weak', color: '#ff4d4d' };
      case 2:
        return { label: 'Fair', color: '#ffae42' };
      case 3:
        return { label: 'Good', color: '#2ecc71' };
      case 4:
        return { label: 'Strong', color: '#27ae60' };
      default:
        return { label: '', color: '#ccc' };
    }
  };

  const handleSignUp = async () => {
    setFormError('');

    if (!email.trim() || !password || !firstName.trim() || !lastName.trim()) {
      setFormError('Please fill in all fields.');
      return;
    }

    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email.trim())) {
      setFormError('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      // Create user with email and password
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      const thisUser: FirebaseUser = userCredential.user;

      // Update display name
      await updateProfile(thisUser, {
        displayName: `${firstName.trim()} ${lastName.trim()}`,
      });

      console.log('User signed up:', thisUser);

      // Add user to Firestore without phone number
      const updatedUser = {
        uid: thisUser.uid,
        email: thisUser.email || '',
        displayName: `${firstName.trim()} ${lastName.trim()}`,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        photoURL: thisUser.photoURL || '',
        badgeCount: 0,
        // phoneNumber is optional and not set here
      };

      await addUserToFirestore(updatedUser);
      await registerForPushNotificationsAsync(updatedUser);

      // Navigate to phone verification screen
      router.push({
        pathname: '/phone-verification',
        params: { uid: thisUser.uid },
      });
    } catch (err: unknown) {
      console.error('Sign Up Error:', err);
      if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
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
              iconName="person-outline"
              placeholder="First name"
              placeholderTextColor="#666"
              value={firstName}
              onChangeText={(text) => {
                setFirstName(text);
                if (formError) setFormError('');
              }}
              autoCapitalize="words"
              autoComplete="name-given"
              textContentType="givenName"
              hasBorder
            />

            <CustomTextInput
              iconName="person-outline"
              placeholder="Last name"
              placeholderTextColor="#666"
              value={lastName}
              onChangeText={(text) => {
                setLastName(text);
                if (formError) setFormError('');
              }}
              autoCapitalize="words"
              autoComplete="name-family"
              textContentType="familyName"
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
                evaluatePasswordStrength(text);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              importantForAutofill="yes"
              hasBorder
            />

            {password.length > 0 && (
              <View style={styles.passwordStrengthContainer}>
                <View style={styles.passwordStrengthBarContainer}>
                  <View
                    style={[
                      styles.passwordStrengthBar,
                      {
                        backgroundColor: getPasswordStrengthLabel().color,
                        width: `${(passwordStrength + 1) * 20}%`,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.passwordStrengthText,
                    { color: getPasswordStrengthLabel().color },
                  ]}
                >
                  {getPasswordStrengthLabel().label}
                </Text>
              </View>
            )}

            <CustomButton
              title="Sign up"
              onPress={handleSignUp}
              variant="danger"
              accessibilityLabel="Sign up"
              accessibilityHint="Press to create a new account"
              loading={loading}
            />

            <View style={styles.separatorContainer}>
              <View style={styles.separatorLine} />
              <Text style={styles.separatorText}>OR</Text>
              <View style={styles.separatorLine} />
            </View>

            <GoogleLoginButton />

            <TouchableOpacity
              style={styles.loginContainer}
              onPress={() => router.push('/login')}
            >
              <Text style={styles.loginText}>Already have an account? </Text>
              <Text style={styles.loginLink}>Login</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.flock,
    justifyContent: 'center',
  },
  formContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 15,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 50,
  },
  passwordStrengthContainer: {
    marginBottom: 15,
  },
  passwordStrengthBarContainer: {
    height: 5,
    width: '100%',
    backgroundColor: '#e0e0e0',
    borderRadius: 2.5,
    marginBottom: 5,
  },
  passwordStrengthBar: {
    height: '100%',
    borderRadius: 2.5,
  },
  passwordStrengthText: {
    fontSize: 12,
    fontWeight: '500',
  },
  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
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
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginText: {
    color: '#333',
    fontSize: 16,
  },
  loginLink: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#ff6b6b',
    marginBottom: 12,
    textAlign: 'center',
  },
});

export default SignUpScreen;
