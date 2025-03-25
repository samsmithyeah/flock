import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import Toast from 'react-native-toast-message';

/**
 * Save an image from URL to the device's gallery
 * @param imageUrl URL of the image to save
 */
export const saveImageToGallery = async (imageUrl: string): Promise<void> => {
  try {
    // Request permissions to save to media library
    const { status } = await MediaLibrary.requestPermissionsAsync();

    if (status !== 'granted') {
      Toast.show({
        type: 'error',
        text1: 'Permission needed',
        text2: 'Please allow access to your photos to save images',
      });
      return;
    }

    // Show downloading toast
    Toast.show({
      type: 'info',
      text1: 'Downloading...',
      text2: 'Saving image to your device',
    });

    // Create a local filename (using part of URL hash and timestamp to ensure uniqueness)
    const fileUri = `${FileSystem.cacheDirectory}chat_image_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;

    // Download the file
    const { uri } = await FileSystem.downloadAsync(imageUrl, fileUri);

    // Save to media library
    const asset = await MediaLibrary.createAssetAsync(uri);

    // Optional: Add to album named "Going Out App"
    await MediaLibrary.createAlbumAsync('Going Out App', asset, false);

    // Delete the cache file
    await FileSystem.deleteAsync(uri, { idempotent: true });

    // Show success message
    Toast.show({
      type: 'success',
      text1: 'Image saved',
      text2: 'The image has been saved to your device',
    });
  } catch (error) {
    console.error('Error saving image to device:', error);
    Toast.show({
      type: 'error',
      text1: 'Error',
      text2: 'Could not save the image',
    });
  }
};
