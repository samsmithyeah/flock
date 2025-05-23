import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Platform } from 'react-native';
import { requestForegroundPermissionsAsync, getCurrentPositionAsync, getForegroundPermissionsAsync, Accuracy } from 'expo-location';
import { useUser } from './UserContext';
import { db, functions } from '@/firebase';
import { Signal, SignalResponse, Location as LocationType } from '@/types/Signal';
import Toast from 'react-native-toast-message';

interface SignalContextType {
  // State
  currentLocation: LocationType | null;
  activeSignals: Signal[];
  receivedSignals: Signal[];
  isLoading: boolean;
  locationPermissionGranted: boolean;

  // Actions
  requestLocationPermission: () => Promise<boolean>;
  getCurrentLocation: () => Promise<LocationType | null>;
  sendSignal: (signalData: {
    message?: string;
    radius: number;
    targetType: 'all' | 'crews' | 'contacts';
    targetIds: string[];
  }) => Promise<void>;
  respondToSignal: (signalId: string, response: 'accept' | 'ignore') => Promise<void>;
  updateUserLocation: (location: LocationType) => Promise<void>;
  cancelSignal: (signalId: string) => Promise<void>;
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
  
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [activeSignals, setActiveSignals] = useState<Signal[]>([]);
  const [receivedSignals, setReceivedSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean>(false);

  useEffect(() => {
    if (user) {
      subscribeToActiveSignals();
      subscribeToReceivedSignals();
      checkLocationPermission();
    }
  }, [user]);

  const checkLocationPermission = async () => {
    try {
      const { status } = await getForegroundPermissionsAsync();
      setLocationPermissionGranted(status === 'granted');
    } catch (error) {
      console.error('Error checking location permission:', error);
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
          timeout: 10000,
        });
      } catch (highAccuracyError) {
        console.log('High accuracy failed, trying balanced accuracy...', highAccuracyError);
        
        // Fallback to balanced accuracy for simulator/problematic devices
        try {
          location = await getCurrentPositionAsync({
            accuracy: Accuracy.Balanced,
            timeout: 15000,
          });
        } catch (balancedError) {
          console.log('Balanced accuracy failed, trying low accuracy...', balancedError);
          
          // Final fallback to low accuracy
          location = await getCurrentPositionAsync({
            accuracy: Accuracy.Low,
            timeout: 20000,
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isSimulatorError = errorMessage.includes('kCLErrorDomain') || errorMessage.includes('ERR_LOCATION_UNAVAILABLE');
      const isIOSSimulator = Platform.OS === 'ios' && __DEV__;
      
      Toast.show({
        type: 'error',
        text1: 'Location Error',
        text2: isSimulatorError && isIOSSimulator
          ? 'iOS Simulator: Please set a custom location in Device > Location'
          : 'Failed to get current location. Please check location services.',
      });
      
      // Development fallback for testing (San Francisco coordinates)
      if (__DEV__ && isIOSSimulator) {
        console.log('Using development fallback location for iOS Simulator testing...');
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
      const updateLocationCallable = httpsCallable(functions, 'updateUserLocation');
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
      where('status', '==', 'active')
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
    const q = query(
      collection(db, 'signals'),
      where('status', '==', 'active')
    );

    return onSnapshot(q, (snapshot) => {
      const signals: Signal[] = [];
      snapshot.forEach((doc) => {
        const signalData = { id: doc.id, ...doc.data() } as Signal;
        // Don't include user's own signals
        if (signalData.senderId !== user.uid) {
          // Check if user has already responded
          const hasResponded = signalData.responses?.some(
            (response: SignalResponse) => response.responderId === user.uid
          );
          if (!hasResponded) {
            signals.push(signalData);
          }
        }
      });
      setReceivedSignals(signals);
    });
  };

  const sendSignal = async (signalData: {
    message?: string;
    radius: number;
    targetType: 'all' | 'crews' | 'contacts';
    targetIds: string[];
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
      const signal: Omit<Signal, 'id'> = {
        senderId: user.uid,
        message: signalData.message?.trim() || undefined,
        radius: signalData.radius,
        location,
        targetType: signalData.targetType,
        targetIds: signalData.targetIds,
        createdAt: serverTimestamp() as any,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) as any, // 2 hours
        responses: [],
        status: 'active',
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

  const respondToSignal = async (signalId: string, response: 'accept' | 'ignore'): Promise<void> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);

    try {
      let location: LocationType | undefined;
      
      if (response === 'accept') {
        const location = await getCurrentLocation();
        if (!location) {
          throw new Error('Location required to accept signal');
        }
      }

      const respondToSignalCallable = httpsCallable(functions, 'respondToSignal');
      await respondToSignalCallable({
        signalId,
        response,
        location: location || undefined,
      });

      Toast.show({
        type: 'success',
        text1: response === 'accept' ? 'Accepted!' : 'Ignored',
        text2: response === 'accept' ? 'Your location has been shared' : 'Signal ignored',
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

  const cancelSignal = async (signalId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'signals', signalId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });

      Toast.show({
        type: 'success',
        text1: 'Signal Cancelled',
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

  const value: SignalContextType = {
    currentLocation,
    activeSignals,
    receivedSignals,
    isLoading,
    locationPermissionGranted,
    requestLocationPermission,
    getCurrentLocation,
    sendSignal,
    respondToSignal,
    updateUserLocation,
    cancelSignal,
  };

  return (
    <SignalContext.Provider value={value}>
      {children}
    </SignalContext.Provider>
  );
};