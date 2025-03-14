// firebase.ts
import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Your Firebase configuration (from the Firebase console)
const firebaseConfig = {
  apiKey: 'AIzaSyBGzk3lvP9pboBVpOERejYweH6Xk1dHB8k',
  authDomain: 'goingoutapp-c90b1.firebaseapp.com',
  projectId: 'goingoutapp-c90b1',
  storageBucket: 'goingoutapp-c90b1.appspot.com',
  messagingSenderId: '814136772684',
  appId: '1:814136772684:web:287e5a3b413533b81b8ce9',
  measurementId: 'G-XZSBDHERB0',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
let auth: ReturnType<typeof initializeAuth> | ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e: any) {
  if (e.code === 'app/duplicate-app' || e.code === 'auth/already-initialized') {
    auth = getAuth(app);
  } else {
    throw e;
  }
}
const db = getFirestore(app, '(default)');
const functions = getFunctions(app);
const storage = getStorage(app);

// const isAndroid = Platform.OS === 'android';
// const isIOS = Platform.OS === 'ios';

// let emulatorHost = 'localhost'; // Default for iOS Simulator
// let emulatorPort = 5001; // Default Functions emulator port

// if (isAndroid) {
//   emulatorHost = '10.0.2.2'; // Android Emulator
// } else if (isIOS) {
//   emulatorHost = 'localhost'; // iOS Simulator
// } else {
//   // For physical devices, replace with your computer's IP
//   emulatorHost = '192.168.4.160';
// }

// Connect to Functions emulator if in development
// if (__DEV__) {
//   console.log('Connecting to Functions emulator:', emulatorHost, emulatorPort);
//   connectFunctionsEmulator(functions, emulatorHost, emulatorPort);
// }

const deleteCrew = (crewId: string) => {
  if (!auth.currentUser) {
    throw new Error('User is not authenticated');
  }
  const deleteCrewCallable = httpsCallable(functions, 'deleteCrew');
  return deleteCrewCallable({ crewId });
};

const pokeCrew = (crewId: string, date: string, userId: string) => {
  if (!auth.currentUser) {
    throw new Error('User is not authenticated');
  }
  const pokeCrewCallable = httpsCallable(functions, 'pokeCrew');
  return pokeCrewCallable({ crewId, date, userId });
};

const deleteAccount = (targetUserId?: string) => {
  if (!auth.currentUser) {
    throw new Error('User is not authenticated');
  }
  const deleteAccountCallable = httpsCallable(functions, 'deleteAccount');
  return deleteAccountCallable({ targetUserId });
};

export {
  auth,
  db,
  functions,
  storage,
  deleteCrew,
  pokeCrew,
  deleteAccount,
  firebaseConfig,
};
