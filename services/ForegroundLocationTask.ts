import * as Location from 'expo-location';
import { AppState, AppStateStatus } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';

// Foreground location tracking configuration
const FOREGROUND_UPDATE_INTERVAL = 60000; // Update every 60 seconds when in foreground
const DISTANCE_THRESHOLD = 100; // Update when moved 100 meters

// Store location tracking state
let foregroundLocationInterval: NodeJS.Timeout | null = null;
let lastKnownLocation: Location.LocationObjectCoords | null = null;
let isAppActive = true;

// Store the app state listener
let appStateSubscription: any = null;

/**
 * Starts automatic foreground location updates
 * This provides periodic location updates when the app is in the foreground
 * and background location permission is not available
 */
export const startForegroundLocationTracking = async (): Promise<boolean> => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Starting foreground location tracking...`);

  try {
    // Check if we have foreground location permission
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn(`[${timestamp}] Foreground location permission not granted`);
      return false;
    }

    // Stop any existing tracking
    stopForegroundLocationTracking();

    // Set up app state monitoring
    setupAppStateMonitoring();

    // Start periodic location updates
    startLocationUpdates();

    console.log(
      `[${timestamp}] Foreground location tracking started successfully`,
    );
    return true;
  } catch (error) {
    console.error(
      `[${timestamp}] Error starting foreground location tracking:`,
      error,
    );
    return false;
  }
};

/**
 * Stops automatic foreground location updates
 */
export const stopForegroundLocationTracking = (): void => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Stopping foreground location tracking...`);

  // Clear the location update interval
  if (foregroundLocationInterval) {
    clearInterval(foregroundLocationInterval);
    foregroundLocationInterval = null;
    console.log(`[${timestamp}] Stopped location update interval`);
  }

  // Remove app state listener
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
    console.log(`[${timestamp}] Removed app state subscription`);
  }

  lastKnownLocation = null;
  console.log(`[${timestamp}] Foreground location tracking stopped`);
};

/**
 * Checks if foreground location tracking is currently active
 */
export const isForegroundLocationTrackingActive = (): boolean => {
  return foregroundLocationInterval !== null;
};

/**
 * Sets up app state monitoring to pause/resume location updates
 */
const setupAppStateMonitoring = (): void => {
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] App state changed to: ${nextAppState}`);

    const wasActive = isAppActive;
    isAppActive = nextAppState === 'active';

    if (!wasActive && isAppActive) {
      // App became active, resume location updates
      console.log(
        `[${timestamp}] App became active, resuming location updates`,
      );
      startLocationUpdates();
    } else if (wasActive && !isAppActive) {
      // App went to background, pause location updates (but keep timer running for quick resume)
      console.log(
        `[${timestamp}] App went to background, pausing location updates`,
      );
      // Don't stop the interval completely, just skip updates when app is inactive
    }
  };

  appStateSubscription = AppState.addEventListener(
    'change',
    handleAppStateChange,
  );
  isAppActive = AppState.currentState === 'active';
};

/**
 * Starts the periodic location update loop
 */
const startLocationUpdates = (): void => {
  // Clear any existing interval
  if (foregroundLocationInterval) {
    clearInterval(foregroundLocationInterval);
  }

  // Get location immediately
  updateLocationIfNeeded();

  // Set up periodic updates
  foregroundLocationInterval = setInterval(() => {
    updateLocationIfNeeded();
  }, FOREGROUND_UPDATE_INTERVAL);
};

/**
 * Updates location if the app is active and user has moved significantly
 */
const updateLocationIfNeeded = async (): Promise<void> => {
  // Skip if app is not active
  if (!isAppActive) {
    return;
  }

  const timestamp = new Date().toISOString();

  try {
    // Get current location
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced, // Use balanced accuracy for battery optimization
    });

    // Check if we should update (based on distance threshold or if it's the first location)
    const shouldUpdate =
      !lastKnownLocation ||
      calculateDistance(
        lastKnownLocation.latitude,
        lastKnownLocation.longitude,
        location.coords.latitude,
        location.coords.longitude,
      ) >= DISTANCE_THRESHOLD;

    if (shouldUpdate) {
      console.log(`[${timestamp}] Updating foreground location:`, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      });

      // Update Firebase with new location
      await updateUserLocationInForeground(location.coords);
      lastKnownLocation = location.coords;
    } else {
      console.log(
        `[${timestamp}] Skipping location update (insufficient movement)`,
      );
    }
  } catch (error) {
    console.error(`[${timestamp}] Error getting foreground location:`, error);
  }
};

/**
 * Updates user location in Firebase from foreground tracking
 */
const updateUserLocationInForeground = async (
  coords: Location.LocationObjectCoords,
): Promise<void> => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Updating user location in Firebase (foreground)`);

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
      `[${timestamp}] Successfully updated user location in Firebase (foreground):`,
      locationData,
    );
  } catch (error) {
    console.error(
      `[${timestamp}] Error updating user location in Firebase (foreground):`,
      error,
    );
  }
};

/**
 * Calculates distance between two coordinates in meters
 */
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};
