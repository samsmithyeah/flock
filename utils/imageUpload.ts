import { storage as firebaseStorage } from '@/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import Toast from 'react-native-toast-message';
import uuid from 'react-native-uuid'; // Need to run: npx expo install react-native-uuid

// Set maximum image size (2MB)
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB in bytes

/**
 * Pick an image from the device and return the URI
 */
export const pickImage = async (): Promise<string | null> => {
  try {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({
        type: 'error',
        text1: 'Permission needed',
        text2: 'Please allow access to your photos to send images',
      });
      return null;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    return result.assets[0].uri;
  } catch (error) {
    console.error('Error picking image:', error);
    Toast.show({
      type: 'error',
      text1: 'Error',
      text2: 'Could not pick image',
    });
    return null;
  }
};

/**
 * Compress image if it exceeds maximum size
 */
export const compressImage = async (uri: string): Promise<string> => {
  try {
    // Check file size
    const fileInfo = await FileSystem.getInfoAsync(uri);

    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    // If image is already small enough, return the original
    if (fileInfo.size && fileInfo.size <= MAX_IMAGE_SIZE) {
      return uri;
    }

    // Calculate compression quality (lower for larger files)
    let quality = 0.8;
    if (fileInfo.size > MAX_IMAGE_SIZE * 2) {
      quality = 0.5;
    } else if (fileInfo.size > MAX_IMAGE_SIZE * 1.5) {
      quality = 0.6;
    } else {
      quality = 0.7;
    }

    // Compress the image
    const manipResult = await manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: quality, format: SaveFormat.JPEG },
    );

    return manipResult.uri;
  } catch (error) {
    console.error('Error compressing image:', error);
    // Return original if compression fails
    return uri;
  }
};

/**
 * Upload image to Firebase Storage and return the download URL
 */
export const uploadImage = async (
  uri: string,
  userId: string,
  chatId: string,
): Promise<string> => {
  try {
    // Compress the image if needed
    const compressedUri = await compressImage(uri);

    // Generate a unique filename
    const filename = `${uuid.v4()}.jpg`;
    const storageRef = ref(
      firebaseStorage,
      `chat_images/${userId}/${chatId}/${filename}`,
    );

    // Convert URI to blob
    const response = await fetch(compressedUri);
    const blob = await response.blob();

    // Upload blob to Firebase Storage
    await uploadBytes(storageRef, blob);

    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw new Error('Failed to upload image');
  }
};
