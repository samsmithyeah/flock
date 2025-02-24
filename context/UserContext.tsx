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

interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  activeChats: Set<string>;
  addActiveChat: (chatId: string) => void;
  removeActiveChat: (chatId: string) => void;
  setBadgeCount: (count: number) => Promise<void>;
  isAdmin: boolean;
  updateCrewOrder: (crewIds: string[]) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

type UserProviderProps = {
  children: ReactNode;
};

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeChats, setActiveChats] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const memoizedActiveChats = useMemo(() => activeChats, [activeChats]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            if (userData.phoneNumber) setUser(userData);
            const tokenResult = await getIdTokenResult(firebaseUser);
            const adminClaim = tokenResult.claims.admin ?? false;
            setIsAdmin(adminClaim as boolean);
            const activeChatsFromDB = new Set<string>(
              userData.activeChats || [],
            );
            setActiveChats(activeChatsFromDB);
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
    });
    return () => unsubscribe();
  }, []);

  // Listen to app state changes to update online status
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (!user?.uid) return;
      const userDocRef = doc(db, 'users', user.uid);
      if (nextAppState === 'active') {
        try {
          await updateDoc(userDocRef, {
            isOnline: true,
            lastSeen: serverTimestamp(),
          });
        } catch (error) {
          console.error('Error updating user online status:', error);
        }
      } else {
        try {
          await updateDoc(userDocRef, {
            isOnline: false,
            lastSeen: serverTimestamp(),
          });
        } catch (error) {
          console.error('Error updating user online status:', error);
        }
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
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
        logout,
        activeChats: memoizedActiveChats,
        addActiveChat,
        removeActiveChat,
        setBadgeCount,
        isAdmin,
        updateCrewOrder,
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
