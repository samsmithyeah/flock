import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  TouchableOpacity,
  Text,
} from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db, deleteAccount } from '@/firebase';
import { useUser } from '@/context/UserContext';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import CustomButton from '@/components/CustomButton';
import CustomTextInput from '@/components/CustomTextInput';
import Toast from 'react-native-toast-message';
import LoadingOverlay from '@/components/LoadingOverlay';
import { router, useNavigation } from 'expo-router';

const EditUserProfileModal: React.FC = () => {
  const { user, setUser, logout, isAdmin } = useUser();
  const [displayName, setDisplayName] = useState<string>(
    user?.displayName || '',
  );
  const [photoURL, setPhotoURL] = useState<string>(user?.photoURL || '');
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // NEW: Field for admin to delete other users
  const [adminTargetUserId, setAdminTargetUserId] = useState<string>('');

  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !displayName.trim()}
          accessibilityLabel="Save Profile"
          accessibilityHint="Save your updated profile information"
        >
          <Text
            style={{
              color: saving || !displayName.trim() ? '#999' : '#1e90ff',
              fontSize: 16,
              fontWeight: 'bold',
            }}
          >
            Save
          </Text>
        </TouchableOpacity>
      ),
      headerLeft: () => (
        <TouchableOpacity
          onPress={handleCancel}
          accessibilityLabel="Cancel"
          accessibilityHint="Discard changes and close the edit screen"
        >
          <Text style={{ color: '#1e90ff', fontSize: 16 }}>Cancel</Text>
        </TouchableOpacity>
      ),
      title: 'Edit profile',
      presentation: 'modal',
    });
  }, [navigation, displayName, saving]);

  if (!user) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  const handleSave = async () => {
    if (saving) return;

    if (!displayName.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Display name cannot be empty.',
      });
      return;
    }

    setSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: displayName.trim(),
        photoURL: photoURL.trim(),
      });

      setUser({
        ...user,
        displayName: displayName.trim(),
        photoURL: photoURL.trim(),
      });

      Toast.show({
        type: 'success',
        text1: 'Profile updated',
        text2: 'Your profile has been updated successfully.',
      });
      router.back();
      Keyboard.dismiss();
    } catch (error) {
      console.error('Error updating profile:', error);
      Toast.show({
        type: 'error',
        text1: 'Update Error',
        text2: 'Failed to update your profile. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel editing',
      'Are you sure you want to discard your changes?',
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes',
          onPress: () => {
            // Reset fields
            setDisplayName(user.displayName || '');
            setPhotoURL(user.photoURL || '');
            router.back();
          },
        },
      ],
    );
  };

  const handleDeleteOwnAccount = () => {
    Alert.alert(
      'Delete account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await deleteAccount();
              setDeleting(false);
              await logout();
              Toast.show({ type: 'success', text1: 'Account deleted' });
            } catch (error) {
              setDeleting(false);
              console.error('Error deleting account:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to delete account',
              });
            }
          },
        },
      ],
    );
  };

  // For an admin to delete another user
  const handleDeleteOtherUser = () => {
    if (!adminTargetUserId.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please enter a valid user UID.',
      });
      return;
    }

    Alert.alert(
      'Delete another user',
      `Are you sure you want to delete the user with UID "${adminTargetUserId}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await deleteAccount(adminTargetUserId); // admin usage
              setSaving(false);
              Toast.show({
                type: 'success',
                text1: 'User Deleted',
                text2: `Successfully deleted user with UID: ${adminTargetUserId}.`,
              });
              setAdminTargetUserId('');
            } catch (error) {
              setSaving(false);
              console.error('Error deleting other user account:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to delete the specified user account.',
              });
            }
          },
        },
      ],
    );
  };

  return (
    <>
      {deleting && <LoadingOverlay text="Deleting account..." />}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <ProfilePicturePicker
            imageUrl={photoURL || null}
            onImageUpdate={async (newUrl) => {
              setPhotoURL(newUrl);
              try {
                const userRef = doc(db, 'users', user.uid);
                await updateDoc(userRef, {
                  photoURL: newUrl,
                });
                console.log(
                  'photoURL updated successfully in Firestore',
                  newUrl,
                );
              } catch (error) {
                console.error('Error updating profile picture URL:', error);
                Toast.show({
                  type: 'error',
                  text1: 'Error',
                  text2: 'Failed to update profile picture',
                });
              }
            }}
            editable={true}
            storagePath={`users/${user.uid}/profile.jpg`}
            size={150}
          />

          <View style={styles.formContainer}>
            <CustomTextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter your display name"
              autoCapitalize="words"
              returnKeyType="done"
              hasBorder
              labelText="Display name"
            />
          </View>

          {/* ADMIN-ONLY: DELETE ANOTHER USER */}
          {isAdmin && (
            <View style={styles.adminSection}>
              <CustomTextInput
                value={adminTargetUserId}
                onChangeText={setAdminTargetUserId}
                placeholder="Enter target user UID"
                labelText="Delete another user (admin only)"
                hasBorder
              />
              <CustomButton
                title="Delete another user"
                onPress={handleDeleteOtherUser}
                loading={saving}
                variant="danger"
                icon={{
                  name: 'person-remove-outline',
                  size: 24,
                }}
                accessibilityLabel="Delete another user's account"
                accessibilityHint="Permanently delete the specified user"
              />
            </View>
          )}
        </ScrollView>

        {/* DELETE OWN ACCOUNT BUTTON - Moved outside ScrollView */}
        <View style={styles.deleteButtonContainer}>
          <CustomButton
            title="Delete account"
            onPress={handleDeleteOwnAccount}
            loading={saving}
            variant="danger"
            icon={{
              name: 'trash-outline',
              size: 24,
            }}
            accessibilityLabel="Delete your account"
            accessibilityHint="Permanently delete your account"
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );
};

export default EditUserProfileModal;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    padding: 20,
    alignItems: 'center',
    paddingBottom: 100, // Add padding to account for delete button
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formContainer: {
    width: '100%',
    marginTop: 10,
  },
  adminSection: {
    marginTop: 30,
    width: '100%',
  },
  deleteButtonContainer: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
  },
});
