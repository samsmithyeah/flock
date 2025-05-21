import { Timestamp, GeoPoint } from 'firebase/firestore';

export interface BatSignal {
  id: string; // Document ID
  senderId: string;
  senderName?: string; // Denormalized for quick display on recipient side
  senderProfilePictureUrl?: string; // Denormalized (should align with User.photoURL)
  location: GeoPoint; // Sender's location when signal was sent
  radiusMetres: number;
  message?: string; // Optional message from sender
  status: 'active' | 'expired' | 'cancelled'; // 'pending_sender_consent' could be another status
  createdAt: Timestamp;
  expiresAt: Timestamp;
  notifiedRecipientIds: string[]; // List of UIDs who were actually notified
}

export interface BatSignalAcceptance {
  id: string; // Document ID (likely signalId_recipientId for easy lookup)
  signalId: string;
  recipientId: string;
  senderId: string; // For easier querying/filtering on sender's side
  recipientName?: string; // Denormalized from User profile
  recipientProfilePictureUrl?: string; // Denormalized from User profile (should align with User.photoURL)
  status: 'pending' | 'accepted' | 'declined' | 'ignored'; // 'ignored' could be implicit or set if signal expires before action
  acceptedAt?: Timestamp;
  declinedAt?: Timestamp;
  senderConsentedShare?: Timestamp; // Timestamp of when sender consented to share location for this signal
  recipientConsentedShare?: Timestamp; // Timestamp of when recipient consented
  sharingStartedAt?: Timestamp; // Optional: When both consented and sharing begins (could be set by a trigger or client)
  sharingExpiresAt?: Timestamp; // Calculated time when live sharing should stop
  sharingStoppedManually?: boolean; // Optional: If either user explicitly stopped sharing via UI
}
