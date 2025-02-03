import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import FastImage from 'react-native-fast-image';
import { storage } from '@/firebase';
import Toast from 'react-native-toast-message';

interface ProfilePicturePickerProps {
  imageUrl: string | null;
  onImageUpdate: (newUrl: string) => void;
  editable: boolean;
  storagePath?: string;
  size?: number;
  iconName?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconOffsetX?: number;
  iconOffsetY?: number;
  borderWidth?: number;
  borderColor?: string;
  isOnline?: boolean;
}

const ProfilePicturePicker: React.FC<ProfilePicturePickerProps> = ({
  imageUrl,
  onImageUpdate,
  editable,
  storagePath,
  size = 100,
  iconName = 'person',
  iconColor = '#888',
  iconOffsetX = 0.03,
  iconOffsetY = 0.03,
  borderWidth = 0,
  borderColor = '#fff',
  isOnline = false,
}) => {
  const [isUploading, setIsUploading] = useState(false);

  const requestPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({
        type: 'error',
        text1: 'Permission Denied',
        text2: 'Permission to access media library is required!',
      });
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled) {
        if (result.assets && result.assets.length > 0) {
          const selectedImage = result.assets[0].uri;
          await uploadImage(selectedImage);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not select an image',
      });
    }
  };

  const removeImage = async () => {
    Alert.alert(
      'Remove Image',
      'Are you sure you want to remove your profile picture?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const storageRef = ref(storage, storagePath);
              await deleteObject(storageRef);
              onImageUpdate('');
              Toast.show({
                type: 'success',
                text1: 'Success',
                text2: 'Profile picture removed successfully',
              });
            } catch (error) {
              console.error('Error removing image:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Could not remove profile picture',
              });
            }
          },
        },
      ],
    );
  };

  const uploadImage = async (uri: string) => {
    setIsUploading(true);
    try {
      const resizedImage = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 500 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
      );

      const response = await fetch(resizedImage.uri);
      const blob = await response.blob();
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob);

      const downloadUrl = await getDownloadURL(storageRef);
      onImageUpdate(downloadUrl);
      console.log('Image uploaded successfully:', downloadUrl);
    } catch (error) {
      console.error('Error uploading image:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not upload profile picture',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View
        style={[
          styles.profilePictureContainer,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: borderWidth,
            borderColor: borderColor,
          },
        ]}
      >
        {imageUrl ? (
          <FastImage
            source={{ uri: imageUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode={FastImage.resizeMode.cover}
          />
        ) : (
          <Ionicons name={iconName} size={size * 0.5} color={iconColor} />
        )}
        {isUploading && (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}
      </View>
      {isOnline && (
        <View
          style={[
            styles.onlineIndicator,
            {
              width: size * 0.2,
              height: size * 0.2,
              borderRadius: (size * 0.2) / 2,
            },
          ]}
        />
      )}
      {editable && (
        <TouchableOpacity
          onPress={pickImage}
          onLongPress={imageUrl ? removeImage : undefined}
          style={[
            styles.editIconContainer,
            {
              width: size * 0.3,
              height: size * 0.3,
              borderRadius: (size * 0.3) / 2,
              right: size * iconOffsetX,
              bottom: size * iconOffsetY,
            },
          ]}
          accessibilityLabel="Change Profile Picture"
          activeOpacity={0.7}
        >
          <Ionicons name="camera" size={size * 0.15} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default ProfilePicturePicker;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  profilePictureContainer: {
    backgroundColor: '#e6e6e6',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  editIconContainer: {
    position: 'absolute',
    backgroundColor: '#1e90ff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 1,
    elevation: 2,
  },
  uploadingOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  onlineIndicator: {
    position: 'absolute',
    backgroundColor: '#4CD964',
    zIndex: 1,
    right: 2,
    bottom: 2,
  },
});
