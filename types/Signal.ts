import { Timestamp } from 'firebase/firestore';

export interface Location {
  latitude: number;
  longitude: number;
}

export interface SignalResponse {
  id: string;
  signalId: string;
  responderId: string;
  responderName?: string;
  response: 'accept' | 'ignore';
  location?: Location;
  respondedAt: Timestamp;
}

export interface Signal {
  id: string;
  senderId: string;
  senderName?: string; // Added for display purposes
  message?: string;
  radius: number; // in meters
  location: Location;
  targetType: 'all' | 'crews' | 'contacts';
  targetIds: string[]; // crew IDs or contact IDs depending on targetType
  createdAt: Timestamp;
  expiresAt: Timestamp;
  responses: SignalResponse[];
  status: 'active' | 'expired' | 'cancelled';
  notificationsSent?: number; // Number of users that were notified about this signal
}

export interface SignalNotification {
  signalId: string;
  senderId: string;
  senderName: string;
  message?: string;
  distance: number; // distance from recipient in meters
  createdAt: Timestamp;
}

export interface SharedLocation {
  id: string;
  signalId: string;
  senderId: string;
  responderId: string;
  senderLocation: Location;
  responderLocation: Location;
  otherUserId: string;
  otherUserName: string;
  otherUserLocation: Location;
  expiresAt: Date;
  createdAt: Date;
  status: 'active' | 'expired';
}
