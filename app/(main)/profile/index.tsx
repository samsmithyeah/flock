// screens/UserProfileScreen.tsx

import React, { useEffect, useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { User } from '@/types/User';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import CustomButton from '@/components/CustomButton';
import Toast from 'react-native-toast-message';
import Colors from '@/styles/colors';
import { router, useNavigation } from 'expo-router';

const UserProfileScreen: React.FC = () => {
  const { user, setUser, logout } = useUser();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user?.uid) {
        console.log('User not logged in');
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();

          // Ensure 'uid' exists in the fetched data
          if (!userData.uid) {
            Toast.show({
              type: 'error',
              text1: 'Error',
              text2: 'User profile data is invalid',
            });
            return;
          }

          const updatedUser: User = {
            uid: userSnap.id,
            displayName: userData.displayName || '',
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            email: userData.email || '',
            photoURL: userData.photoURL || '',
          };
          setUser(updatedUser);
        } else {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'User profile not found',
          });
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not fetch user profile',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [user?.uid, setUser]);

  // Add "Edit" button to header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => router.push('/profile/edit')}
          style={styles.headerButton}
          accessibilityLabel="Edit Profile"
          accessibilityHint="Open profile edit screen"
        >
          <Text style={{ color: '#1e90ff', fontSize: 16 }}>Edit</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const handleLogout = async () => {
    try {
      Alert.alert('Log out', 'Are you sure you want to log out?', [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]);
    } catch (error) {
      console.error('Error logging out: ', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to log out',
      });
    }
  };

  if (loading || !user) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ProfilePicturePicker
        imageUrl={user.photoURL ?? null}
        onImageUpdate={async (newUrl) => {
          // Update local state
          setUser({ ...user, photoURL: newUrl });

          // Update Firestore
          try {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
              photoURL: newUrl,
            });
            console.log('photoURL updated successfully in Firestore', newUrl);
          } catch (error) {
            console.error('Error updating profile picture URL:', error);
            Toast.show({
              type: 'error',
              text1: 'Error',
              text2: 'Failed to update profile picture',
            });
          }
        }}
        editable={false}
        storagePath={`users/${user.uid}/profile.jpg`}
        size={150}
      />

      <View style={styles.infoContainer}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Display name:</Text>
          <Text style={styles.infoValue}>{user.displayName}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Email address:</Text>
          <Text style={styles.infoValue}>{user.email}</Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <CustomButton
          title="Log out"
          onPress={handleLogout}
          variant="danger"
          icon={{
            name: 'exit-outline',
            size: 24,
          }}
          accessibilityLabel="Log out"
          accessibilityHint="Log out of your account"
        />
      </View>
    </View>
  );
};
export default UserProfileScreen;

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButton: {
    marginRight: 16,
  },
  infoContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginTop: 20,
    borderColor: '#E0E0E0',
    borderWidth: 1,
  },
  infoItem: {
    flexDirection: 'row',
    marginVertical: 8,
  },
  infoLabel: {
    fontWeight: '600',
    fontSize: 16,
    width: '40%',
    color: '#333',
  },
  infoValue: {
    fontSize: 16,
    color: '#555',
    flexShrink: 1, // Allows text to wrap if necessary
  },
  buttonContainer: {
    marginTop: 30,
    width: width * 0.8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 30,
  },
});
