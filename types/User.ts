import { Timestamp } from 'firebase/firestore';
import { NotificationSettings } from './NotificationSettings';

export interface User {
  uid: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  photoURL?: string;
  expoPushToken?: string;
  activeChats?: string[];
  badgeCount?: number;
  phoneNumber?: string;
  country?: string;
  isOnline?: boolean;
  lastSeen?: Timestamp;
  crewOrder?: string[];
  locationTrackingEnabled?: boolean;
  notificationSettings?: NotificationSettings;
}
