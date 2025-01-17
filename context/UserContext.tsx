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
import { auth, db } from '@/firebase'; // Ensure correct import paths
import { User } from '@/types/User';
import { Alert } from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore'; // Firestore functions
import Toast from 'react-native-toast-message';
import * as Notifications from 'expo-notifications';

interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  activeChats: Set<string>; // Using Set for efficient lookups
  addActiveChat: (chatId: string) => void;
  removeActiveChat: (chatId: string) => void;
  setBadgeCount: (count: number) => Promise<void>; // Added setBadgeCount
}

const UserContext = createContext<UserContextType | undefined>(undefined);

type UserProviderProps = {
  children: ReactNode;
};

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeChats, setActiveChats] = useState<Set<string>>(new Set());

  const memoizedActiveChats = useMemo(() => activeChats, [activeChats]);

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Reference to the user's document in Firestore
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            //setUser(userData);

            // Initialize activeChats from Firestore
            const activeChatsFromDB = new Set<string>(
              userData.activeChats || [],
            );
            setActiveChats(activeChatsFromDB);
          } else {
            // Handle case where user document doesn't exist
            console.log('User document does not exist in Firestore.');
            setUser(null);
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
        // User is signed out
        setUser(null);
        setActiveChats(new Set());
      }
    });

    // Cleanup the listener on unmount
    return () => unsubscribe();
  }, []);

  // Function to update activeChats in Firestore
  const updateActiveChatsInDB = useCallback(
    async (chats: Set<string>) => {
      if (!user?.uid) return;
      const userDocRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userDocRef, {
          activeChats: Array.from(chats), // Convert Set to Array for Firestore
        });
      } catch (error) {
        console.error('Error updating active chats:', error);
      }
    },
    [user?.uid],
  );

  // Function to add a chat to activeChats
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

  // Function to remove a chat from activeChats
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

  const logout = async () => {
    try {
      Alert.alert('Log out', 'Are you sure you want to log out?', [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            setUser(null);
            await auth.signOut();
            setActiveChats(new Set());
          },
        },
      ]);
    } catch (error) {
      console.error('Logout Error:', error);
      throw error; // Re-throw the error to handle it in the calling component
    }
  };

  return (
    <UserContext.Provider
      value={{
        user,
        setUser,
        logout,
        activeChats: memoizedActiveChats,
        addActiveChat,
        removeActiveChat,
        setBadgeCount, // Expose setBadgeCount
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
