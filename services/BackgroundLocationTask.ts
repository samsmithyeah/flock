import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Location tracking modes
export type LocationTrackingMode = 'passive' | 'active';

// Configuration for different tracking modes
const TRACKING_CONFIGS = {
  passive: {
    timeInterval: 300000, // Update every 5 minutes
    distanceInterval: 200, // Update when moved 200 meters
    accuracy: Location.Accuracy.Balanced,
    deferredUpdatesInterval: 300000, // Batch updates every 5 minutes
  },
  active: {
    timeInterval: 15000, // Update every 15 seconds
    distanceInterval: 25, // Update when moved 25 meters
    accuracy: Location.Accuracy.High,
    deferredUpdatesInterval: 30000, // Batch updates every 30 seconds
  },
};

// Store current mode
let currentTrackingMode: LocationTrackingMode = 'passive';

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

// Function to start background location tracking with specific mode
export const startBackgroundLocationTracking = async (
  mode: LocationTrackingMode = 'passive',
): Promise<boolean> => {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] Starting background location tracking in ${mode} mode...`,
  );

  try {
    // Request background location permissions first
    const { status } = await Location.requestBackgroundPermissionsAsync();
    console.log(`[${timestamp}] Background permission status: ${status}`);

    if (status !== 'granted') {
      console.warn(`[${timestamp}] Background location permission not granted`);
      return false;
    }

    // Check if the task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK,
    );
    console.log(`[${timestamp}] Task already registered: ${isRegistered}`);

    // If already registered, stop it first to avoid conflicts
    if (isRegistered) {
      console.log(
        `[${timestamp}] Stopping existing task to restart with ${mode} mode`,
      );
      try {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        // Add small delay to ensure task is fully stopped
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (stopError) {
        console.warn(
          `[${timestamp}] Error stopping existing task (proceeding anyway):`,
          stopError,
        );
        // Continue anyway - sometimes tasks can be in inconsistent state
      }
    }

    // Get configuration for the specified mode
    const config = TRACKING_CONFIGS[mode];
    currentTrackingMode = mode;

    // Start location updates with mode-specific configuration
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: config.accuracy,
      timeInterval: config.timeInterval,
      distanceInterval: config.distanceInterval,
      foregroundService: {
        notificationTitle: 'Flock is tracking your location',
        notificationBody:
          mode === 'active'
            ? 'Active location sharing - updating frequently for signal sessions.'
            : 'This allows friends to send you signals based on your current location.',
        notificationColor: '#2596be',
      },
      pausesUpdatesAutomatically: mode === 'passive',
      deferredUpdatesInterval: config.deferredUpdatesInterval,
      showsBackgroundLocationIndicator: mode === 'active',
    });

    console.log(
      `[${timestamp}] Background location tracking started successfully in ${mode} mode`,
    );
    console.log(`[${timestamp}] Config: ${JSON.stringify(config)}`);

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

    // If we get E_TASK_NOT_FOUND or similar, try one more time after clearing any stale state
    if (
      error instanceof Error &&
      (error.message.includes('E_TASK_NOT_FOUND') ||
        error.message.includes('task'))
    ) {
      console.log(
        `[${timestamp}] Detected task-related error, attempting recovery...`,
      );
      try {
        // Wait a bit longer and try again
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Try to start again - the startLocationUpdatesAsync will handle registration
        const config = TRACKING_CONFIGS[mode];
        currentTrackingMode = mode;

        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: config.accuracy,
          timeInterval: config.timeInterval,
          distanceInterval: config.distanceInterval,
          foregroundService: {
            notificationTitle: 'Flock is tracking your location',
            notificationBody:
              mode === 'active'
                ? 'Active location sharing - updating frequently for signal sessions.'
                : 'This allows friends to send you signals based on your current location.',
            notificationColor: '#2596be',
          },
          pausesUpdatesAutomatically: mode === 'passive',
          deferredUpdatesInterval: config.deferredUpdatesInterval,
          showsBackgroundLocationIndicator: mode === 'active',
        });

        console.log(`[${timestamp}] Recovery attempt successful`);
        return true;
      } catch (recoveryError) {
        console.error(`[${timestamp}] Recovery attempt failed:`, recoveryError);
        return false;
      }
    }

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

// Function to get current tracking mode
export const getCurrentTrackingMode = (): LocationTrackingMode => {
  return currentTrackingMode;
};

// Function to switch tracking mode if different from current
export const switchTrackingMode = async (
  newMode: LocationTrackingMode,
): Promise<boolean> => {
  const timestamp = new Date().toISOString();

  console.log(
    `[${timestamp}] switchTrackingMode called: current=${currentTrackingMode}, new=${newMode}`,
  );

  // If mode is the same, no need to switch
  if (currentTrackingMode === newMode) {
    console.log(`[${timestamp}] Already in ${newMode} mode, no switch needed`);
    return true;
  }

  // Check if currently tracking
  const isCurrentlyActive = await isBackgroundLocationTrackingActive();
  console.log(`[${timestamp}] Currently active: ${isCurrentlyActive}`);

  if (!isCurrentlyActive) {
    console.log(
      `[${timestamp}] Not currently tracking, starting in ${newMode} mode`,
    );
    return await startBackgroundLocationTracking(newMode);
  }

  // Switch to new mode by restarting with new configuration
  console.log(
    `[${timestamp}] Switching from ${currentTrackingMode} to ${newMode} mode`,
  );

  try {
    // First, stop the existing task explicitly to avoid E_TASK_NOT_FOUND
    console.log(`[${timestamp}] Stopping existing task before switching modes`);
    await stopBackgroundLocationTracking();

    // Add a small delay to ensure task is fully stopped
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Now start with new mode
    const success = await startBackgroundLocationTracking(newMode);
    console.log(
      `[${timestamp}] Switch to ${newMode} mode ${success ? 'succeeded' : 'failed'}`,
    );
    return success;
  } catch (error) {
    console.error(`[${timestamp}] Error switching to ${newMode} mode:`, error);

    // If switching fails, try to ensure we at least have some tracking active
    try {
      console.log(
        `[${timestamp}] Attempting recovery by starting ${newMode} mode directly`,
      );
      const recoverySuccess = await startBackgroundLocationTracking(newMode);
      console.log(
        `[${timestamp}] Recovery attempt ${recoverySuccess ? 'succeeded' : 'failed'}`,
      );
      return recoverySuccess;
    } catch (recoveryError) {
      console.error(
        `[${timestamp}] Recovery attempt also failed:`,
        recoveryError,
      );
      return false;
    }
  }
};

// Function to determine appropriate tracking mode based on user's sharing sessions
export const determineTrackingMode = (
  hasActiveSharedLocations: boolean,
): LocationTrackingMode => {
  return hasActiveSharedLocations ? 'active' : 'passive';
};

export { BACKGROUND_LOCATION_TASK };
