import { useState, useEffect } from 'react';
import { useSignal } from '@/context/SignalContext';

/**
 * Custom hook to manage background location tracking state and actions
 */
export const useBackgroundLocation = () => {
  const {
    backgroundLocationPermissionGranted,
    backgroundLocationTrackingActive,
    requestBackgroundLocationPermission,
    startBackgroundLocationTracking,
    stopBackgroundLocationTracking,
  } = useSignal();

  const [isInitializing, setIsInitializing] = useState(false);

  // Auto-start background tracking if permissions are granted and user had it enabled
  useEffect(() => {
    const initializeBackgroundTracking = async () => {
      if (
        backgroundLocationPermissionGranted &&
        !backgroundLocationTrackingActive
      ) {
        // Check if user previously had background tracking enabled
        // This could be stored in AsyncStorage if needed
        setIsInitializing(true);
        try {
          // For now, we'll just log this. In the future, you might want to
          // store user preference and auto-start if they had it enabled before
          console.log(
            'Background location permission granted but tracking not active',
          );
        } catch (error) {
          console.error('Error initializing background tracking:', error);
        } finally {
          setIsInitializing(false);
        }
      }
    };

    initializeBackgroundTracking();
  }, [backgroundLocationPermissionGranted, backgroundLocationTrackingActive]);

  const toggleBackgroundTracking = async (): Promise<boolean> => {
    setIsInitializing(true);
    try {
      if (backgroundLocationTrackingActive) {
        await stopBackgroundLocationTracking();
        return false;
      } else {
        const success = await startBackgroundLocationTracking();
        return success;
      }
    } catch (error) {
      console.error('Error toggling background tracking:', error);
      return false;
    } finally {
      setIsInitializing(false);
    }
  };

  const requestPermissionAndStart = async (): Promise<boolean> => {
    setIsInitializing(true);
    try {
      if (!backgroundLocationPermissionGranted) {
        const granted = await requestBackgroundLocationPermission();
        if (!granted) {
          return false;
        }
      }

      return await startBackgroundLocationTracking();
    } catch (error) {
      console.error(
        'Error requesting permission and starting tracking:',
        error,
      );
      return false;
    } finally {
      setIsInitializing(false);
    }
  };

  return {
    // State
    backgroundLocationPermissionGranted,
    backgroundLocationTrackingActive,
    isInitializing,

    // Actions
    toggleBackgroundTracking,
    requestPermissionAndStart,
    requestBackgroundLocationPermission,
    startBackgroundLocationTracking,
    stopBackgroundLocationTracking,
  };
};
