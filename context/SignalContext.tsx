import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Platform } from 'react-native';
import {
  requestForegroundPermissionsAsync,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  requestBackgroundPermissionsAsync,
  getBackgroundPermissionsAsync,
  Accuracy,
} from 'expo-location';
import { useUser } from './UserContext';
import { db, functions } from '@/firebase';
import {
  Signal,
  SignalResponse,
  Location as LocationType,
  SharedLocation,
} from '@/types/Signal';
import Toast from 'react-native-toast-message';
import {
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  isBackgroundLocationTrackingActive,
  switchTrackingMode,
  determineTrackingMode,
  getCurrentTrackingMode,
  LocationTrackingMode,
} from '@/services/BackgroundLocationTask';
import { calculateDistance } from '@/utils/locationUtils';

interface SignalContextType {
  // State
  currentLocation: LocationType | null;
  activeSignals: Signal[];
  receivedSignals: Signal[];
  sharedLocations: SharedLocation[];
  isLoading: boolean;
  locationPermissionGranted: boolean;
  backgroundLocationPermissionGranted: boolean;
  backgroundLocationTrackingActive: boolean;
  unansweredSignalCount: number;

  // Actions
  requestLocationPermission: () => Promise<boolean>;
  requestBackgroundLocationPermission: () => Promise<boolean>;
  getCurrentLocation: () => Promise<LocationType | null>;
  startBackgroundLocationTracking: () => Promise<boolean>;
  stopBackgroundLocationTracking: () => Promise<void>;
  sendSignal: (signalData: {
    message?: string;
    radius: number;
    targetType: 'all' | 'crews' | 'contacts';
    targetIds: string[];
    durationMinutes?: number;
  }) => Promise<void>;
  respondToSignal: (
    signalId: string,
    response: 'accept' | 'ignore',
  ) => Promise<void>;
  modifySignalResponse: (
    signalId: string,
    action: 'cancel' | 'decline',
  ) => Promise<void>;
  updateUserLocation: (location: LocationType) => Promise<void>;
  cancelSignal: (signalId: string) => Promise<void>;
  cancelSharedLocation: (sharedLocationId: string) => Promise<void>;

  // Location tracking mode management
  getCurrentLocationTrackingMode: () => LocationTrackingMode;
  hasActiveLocationSharing: () => boolean;
}

const SignalContext = createContext<SignalContextType | undefined>(undefined);

export const useSignal = (): SignalContextType => {
  const context = useContext(SignalContext);
  if (!context) {
    throw new Error('useSignal must be used within a SignalProvider');
  }
  return context;
};

interface SignalProviderProps {
  children: ReactNode;
}

export const SignalProvider: React.FC<SignalProviderProps> = ({ children }) => {
  const { user } = useUser();

  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(
    null,
  );
  const [activeSignals, setActiveSignals] = useState<Signal[]>([]);
  const [receivedSignals, setReceivedSignals] = useState<Signal[]>([]);
  const [sharedLocations, setSharedLocations] = useState<SharedLocation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [locationPermissionGranted, setLocationPermissionGranted] =
    useState<boolean>(false);
  const [
    backgroundLocationPermissionGranted,
    setBackgroundLocationPermissionGranted,
  ] = useState<boolean>(false);
  const [
    backgroundLocationTrackingActive,
    setBackgroundLocationTrackingActive,
  ] = useState<boolean>(false);
  const [unansweredSignalCount, setUnansweredSignalCount] = useState<number>(0);

  // Flag to prevent recursive calls to updateLocationTrackingMode
  const [isUpdatingTrackingMode, setIsUpdatingTrackingMode] =
    useState<boolean>(false);

  useEffect(() => {
    if (user) {
      subscribeToActiveSignals();
      subscribeToReceivedSignals();
      subscribeToSharedLocations();
      checkLocationPermissions();
      checkBackgroundLocationTrackingStatus();
    }
  }, [user]);

  const checkLocationPermissions = async () => {
    try {
      const { status: foregroundStatus } =
        await getForegroundPermissionsAsync();
      setLocationPermissionGranted(foregroundStatus === 'granted');

      const { status: backgroundStatus } =
        await getBackgroundPermissionsAsync();
      setBackgroundLocationPermissionGranted(backgroundStatus === 'granted');
    } catch (error) {
      console.error('Error checking location permissions:', error);
    }
  };

  const checkBackgroundLocationTrackingStatus = async () => {
    try {
      const isActive = await isBackgroundLocationTrackingActive();
      setBackgroundLocationTrackingActive(isActive);
    } catch (error) {
      console.error(
        'Error checking background location tracking status:',
        error,
      );
    }
  };

  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setLocationPermissionGranted(granted);
      return granted;
    } catch (error) {
      console.error('Error requesting location permission:', error);
      return false;
    }
  };

  const requestBackgroundLocationPermission = async (): Promise<boolean> => {
    try {
      // First ensure we have foreground permissions
      const foregroundGranted = await requestLocationPermission();
      if (!foregroundGranted) {
        return false;
      }

      // Then request background permissions
      const { status } = await requestBackgroundPermissionsAsync();
      const granted = status === 'granted';
      setBackgroundLocationPermissionGranted(granted);

      if (granted) {
        Toast.show({
          type: 'success',
          text1: 'Background Location Enabled',
          text2: 'Friends can now send you signals even when the app is closed',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Background Location Denied',
          text2: "You won't receive signals when the app is closed",
        });
      }

      return granted;
    } catch (error) {
      console.error('Error requesting background location permission:', error);
      return false;
    }
  };

  const startBackgroundLocationTrackingHandler = async (): Promise<boolean> => {
    try {
      // Check if we have background permissions
      if (!backgroundLocationPermissionGranted) {
        const granted = await requestBackgroundLocationPermission();
        if (!granted) {
          return false;
        }
      }

      // Determine appropriate mode based on current shared locations
      const hasActiveSharedLocations = sharedLocations.length > 0;
      const initialMode = determineTrackingMode(hasActiveSharedLocations);

      // Start background location tracking with appropriate mode
      const success = await startBackgroundLocationTracking(initialMode);
      if (success) {
        setBackgroundLocationTrackingActive(true);

        const modeText = initialMode === 'active' ? 'Active' : 'Passive';
        const description =
          initialMode === 'active'
            ? 'High frequency updates for location sharing'
            : 'Battery-optimized location updates';

        Toast.show({
          type: 'success',
          text1: `${modeText} background tracking started`,
          text2: description,
        });
      }

      return success;
    } catch (error) {
      console.error('Error starting background location tracking:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to start background location tracking',
      });
      return false;
    }
  };

  const stopBackgroundLocationTrackingHandler = async (): Promise<void> => {
    try {
      await stopBackgroundLocationTracking();
      setBackgroundLocationTrackingActive(false);
      Toast.show({
        type: 'success',
        text1: 'Background tracking stopped',
        text2: 'Location updates paused',
      });
    } catch (error) {
      console.error('Error stopping background location tracking:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to stop background location tracking',
      });
    }
  };

  const getCurrentLocation = async (): Promise<LocationType | null> => {
    try {
      if (!locationPermissionGranted) {
        const granted = await requestLocationPermission();
        if (!granted) {
          return null;
        }
      }

      // Try high accuracy first
      let location;
      try {
        location = await getCurrentPositionAsync({
          accuracy: Accuracy.High,
        });
      } catch (highAccuracyError) {
        console.log(
          'High accuracy failed, trying balanced accuracy...',
          highAccuracyError,
        );

        // Fallback to balanced accuracy for simulator/problematic devices
        try {
          location = await getCurrentPositionAsync({
            accuracy: Accuracy.Balanced,
          });
        } catch (balancedError) {
          console.log(
            'Balanced accuracy failed, trying low accuracy...',
            balancedError,
          );

          // Final fallback to low accuracy
          location = await getCurrentPositionAsync({
            accuracy: Accuracy.Low,
          });
        }
      }

      const locationData: LocationType = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setCurrentLocation(locationData);

      // Update user location in Firestore
      await updateUserLocation(locationData);

      return locationData;
    } catch (error) {
      console.error('Error getting current location:', error);

      // Check if this is a simulator issue
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const isSimulatorError =
        errorMessage.includes('kCLErrorDomain') ||
        errorMessage.includes('ERR_LOCATION_UNAVAILABLE');
      const isIOSSimulator = Platform.OS === 'ios' && __DEV__;

      Toast.show({
        type: 'error',
        text1: 'Location Error',
        text2:
          isSimulatorError && isIOSSimulator
            ? 'iOS Simulator: Please set a custom location in Device > Location'
            : 'Failed to get current location. Please check location services.',
      });

      // Development fallback for testing (San Francisco coordinates)
      if (__DEV__ && isIOSSimulator) {
        console.log(
          'Using development fallback location for iOS Simulator testing...',
        );
        const fallbackLocation: LocationType = {
          latitude: 37.7749,
          longitude: -122.4194,
        };
        setCurrentLocation(fallbackLocation);
        await updateUserLocation(fallbackLocation);
        return fallbackLocation;
      }

      return null;
    }
  };

  const updateUserLocation = async (location: LocationType): Promise<void> => {
    try {
      const updateLocationCallable = httpsCallable(
        functions,
        'updateUserLocation',
      );
      await updateLocationCallable(location);
    } catch (error) {
      console.error('Error updating user location:', error);
    }
  };

  const subscribeToActiveSignals = () => {
    if (!user) return;

    const q = query(
      collection(db, 'signals'),
      where('senderId', '==', user.uid),
      where('status', '==', 'active'),
    );

    return onSnapshot(q, (snapshot) => {
      const signals: Signal[] = [];
      snapshot.forEach((doc) => {
        signals.push({ id: doc.id, ...doc.data() } as Signal);
      });
      setActiveSignals(signals);
    });
  };

  const subscribeToReceivedSignals = () => {
    if (!user) return;

    // For received signals, we'd need a more complex query or cloud function
    // For now, we'll get all active signals and filter client-side
    const q = query(collection(db, 'signals'), where('status', '==', 'active'));

    return onSnapshot(q, async (snapshot) => {
      const signals: Signal[] = [];
      const usersCache = new Map<string, string>(); // Cache for user names

      // Helper function to fetch user name
      const fetchUserName = async (userId: string): Promise<string> => {
        if (usersCache.has(userId)) {
          return usersCache.get(userId)!;
        }

        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const displayName =
              userData.displayName ||
              `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
              'Unknown User';
            usersCache.set(userId, displayName);
            return displayName;
          }
        } catch (error) {
          console.error('Error fetching user name:', error);
        }

        usersCache.set(userId, 'Unknown User');
        return 'Unknown User';
      };

      // Helper function to get user's stored location (same as server uses)
      const getStoredUserLocation = async (): Promise<LocationType | null> => {
        try {
          const userLocationDoc = await getDoc(
            doc(db, 'userLocations', user.uid),
          );
          if (userLocationDoc.exists()) {
            const locationData = userLocationDoc.data();
            // Use simplified coordinates to match server-side logic (maintains privacy)
            if (locationData?.latitude && locationData?.longitude) {
              return {
                latitude: locationData.latitude,
                longitude: locationData.longitude,
              };
            }
          }
        } catch (error) {
          console.error('Error fetching stored user location:', error);
        }
        return null;
      };

      // Get stored location to match server-side logic
      const storedLocation = await getStoredUserLocation();

      const promises = snapshot.docs.map(async (doc) => {
        const signalData = { id: doc.id, ...doc.data() } as Signal;
        // Don't include user's own signals
        if (signalData.senderId !== user.uid) {
          // Check if user has already responded
          const hasResponded = signalData.responses?.some(
            (response: SignalResponse) => response.responderId === user.uid,
          );
          if (!hasResponded) {
            // Check if user is within the signal's radius using multiple location sources
            if (signalData.location) {
              let isWithinRadius = false;

              // Primary check: Use stored location (same as server-side for consistency)
              if (storedLocation) {
                const storedDistance = calculateDistance(
                  storedLocation.latitude,
                  storedLocation.longitude,
                  signalData.location.latitude,
                  signalData.location.longitude,
                );
                isWithinRadius = storedDistance <= signalData.radius;
              }

              // Fallback check: Use current GPS location if stored location unavailable
              // or if stored location says we're outside but current location might be inside
              if (!isWithinRadius && currentLocation) {
                const currentDistance = calculateDistance(
                  currentLocation.latitude,
                  currentLocation.longitude,
                  signalData.location.latitude,
                  signalData.location.longitude,
                );
                const currentLocationWithinRadius =
                  currentDistance <= signalData.radius;

                isWithinRadius = currentLocationWithinRadius;
              }

              // Only include signals within radius
              if (isWithinRadius) {
                // Fetch sender's name and add to signal
                const senderName = await fetchUserName(signalData.senderId);
                signalData.senderName = senderName;
                signals.push(signalData);
              }
            }
          }
        }
      });

      await Promise.all(promises);

      // Filter out expired signals before setting state
      const now = new Date();
      const validSignals = signals.filter((signal) => {
        if (!signal.expiresAt) return true; // Keep signals without expiration
        const expiresAt = signal.expiresAt.toDate();
        return expiresAt > now;
      });

      setReceivedSignals(validSignals);
    });
  };

  const subscribeToSharedLocations = () => {
    if (!user) return;

    // Query for shared locations where the current user is either sender or responder
    // We need two separate queries due to Firestore limitations with OR queries
    const senderQuery = query(
      collection(db, 'locationSharing'),
      where('senderId', '==', user.uid),
      where('status', '==', 'active'),
    );

    const responderQuery = query(
      collection(db, 'locationSharing'),
      where('responderId', '==', user.uid),
      where('status', '==', 'active'),
    );

    const locations = new Map<string, SharedLocation>();
    const usersCache = new Map<string, string>(); // Cache for user names

    // Helper function to fetch user name
    const fetchUserName = async (userId: string): Promise<string> => {
      if (usersCache.has(userId)) {
        return usersCache.get(userId)!;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const displayName =
            userData.displayName ||
            `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
            'Unknown User';
          usersCache.set(userId, displayName);
          return displayName;
        }
      } catch (error) {
        console.error('Error fetching user name:', error);
      }

      usersCache.set(userId, 'Unknown User');
      return 'Unknown User';
    };

    const processSharedLocation = async (
      doc: any,
      isCurrentUserSender: boolean,
    ) => {
      const data = doc.data();

      // Check if location has expired
      const now = new Date();
      const expiresAt = data.expiresAt?.toDate();

      if (expiresAt && expiresAt <= now) {
        console.log(`Location sharing expired: ${doc.id}, updating status...`);
        // Update the status to expired in the database
        try {
          await updateDoc(doc.ref, { status: 'expired' });
          console.log(
            `Successfully marked location sharing ${doc.id} as expired`,
          );
        } catch (error) {
          console.error(
            `Error updating expired location sharing ${doc.id}:`,
            error,
          );
        }
        return;
      }

      const otherUserId = isCurrentUserSender
        ? data.responderId
        : data.senderId;
      const otherUserName = await fetchUserName(otherUserId);
      const otherUserLocation = isCurrentUserSender
        ? data.responderLocation
        : data.senderLocation;

      const location: SharedLocation = {
        id: doc.id,
        signalId: data.signalId,
        senderId: data.senderId,
        responderId: data.responderId,
        senderLocation: data.senderLocation,
        responderLocation: data.responderLocation,
        otherUserId,
        otherUserName,
        otherUserLocation,
        expiresAt,
        createdAt: data.createdAt?.toDate
          ? data.createdAt.toDate()
          : new Date(data.createdAt),
        status: data.status,
      };

      locations.set(doc.id, location);
    };

    const unsubscribeSender = onSnapshot(senderQuery, async (snapshot) => {
      // Clear locations for sender role before processing new snapshot
      for (const [key, location] of locations.entries()) {
        if (location.senderId === user.uid) {
          locations.delete(key);
        }
      }

      const promises = snapshot.docs.map((doc) =>
        processSharedLocation(doc, true),
      );
      await Promise.all(promises);
      setSharedLocations(Array.from(locations.values()));
    });

    const unsubscribeResponder = onSnapshot(
      responderQuery,
      async (snapshot) => {
        // Clear locations for responder role before processing new snapshot
        for (const [key, location] of locations.entries()) {
          if (location.responderId === user.uid) {
            locations.delete(key);
          }
        }

        const promises = snapshot.docs.map((doc) =>
          processSharedLocation(doc, false),
        );
        await Promise.all(promises);
        setSharedLocations(Array.from(locations.values()));
      },
    );

    // Return combined unsubscribe function
    return () => {
      unsubscribeSender();
      unsubscribeResponder();
    };
  };

  const sendSignal = async (signalData: {
    message?: string;
    radius: number;
    targetType: 'all' | 'crews' | 'contacts';
    targetIds: string[];
    durationMinutes?: number;
  }): Promise<void> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    const location = await getCurrentLocation();
    if (!location) {
      throw new Error('Location not available');
    }

    setIsLoading(true);

    try {
      // Create signal data, only including message if it has content
      const trimmedMessage = signalData.message?.trim();
      const durationMinutes = signalData.durationMinutes || 120; // Default 2 hours
      const signal: Omit<Signal, 'id'> = {
        senderId: user.uid,
        radius: signalData.radius,
        location,
        targetType: signalData.targetType,
        targetIds: signalData.targetIds,
        createdAt: serverTimestamp() as any,
        expiresAt: new Date(Date.now() + durationMinutes * 60 * 1000) as any,
        durationMinutes,
        responses: [],
        status: 'active',
        // Only include message if it exists and has content
        ...(trimmedMessage && { message: trimmedMessage }),
      };

      await addDoc(collection(db, 'signals'), signal);

      Toast.show({
        type: 'success',
        text1: 'Signal Sent!',
        text2: 'Your meetup signal has been sent to nearby friends',
      });
    } catch (error) {
      console.error('Error sending signal:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to send signal',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const respondToSignal = async (
    signalId: string,
    response: 'accept' | 'ignore',
  ): Promise<void> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);

    try {
      let location: LocationType | undefined;

      if (response === 'accept') {
        const userLocation = await getCurrentLocation();
        if (!userLocation) {
          throw new Error('Location required to accept signal');
        }
        location = userLocation;
      }

      const respondToSignalCallable = httpsCallable(
        functions,
        'respondToSignal',
      );
      await respondToSignalCallable({
        signalId,
        response,
        location,
      });

      Toast.show({
        type: 'success',
        text1: response === 'accept' ? 'Accepted!' : 'Declined',
        text2:
          response === 'accept'
            ? 'Your location has been shared'
            : 'Signal declined successfully',
      });
    } catch (error) {
      console.error('Error responding to signal:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to respond to signal',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const modifySignalResponse = async (
    signalId: string,
    action: 'cancel' | 'decline',
  ): Promise<void> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);

    try {
      const modifySignalResponseCallable = httpsCallable(
        functions,
        'modifySignalResponse',
      );
      await modifySignalResponseCallable({
        signalId,
        action,
      });

      Toast.show({
        type: 'success',
        text1: action === 'cancel' ? 'Response cancelled' : 'Signal declined',
        text2:
          action === 'cancel'
            ? 'The signal request will reappear'
            : 'You have declined the signal',
      });
    } catch (error) {
      console.error('Error modifying signal response:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to modify response',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const cancelSignal = async (signalId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'signals', signalId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });

      Toast.show({
        type: 'success',
        text1: 'Signal cancelled',
        text2: 'Your signal has been cancelled',
      });
    } catch (error) {
      console.error('Error cancelling signal:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to cancel signal',
      });
      throw error;
    }
  };

  const cancelSharedLocation = async (
    sharedLocationId: string,
  ): Promise<void> => {
    try {
      await updateDoc(doc(db, 'locationSharing', sharedLocationId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });

      Toast.show({
        type: 'success',
        text1: 'Location Sharing Stopped',
        text2: 'You have stopped sharing your location',
      });
    } catch (error) {
      console.error('Error cancelling shared location:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to stop location sharing',
      });
      throw error;
    }
  };

  // Helper function to get current location tracking mode
  const getCurrentLocationTrackingMode = (): LocationTrackingMode => {
    return getCurrentTrackingMode();
  };

  // Helper function to check if user has active location sharing
  const hasActiveLocationSharing = (): boolean => {
    return sharedLocations.length > 0;
  };

  // Check and update location tracking mode based on shared locations
  const updateLocationTrackingMode = async () => {
    // Prevent recursive calls
    if (isUpdatingTrackingMode) {
      console.log('[UpdateLocationTrackingMode] Already updating, skipping...');
      return;
    }

    setIsUpdatingTrackingMode(true);

    try {
      const hasActiveSharedLocations = sharedLocations.length > 0;
      const requiredMode = determineTrackingMode(hasActiveSharedLocations);

      console.log(
        `[UpdateLocationTrackingMode] Shared locations: ${sharedLocations.length}, Required mode: ${requiredMode}, Currently active: ${backgroundLocationTrackingActive}`,
      );

      if (!backgroundLocationTrackingActive) {
        // If not tracking but we have shared locations, start tracking with appropriate mode
        if (hasActiveSharedLocations) {
          console.log(
            `Starting background tracking in ${requiredMode} mode for location sharing`,
          );
          try {
            const success = await startBackgroundLocationTrackingHandler();
            if (!success) {
              console.error(
                'Failed to start background tracking for location sharing',
              );
              // Show user-friendly error
              Toast.show({
                type: 'error',
                text1: 'Location tracking issue',
                text2:
                  'Could not start background tracking. Please try enabling it manually.',
              });
            }
          } catch (error) {
            console.error(
              'Error starting background tracking for location sharing:',
              error,
            );
            // Show user-friendly error
            Toast.show({
              type: 'error',
              text1: 'Location tracking error',
              text2:
                'Please try restarting the app or enabling location tracking manually.',
            });
          }
        }
        return;
      }

      // If already tracking, check if we need to switch modes
      const currentMode = getCurrentTrackingMode();

      if (requiredMode !== currentMode) {
        console.log(
          `Switching location tracking from ${currentMode} to ${requiredMode} mode`,
        );
        try {
          const success = await switchTrackingMode(requiredMode);

          if (success) {
            const modeText = requiredMode === 'active' ? 'Active' : 'Passive';
            const description =
              requiredMode === 'active'
                ? 'More frequent updates for location sharing'
                : 'Battery-saving mode';

            Toast.show({
              type: 'info',
              text1: `${modeText} location tracking`,
              text2: description,
            });
          } else {
            console.error(`Failed to switch to ${requiredMode} mode`);
            // Don't show error toast for mode switching - it's less critical
            // The tracking should still work in the previous mode
          }
        } catch (error) {
          console.error('Error switching tracking mode:', error);
          // Log but don't show error to user unless tracking completely fails
        }
      }

      // If no more shared locations and tracking in active mode, switch to passive
      if (!hasActiveSharedLocations && currentMode === 'active') {
        console.log('No more shared locations, switching to passive mode');
        try {
          const success = await switchTrackingMode('passive');
          if (success) {
            Toast.show({
              type: 'info',
              text1: 'Passive location tracking',
              text2: 'Switched to battery-saving mode',
            });
          }
        } catch (error) {
          console.error('Error switching to passive mode:', error);
          // Don't show error - passive mode switch is not critical for functionality
        }
      }
    } catch (error) {
      console.error('Error updating location tracking mode:', error);
      // Only show error if it's a critical failure that affects core functionality
      if (sharedLocations.length > 0) {
        Toast.show({
          type: 'error',
          text1: 'Location tracking issue',
          text2:
            'Background tracking may not be optimized. Check location permissions.',
        });
      }
    } finally {
      setIsUpdatingTrackingMode(false);
    }
  };

  // Effect to update tracking mode when shared locations change
  useEffect(() => {
    // Add a small delay to avoid race conditions when state updates
    const timeoutId = setTimeout(() => {
      updateLocationTrackingMode();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [sharedLocations.length, backgroundLocationTrackingActive]); // Only depend on length, not the full array

  // Effect to calculate unanswered signal count (only truly unanswered signals)
  useEffect(() => {
    if (!user?.uid) {
      setUnansweredSignalCount(0);
      return;
    }

    // Filter received signals to only include non-expired ones (same logic as UI)
    const now = new Date();
    const validReceivedSignals = receivedSignals.filter((signal) => {
      if (!signal.expiresAt) return true;
      const expiresAt = signal.expiresAt.toDate();
      return expiresAt > now;
    });

    // Check which signals the user has already responded to by looking at the signal's responses array
    const unansweredSignals = validReceivedSignals.filter((signal) => {
      // Check if user has already responded to this signal
      const hasResponded = signal.responses?.some(
        (response: SignalResponse) => response.responderId === user.uid,
      );
      return !hasResponded;
    });

    // Only count truly unanswered signals for badge count
    // Shared locations are ongoing connections, not new notifications
    setUnansweredSignalCount(unansweredSignals.length);
  }, [receivedSignals, user?.uid]);

  const value: SignalContextType = {
    currentLocation,
    activeSignals,
    receivedSignals,
    sharedLocations,
    isLoading,
    locationPermissionGranted,
    backgroundLocationPermissionGranted,
    backgroundLocationTrackingActive,
    unansweredSignalCount,
    requestLocationPermission,
    requestBackgroundLocationPermission,
    getCurrentLocation,
    startBackgroundLocationTracking: startBackgroundLocationTrackingHandler,
    stopBackgroundLocationTracking: stopBackgroundLocationTrackingHandler,
    sendSignal,
    respondToSignal,
    modifySignalResponse,
    updateUserLocation,
    cancelSignal,
    cancelSharedLocation,
    getCurrentLocationTrackingMode,
    hasActiveLocationSharing,
  };

  return (
    <SignalContext.Provider value={value}>{children}</SignalContext.Provider>
  );
};
