import { Timestamp, GeoPoint } from 'firebase/firestore';

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
  lastKnownLocation?: GeoPoint;
  lastKnownLocationTimestamp?: Timestamp;
  liveLocation?: GeoPoint; // Actively updated during a sharing session
  isSharingLocationWith?: Array<{ signalId: string, userId: string, expiresAt: Timestamp }>; // Info about current sharing sessions
}
