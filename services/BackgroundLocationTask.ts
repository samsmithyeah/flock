import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Define the background task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  console.log(
    `[${new Date().toISOString()}] Background location task triggered`,
  );

  if (error) {
    console.error('Background location task error:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    console.log(
      `[${new Date().toISOString()}] Received ${locations?.length || 0} new locations in background`,
    );

    // Process the latest location
    if (locations && locations.length > 0) {
      const latestLocation = locations[locations.length - 1];
      console.log(`[${new Date().toISOString()}] Processing location:`, {
        latitude: latestLocation.coords.latitude,
        longitude: latestLocation.coords.longitude,
        accuracy: latestLocation.coords.accuracy,
        timestamp: new Date(latestLocation.timestamp).toISOString(),
      });
      await updateUserLocationInBackground(latestLocation.coords);
    } else {
      console.log(`[${new Date().toISOString()}] No locations to process`);
    }
  } else {
    console.log(
      `[${new Date().toISOString()}] No data received in background task`,
    );
  }
});

// Function to update user location in Firebase from background task
const updateUserLocationInBackground = async (
  coords: Location.LocationObjectCoords,
) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Attempting to update user location in Firebase`);

  try {
    const locationData = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      timestamp,
    };

    // Use Firebase callable function to update location
    const updateLocationCallable = httpsCallable(
      functions,
      'updateUserLocation',
    );
    await updateLocationCallable(locationData);

    console.log(
      `[${timestamp}] Successfully updated user location in Firebase:`,
      locationData,
    );
  } catch (error) {
    console.error(
      `[${timestamp}] Error updating user location in Firebase:`,
      error,
    );
  }
};

// Function to start background location tracking
export const startBackgroundLocationTracking = async (): Promise<boolean> => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Starting background location tracking...`);

  try {
    // Check if the task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK,
    );
    console.log(`[${timestamp}] Task already registered: ${isRegistered}`);

    if (isRegistered) {
      console.log(`[${timestamp}] Background location task already registered`);
      return true;
    }

    // Request background location permissions
    const { status } = await Location.requestBackgroundPermissionsAsync();
    console.log(`[${timestamp}] Background permission status: ${status}`);

    if (status !== 'granted') {
      console.warn(`[${timestamp}] Background location permission not granted`);
      return false;
    }

    // Start location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000, // Update every 30 seconds
      distanceInterval: 50, // Update when moved 50 meters
      foregroundService: {
        notificationTitle: 'Flock is tracking your location',
        notificationBody:
          'This allows friends to send you signals based on your current location.',
        notificationColor: '#2596be',
      },
      pausesUpdatesAutomatically: false,
      deferredUpdatesInterval: 60000, // Batch updates every minute when possible
      showsBackgroundLocationIndicator: true,
    });

    console.log(
      `[${timestamp}] Background location tracking started successfully`,
    );

    // Verify the task is now registered
    const finalStatus = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK,
    );
    console.log(
      `[${timestamp}] Final task registration status: ${finalStatus}`,
    );

    return true;
  } catch (error) {
    console.error(
      `[${timestamp}] Error starting background location tracking:`,
      error,
    );
    return false;
  }
};

// Function to stop background location tracking
export const stopBackgroundLocationTracking = async (): Promise<void> => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Stopping background location tracking...`);

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK,
    );
    console.log(`[${timestamp}] Task is registered: ${isRegistered}`);

    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log(
        `[${timestamp}] Background location tracking stopped successfully`,
      );
    } else {
      console.log(`[${timestamp}] Task was not registered, nothing to stop`);
    }
  } catch (error) {
    console.error(
      `[${timestamp}] Error stopping background location tracking:`,
      error,
    );
  }
};

// Function to check if background location tracking is active
export const isBackgroundLocationTrackingActive =
  async (): Promise<boolean> => {
    try {
      return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    } catch (error) {
      console.error(
        'Error checking background location tracking status:',
        error,
      );
      return false;
    }
  };

export { BACKGROUND_LOCATION_TASK };
