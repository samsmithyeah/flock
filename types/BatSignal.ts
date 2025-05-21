import { Timestamp, GeoPoint } from 'firebase/firestore';

export interface BatSignal {
  id: string; // Document ID
  senderId: string;
  senderName?: string; // Denormalized for quick display on recipient side
  senderProfilePictureUrl?: string; // Denormalized
  location: GeoPoint; // Sender's location when signal was sent
  radiusMetres: number;
  // targetAudienceType: 'all' | 'crews' | 'contacts'; // Not needed if we store targetIds directly or rely on notifiedRecipientIds
  // targetIds?: string[]; // Specific crew or user UIDs, if applicable
  message?: string; // Optional message from sender (Phase 2)
  status: 'active' | 'expired' | 'cancelled';
  createdAt: Timestamp;
  expiresAt: Timestamp;
  notifiedRecipientIds: string[]; // List of UIDs who were actually notified
}

export interface BatSignalAcceptance {
  id: string; // Document ID (likely signalId_recipientId for easy lookup)
  signalId: string;
  recipientId: string;
  senderId: string; // For easier querying/filtering on sender's side
  status: 'pending' | 'accepted' | 'declined' | 'ignored'; // 'ignored' could be implicit if no record exists
  acceptedAt?: Timestamp;
  declinedAt?: Timestamp;
  senderConsentedShare?: Timestamp; // Timestamp of when sender consented to share location for this signal
  recipientConsentedShare?: Timestamp; // Timestamp of when recipient consented
  sharingStartedAt?: Timestamp; // When both consented and sharing begins
  sharingExpiresAt?: Timestamp; // Calculated time when live sharing should stop
  sharingStoppedManually?: boolean; // If either user explicitly stopped sharing
}
