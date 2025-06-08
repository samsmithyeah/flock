// context/UserContext.tsx
import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { AppState } from 'react-native';
import { auth, db } from '@/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import Toast from 'react-native-toast-message';
import * as Notifications from 'expo-notifications';
import { getIdTokenResult } from 'firebase/auth';
import { User } from '@/types/User';
import { router } from 'expo-router';
import { storage } from '@/storage';

// MMKV keys for persisting user preferences
const STORAGE_KEYS = {
  FOREGROUND_LOCATION_DISABLED: 'userDisabledForegroundLocation',
  BACKGROUND_TRACKING_DISABLED: 'userDisabledBackgroundTracking',
};

// Helper functions for persisting location preferences using MMKV
const persistForegroundLocationPreference = (disabled: boolean): void => {
  try {
    storage.set(STORAGE_KEYS.FOREGROUND_LOCATION_DISABLED, disabled);
    console.log(
      `Persisted foreground location preference: disabled=${disabled}`,
    );
  } catch (error) {
    console.error('Error persisting foreground location preference:', error);
  }
};

const loadForegroundLocationPreference = (): boolean => {
  try {
    const disabled =
      storage.getBoolean(STORAGE_KEYS.FOREGROUND_LOCATION_DISABLED) ?? false;
    console.log(`Loaded foreground location preference: disabled=${disabled}`);
    return disabled;
  } catch (error) {
    console.error('Error loading foreground location preference:', error);
    return false; // Default to not disabled
  }
};

const persistBackgroundTrackingPreference = (disabled: boolean): void => {
  try {
    storage.set(STORAGE_KEYS.BACKGROUND_TRACKING_DISABLED, disabled);
    console.log(
      `Persisted background tracking preference: disabled=${disabled}`,
    );
  } catch (error) {
    console.error('Error persisting background tracking preference:', error);
  }
};

const loadBackgroundTrackingPreference = (): boolean => {
  try {
    const disabled =
      storage.getBoolean(STORAGE_KEYS.BACKGROUND_TRACKING_DISABLED) ?? false;
    console.log(`Loaded background tracking preference: disabled=${disabled}`);
    return disabled;
  } catch (error) {
    console.error('Error loading background tracking preference:', error);
    return false; // Default to not disabled
  }
};

const clearLocationPreferences = (): void => {
  try {
    storage.delete(STORAGE_KEYS.FOREGROUND_LOCATION_DISABLED);
    storage.delete(STORAGE_KEYS.BACKGROUND_TRACKING_DISABLED);
    console.log('Cleared all location preferences');
  } catch (error) {
    console.error('Error clearing location preferences:', error);
  }
};

interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  isInitializing: boolean; // New state to track initial auth check
  logout: () => Promise<void>;
  activeChats: Set<string>;
  addActiveChat: (chatId: string) => void;
  removeActiveChat: (chatId: string) => void;
  setBadgeCount: (count: number) => Promise<void>;
  isAdmin: boolean;
  updateCrewOrder: (crewIds: string[]) => Promise<void>;
  // Location preference methods
  userDisabledForegroundLocation: boolean;
  setUserDisabledForegroundLocation: (disabled: boolean) => void;
  persistForegroundLocationPreference: (disabled: boolean) => void;
  loadForegroundLocationPreference: () => boolean;
  userDisabledBackgroundTracking: boolean;
  setUserDisabledBackgroundTracking: (disabled: boolean) => void;
  persistBackgroundTrackingPreference: (disabled: boolean) => void;
  loadBackgroundTrackingPreference: () => boolean;
  clearUserPreferences: () => void;
  // Database location tracking preference
  updateLocationTrackingEnabled: (enabled: boolean) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

type UserProviderProps = {
  children: ReactNode;
};

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true); // Start as true
  const [activeChats, setActiveChats] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Track user's manual preferences for location permissions
  // This prevents auto-restart when user manually disables permissions
  const [userDisabledForegroundLocation, setUserDisabledForegroundLocation] =
    useState<boolean>(false);
  const [userDisabledBackgroundTracking, setUserDisabledBackgroundTracking] =
    useState<boolean>(false);

  const memoizedActiveChats = useMemo(() => activeChats, [activeChats]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;

            // Migration: Set default locationTrackingEnabled for existing users
            if (userData.locationTrackingEnabled === undefined) {
              await updateDoc(userDocRef, {
                locationTrackingEnabled: true,
              });
              userData.locationTrackingEnabled = true;
            }

            if (userData.phoneNumber) setUser(userData);
            const tokenResult = await getIdTokenResult(firebaseUser);
            const adminClaim = tokenResult.claims.admin ?? false;
            setIsAdmin(adminClaim as boolean);
            const activeChatsFromDB = new Set<string>(
              userData.activeChats || [],
            );
            setActiveChats(activeChatsFromDB);

            // Load user's preferences for location tracking when logging in
            const foregroundDisabled = loadForegroundLocationPreference();
            setUserDisabledForegroundLocation(foregroundDisabled);
            const backgroundDisabled = loadBackgroundTrackingPreference();
            setUserDisabledBackgroundTracking(backgroundDisabled);
          } else {
            console.log('User document does not exist in Firestore.');
            setUser(null);
            setIsAdmin(false);
            setActiveChats(new Set());
          }
        } catch (error) {
          console.error('Error fetching user data from Firestore:', error);
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Could not fetch user data',
          });
          setUser(null);
          setActiveChats(new Set());
        }
      } else {
        setUser(null);
        setActiveChats(new Set());
      }
      setIsInitializing(false); // Set to false after auth check is complete
    });
    return () => unsubscribe();
  }, []);

  // Listen to app state changes to update online status
  useEffect(() => {
    let isMounted = true;

    const handleAppStateChange = async (nextAppState: string) => {
      if (!user?.uid) return;
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const isActive = nextAppState === 'active';

        // Only update if component is still mounted and this is the most recent update
        if (isMounted) {
          await updateDoc(userDocRef, {
            isOnline: isActive,
            lastSeen: serverTimestamp(),
          });
        }
      } catch (error) {
        console.error('Error updating user online status:', error);
      }
    };

    // Set initial online status when component mounts
    const setInitialStatus = async () => {
      if (!user?.uid) return;
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, {
          isOnline: true,
          lastSeen: serverTimestamp(),
        });
      } catch (error) {
        console.error('Error setting initial online status:', error);
      }
    };

    setInitialStatus();
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      isMounted = false;
      subscription.remove();

      // Ensure user is marked offline when component unmounts
      if (user?.uid) {
        const userDocRef = doc(db, 'users', user.uid);
        updateDoc(userDocRef, {
          isOnline: false,
          lastSeen: serverTimestamp(),
        }).catch((error) => {
          console.error('Error updating offline status on unmount:', error);
        });
      }
    };
  }, [user?.uid]);

  const updateActiveChatsInDB = useCallback(
    async (chats: Set<string>) => {
      if (!user?.uid) return;
      const userDocRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userDocRef, {
          activeChats: Array.from(chats),
        });
      } catch (error) {
        console.error('Error updating active chats:', error);
      }
    },
    [user?.uid],
  );

  const addActiveChat = useCallback(
    (chatId: string) => {
      setActiveChats((prev) => {
        const updated = new Set(prev);
        updated.add(chatId);
        updateActiveChatsInDB(updated);
        return updated;
      });
    },
    [updateActiveChatsInDB],
  );

  const removeActiveChat = useCallback(
    (chatId: string) => {
      setActiveChats((prev) => {
        const updated = new Set(prev);
        updated.delete(chatId);
        updateActiveChatsInDB(updated);
        return updated;
      });
    },
    [updateActiveChatsInDB],
  );

  const setBadgeCount = useCallback(
    async (count: number) => {
      if (!user?.uid) return;
      const userDocRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userDocRef, { badgeCount: count });
        Notifications.setBadgeCountAsync(count);
        console.log(`Badge count updated to ${count} for user ${user.uid}`);
      } catch (error) {
        console.error('Error setting badge count:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not update badge count',
        });
      }
    },
    [user?.uid],
  );

  const updateCrewOrder = useCallback(
    async (crewIds: string[]) => {
      if (!user?.uid) return;
      const userDocRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userDocRef, {
          crewOrder: crewIds,
        });
        setUser((prev) => (prev ? { ...prev, crewOrder: crewIds } : null));
      } catch (error) {
        console.error('Error updating crew order:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not update crew order',
        });
      }
    },
    [user?.uid],
  );

  // Location preference management methods
  const persistUserForegroundLocationPreference = useCallback(
    (disabled: boolean) => {
      persistForegroundLocationPreference(disabled);
    },
    [],
  );

  const loadUserForegroundLocationPreference = useCallback(() => {
    return loadForegroundLocationPreference();
  }, []);

  const persistUserBackgroundTrackingPreference = useCallback(
    (disabled: boolean) => {
      persistBackgroundTrackingPreference(disabled);
    },
    [],
  );

  const loadUserBackgroundTrackingPreference = useCallback(() => {
    return loadBackgroundTrackingPreference();
  }, []);

  const clearUserPreferences = useCallback(() => {
    clearLocationPreferences();
  }, []);

  const updateLocationTrackingEnabled = useCallback(
    async (enabled: boolean) => {
      if (!user?.uid) return;
      const userDocRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userDocRef, {
          locationTrackingEnabled: enabled,
        });
        setUser((prev) =>
          prev ? { ...prev, locationTrackingEnabled: enabled } : null,
        );

        // When location tracking is disabled, delete their saved location
        // This prevents them from being matched by signals geographically
        if (!enabled) {
          const userLocationRef = doc(db, 'userLocations', user.uid);
          try {
            await updateDoc(userLocationRef, {
              latitude: null,
              longitude: null,
              updatedAt: serverTimestamp(),
            });
            console.log('Cleared user location data when disabling tracking');
          } catch (locationError) {
            // If the document doesn't exist, that's fine - no location to clear
            console.log(
              'No existing location to clear or error clearing location:',
              locationError,
            );
          }
        }
      } catch (error) {
        console.error('Error updating location tracking enabled:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not update location tracking preference',
        });
      }
    },
    [user?.uid],
  );

  const logout = async () => {
    try {
      setUser(null);
      await auth.signOut();
      setActiveChats(new Set());
      Toast.show({
        type: 'success',
        text1: 'Logged out',
        text2: 'You have successfully logged out',
      });
      router.replace('/(auth)/login');
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to log out',
      });
      console.error('Logout Error:', error);
      throw error;
    }
  };

  return (
    <UserContext.Provider
      value={{
        user,
        setUser,
        isInitializing,
        logout,
        activeChats: memoizedActiveChats,
        addActiveChat,
        removeActiveChat,
        setBadgeCount,
        isAdmin,
        updateCrewOrder,
        userDisabledForegroundLocation,
        setUserDisabledForegroundLocation,
        persistForegroundLocationPreference:
          persistUserForegroundLocationPreference,
        loadForegroundLocationPreference: loadUserForegroundLocationPreference,
        userDisabledBackgroundTracking,
        setUserDisabledBackgroundTracking,
        persistBackgroundTrackingPreference:
          persistUserBackgroundTrackingPreference,
        loadBackgroundTrackingPreference: loadUserBackgroundTrackingPreference,
        clearUserPreferences,
        updateLocationTrackingEnabled,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
