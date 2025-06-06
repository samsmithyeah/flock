import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';

interface Location {
  latitude: number;
  longitude: number;
}

interface SignalResponse {
  id: string;
  signalId: string;
  responderId: string;
  responderName?: string;
  response: 'accept' | 'ignore';
  location?: Location;
  respondedAt: admin.firestore.Timestamp;
}

interface Signal {
  id: string;
  senderId: string;
  message?: string;
  radius: number;
  location: Location;
  targetType: 'all' | 'crews' | 'contacts';
  targetIds: string[];
  targetCrewNames?: string[];
  createdAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
  durationMinutes?: number;
  responses: SignalResponse[];
  status: 'active' | 'expired' | 'cancelled';
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - First latitude
 * @param {number} lon1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lon2 - Second longitude
 * @return {number} Distance in meters
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

export const processSignal = functions.firestore.onDocumentCreated(
  'signals/{signalId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data associated with the event');
      return;
    }

    const signalData = snapshot.data() as Signal;
    const signalId = snapshot.id;

    console.log(`Processing signal ${signalId} from user ${signalData.senderId}`);

    const db = admin.firestore();

    try {
      // Get sender information
      const senderDoc = await db.collection('users').doc(signalData.senderId).get();
      if (!senderDoc.exists) {
        console.error('Sender not found');
        return;
      }

      const senderData = senderDoc.data();
      const senderName = senderData?.displayName || 'Someone';

      // Determine target users based on signal type
      let targetUserIds: string[] = [];

      if (signalData.targetType === 'all') {
        // Get all users (simplified - in production you'd want to get user's contacts)
        const usersSnapshot = await db.collection('users').get();
        targetUserIds = usersSnapshot.docs
          .map((doc) => doc.id)
          .filter((uid) => uid !== signalData.senderId);
      } else if (signalData.targetType === 'crews') {
        // Get members from specified crews and collect crew names
        const crewPromises = signalData.targetIds.map((crewId) =>
          db.collection('crews').doc(crewId).get(),
        );
        const crewDocs = await Promise.all(crewPromises);
        const memberIds = new Set<string>();
        const crewNames: string[] = [];

        crewDocs.forEach((doc) => {
          if (doc.exists) {
            const crewData = doc.data();
            if (crewData?.name) {
              crewNames.push(crewData.name);
            }
            if (crewData?.memberIds) {
              crewData.memberIds.forEach((memberId: string) => {
                if (memberId !== signalData.senderId) {
                  memberIds.add(memberId);
                }
              });
            }
          }
        });

        targetUserIds = Array.from(memberIds);

        // Update the signal document with crew names for display purposes
        if (crewNames.length > 0) {
          await db.collection('signals').doc(signalId).update({
            targetCrewNames: crewNames,
          });
        }
      }

      if (targetUserIds.length === 0) {
        console.log('No target users found');
        return;
      }

      // Get users with location data and filter by proximity
      const eligibleUsers: { uid: string; token: string; distance: number }[] = [];
      // Process users in batches to avoid Firestore limits
      const batchSize = 10;
      for (let i = 0; i < targetUserIds.length; i += batchSize) {
        const batch = targetUserIds.slice(i, i + batchSize);
        const usersSnapshot = await db.collection('users')
          .where(admin.firestore.FieldPath.documentId(), 'in', batch)
          .get();

        for (const userDoc of usersSnapshot.docs) {
          const userData = userDoc.data();

          // First check if user has location tracking enabled
          if (userData.locationTrackingEnabled === false) {
            console.log(`User ${userDoc.id} has location tracking disabled, skipping`);
            continue;
          }

          // Check if user has valid push tokens
          const tokens: string[] = [];
          if (userData.expoPushToken && Expo.isExpoPushToken(userData.expoPushToken)) {
            tokens.push(userData.expoPushToken);
          }
          if (userData.expoPushTokens && Array.isArray(userData.expoPushTokens)) {
            userData.expoPushTokens.forEach((token: string) => {
              if (Expo.isExpoPushToken(token)) {
                tokens.push(token);
              }
            });
          }

          if (tokens.length === 0) continue;

          // Check if user has recent location data
          // For now, we'll simulate location data - in production you'd store user locations
          // or get them from a location collection
          const userLocationDoc = await db.collection('userLocations').doc(userDoc.id).get();
          if (userLocationDoc.exists) {
            const locationData = userLocationDoc.data();
            // Use rounded coordinates for distance calculation (maintains ~100m precision)
            if (locationData?.latitude && locationData?.longitude) {
              const distance = calculateDistance(
                signalData.location.latitude,
                signalData.location.longitude,
                locationData.latitude,
                locationData.longitude
              );

              if (distance <= signalData.radius) {
                tokens.forEach((token) => {
                  eligibleUsers.push({
                    uid: userDoc.id,
                    token,
                    distance,
                  });
                });
              }
            }
          }
        }
      }

      if (eligibleUsers.length === 0) {
        console.log('No eligible users within radius');
        return;
      }

      // Prepare notification messages
      const durationMinutes = signalData.durationMinutes || 120; // Default 2 hours

      // Get crew names from updated signal document for notifications
      const updatedSignalDoc = await db.collection('signals').doc(signalId).get();
      const updatedSignalData = updatedSignalDoc.data() as Signal;
      const allCrewNames = updatedSignalData?.targetCrewNames || [];

      // Create a map of user IDs to their crew names for filtering
      const userCrewNamesMap = new Map<string, string[]>();

      if (signalData.targetType === 'crews' && allCrewNames.length > 0) {
        // For crew signals, we need to determine which crews each user belongs to
        for (const userId of targetUserIds) {
          // Get user's crews by checking which crews they are a member of
          const userCrewsQuery = await db.collection('crews')
            .where('memberIds', 'array-contains', userId)
            .get();

          const userCrewNames: string[] = [];
          userCrewsQuery.docs.forEach((doc) => {
            const crewData = doc.data();
            if (crewData?.name && allCrewNames.includes(crewData.name)) {
              userCrewNames.push(crewData.name);
            }
          });

          userCrewNamesMap.set(userId, userCrewNames);
        }
      }

      const messages: ExpoPushMessage[] = eligibleUsers.map((user) => {
        const distanceText = user.distance < 1000 ?
          `${Math.round(user.distance)}m away` :
          `${(user.distance / 1000).toFixed(1)}km away`;

        // Create crew-specific title and body, filtered for this user
        let title = `📍 ${senderName} wants to meet up!`;
        let body = signalData.message || 'Someone nearby wants to meet up right now!';
        let userCrewNames: string[] = [];

        if (signalData.targetType === 'crews') {
          userCrewNames = userCrewNamesMap.get(user.uid) || [];

          if (userCrewNames.length > 0) {
            const crewText = userCrewNames.length === 1 ?
              `${userCrewNames[0]}` :
              userCrewNames.length === 2 ?
                `${userCrewNames[0]} and ${userCrewNames[1]}` :
                `${userCrewNames[0]} and ${userCrewNames.length - 1} other crew${userCrewNames.length - 1 > 1 ? 's' : ''}`;

            title = `📍 ${senderName} wants ${crewText} to meet up!`;

            if (!signalData.message) {
              body = `${senderName} is signaling ${crewText} to meet up right now!`;
            }
          }
        }

        return {
          to: user.token,
          sound: 'default',
          title,
          subtitle: distanceText,
          body,
          data: {
            type: 'signal',
            signalId,
            senderId: signalData.senderId,
            senderName,
            distance: user.distance,
            targetCrewNames: userCrewNames, // Only include crews this user belongs to
            screen: 'Signal',
          },
          priority: 'high',
          ttl: durationMinutes * 60, // TTL in seconds = duration in minutes * 60
        };
      });

      // Send notifications
      await sendExpoNotifications(messages);

      console.log(`Sent ${messages.length} signal notifications for signal ${signalId} to users:`, eligibleUsers.map((u) => u.uid));

      // Update signal with notification count
      await db.collection('signals').doc(signalId).update({
        notificationsSent: messages.length,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error('Error processing signal:', error);

      // Mark signal as failed
      await db.collection('signals').doc(signalId).update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  },
);

export const updateUserLocation = functions.https.onCall(
  async (request) => {
    const { auth, data } = request;

    if (!auth || !auth.uid) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.',
      );
    }

    const { latitude, longitude } = data;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Valid latitude and longitude are required.',
      );
    }

    const db = admin.firestore();

    try {
      await db.collection('userLocations').doc(auth.uid).set({
        latitude,
        longitude,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return { success: true };
    } catch (error) {
      console.error('Error updating user location:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to update location.',
      );
    }
  },
);
