import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GeoPoint, Timestamp } from 'firebase-admin/firestore'; // Correct import for admin SDK
import { BatSignal, BatSignalAcceptance } from '../../types/BatSignal'; // Adjust path as per your project structure
import { User } from '../../types/User';           // Adjust path
import { sendExpoNotifications, ExpoNotification } from './utils/sendExpoNotifications'; // Adjust path
// Potentially: import { getMatchedUsersFromContacts } from './utils/getMatchedUsersFromContacts'; // Adjust path

// Define a helper for distance calculation (Haversine formula)
function getDistanceInMetres(geo1: GeoPoint, geo2: GeoPoint): number {
  const R = 6371e3; // Earth radius in metres
  const lat1 = geo1.latitude * Math.PI / 180;
  const lat2 = geo2.latitude * Math.PI / 180;
  const deltaLat = (geo2.latitude - geo1.latitude) * Math.PI / 180;
  const deltaLng = (geo2.longitude - geo1.longitude) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const sendBatSignal = functions
  .region('europe-west1') // Specify your region
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    // 1. Authentication Check
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const senderId = context.auth.uid;

    // 2. Input Validation (Basic)
    const { senderLocation, radiusMetres, targetAudienceType, targetIds, message } = data; // message is now used
    if (!senderLocation || typeof radiusMetres !== 'number' || radiusMetres <= 0 || !targetAudienceType) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid parameters.');
    }
    if ((targetAudienceType === 'crews' || targetAudienceType === 'contacts') && (!Array.isArray(targetIds) || targetIds.length === 0)) {
        throw new functions.https.HttpsError('invalid-argument', `Target IDs must be provided for ${targetAudienceType}.`);
    }
    // Message validation (optional, e.g., length)
    if (message && typeof message !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid message format.');
    }


    const db = admin.firestore();
    let potentialRecipientIds: string[] = [];

    // 3. Fetch Potential Recipients
    try {
      if (targetAudienceType === 'all') {
        const contactsSnap = await db.collection(`users/${senderId}/hashedContacts`).where('status', '==', 'matched').get();
        potentialRecipientIds = contactsSnap.docs.map(doc => doc.id);
      } else if (targetAudienceType === 'crews') {
        const crewIds = targetIds as string[];
        const crewPromises = crewIds.map(crewId => db.collection('crews').doc(crewId).get());
        const crewSnaps = await Promise.all(crewPromises);
        const memberIdsSet = new Set<string>();
        crewSnaps.forEach(crewSnap => {
          if (crewSnap.exists) {
            const crewData = crewSnap.data();
            if (crewData && crewData.members) {
              (crewData.members as string[]).forEach(memberId => memberIdsSet.add(memberId));
            }
          }
        });
        potentialRecipientIds = Array.from(memberIdsSet);
      } else if (targetAudienceType === 'contacts') {
        potentialRecipientIds = targetIds as string[];
      }
    } catch (error) {
      console.error("Error fetching potential recipients:", error);
      throw new functions.https.HttpsError('internal', 'Failed to fetch recipients.');
    }

    potentialRecipientIds = potentialRecipientIds.filter(uid => uid !== senderId);
    if (potentialRecipientIds.length === 0) {
      return { success: true, signalId: null, message: "No potential recipients found." };
    }

    // 4. Fetch Last Known Locations & Filter by Stale Locations
    const validRecipientProfiles: Array<{ uid: string, location: GeoPoint, pushToken?: string, name?: string, profilePictureUrl?: string }> = [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    if (potentialRecipientIds.length > 0) {
         const userChunks = [];
         for (let i = 0; i < potentialRecipientIds.length; i += 30) { // Firestore 'in' query limit
             userChunks.push(potentialRecipientIds.slice(i, i + 30));
         }

         for (const chunk of userChunks) {
             if (chunk.length === 0) continue;
             const usersSnap = await db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
             usersSnap.forEach(doc => {
                 const userData = doc.data() as User;
                 if (userData.lastKnownLocation && userData.lastKnownLocationTimestamp &&
                     userData.lastKnownLocationTimestamp.toDate() > oneHourAgo &&
                     userData.expoPushToken) { // Ensure user has a push token to be notified
                     validRecipientProfiles.push({
                         uid: doc.id,
                         location: userData.lastKnownLocation,
                         pushToken: userData.expoPushToken,
                         name: userData.displayName,
                         profilePictureUrl: userData.photoURL // Corrected from profilePictureUrl to photoURL to match User type
                     });
                 }
             });
         }
     }

    const senderGeoPoint = new GeoPoint(senderLocation.latitude, senderLocation.longitude);
    const nearbyRecipientProfiles = validRecipientProfiles.filter(profile => {
      const distance = getDistanceInMetres(senderGeoPoint, profile.location);
      return distance <= radiusMetres;
    });

    if (nearbyRecipientProfiles.length === 0) {
      return { success: true, signalId: null, message: "No recipients found within the specified radius or with recent location." };
    }

    const notifiedRecipientIds = nearbyRecipientProfiles.map(p => p.uid);

    const signalId = db.collection('batSignals').doc().id;
    const createdAt = Timestamp.now();
    const expiresAt = Timestamp.fromDate(new Date(createdAt.toMillis() + 2 * 60 * 60 * 1000)); // 2 hours expiry

    const senderProfileSnap = await db.collection('users').doc(senderId).get();
    const senderProfile = senderProfileSnap.data() as User | undefined;

    const newSignal: BatSignal = {
      id: signalId,
      senderId: senderId,
      senderName: senderProfile?.displayName || 'A user',
      senderProfilePictureUrl: senderProfile?.photoURL, // Corrected from profilePictureUrl to photoURL
      location: senderGeoPoint,
      radiusMetres: radiusMetres,
      message: message || undefined, // Include message, ensure it's undefined if null/empty
      status: 'active',
      createdAt: createdAt,
      expiresAt: expiresAt,
      notifiedRecipientIds: notifiedRecipientIds,
    };
    await db.collection('batSignals').doc(signalId).set(newSignal);

    const notifications: ExpoNotification[] = nearbyRecipientProfiles
      // .filter(p => p.pushToken) // Already filtered in step 4
      .map(profile => ({
        to: profile.pushToken!,
        title: 'Bat Signal Received!',
        body: `${newSignal.senderName} is sending a Bat Signal near you! ${message ? `\nMessage: "${message}"` : ''}`,
        sound: 'default',
        data: {
          screenIdentifier: 'BatSignalResponse',
          signalId: signalId,
          senderId: senderId,
        },
      }));

    if (notifications.length > 0) {
      await sendExpoNotifications(notifications);
    }

    return { success: true, signalId: signalId, notifiedCount: notifications.length };
  });

export const respondToBatSignal = functions
  .region('europe-west1')
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const recipientId = context.auth.uid;
    const { signalId, recipientStatus } = data;

    if (!signalId || !recipientStatus || (recipientStatus !== 'accepted' && recipientStatus !== 'declined')) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid parameters (signalId, recipientStatus).');
    }

    const db = admin.firestore();

    try {
      const signalRef = db.collection('batSignals').doc(signalId);
      const signalSnap = await signalRef.get();

      if (!signalSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Bat Signal not found.');
      }
      const signalData = signalSnap.data() as BatSignal;

      if (signalData.status !== 'active') {
        throw new functions.https.HttpsError('failed-precondition', `Bat Signal is no longer active (status: ${signalData.status}).`);
      }
      if (signalData.expiresAt && signalData.expiresAt.toDate() < new Date()) {
        await signalRef.update({ status: 'expired' }).catch(err => console.error("Error updating signal to expired:", err));
        throw new functions.https.HttpsError('failed-precondition', 'Bat Signal has expired.');
      }

      const acceptanceId = `${signalId}_${recipientId}`;
      const acceptanceRef = db.collection('batSignalAcceptances').doc(acceptanceId);
      
      const recipientProfileSnap = await db.collection('users').doc(recipientId).get();
      const recipientProfile = recipientProfileSnap.data() as User | undefined;

      const acceptanceUpdateData: Partial<BatSignalAcceptance> = {
        signalId: signalId,
        recipientId: recipientId,
        senderId: signalData.senderId,
        status: recipientStatus,
        recipientName: recipientProfile?.displayName, // Denormalize recipient name
        recipientProfilePictureUrl: recipientProfile?.photoURL, // Denormalize recipient photo
      };

      if (recipientStatus === 'accepted') {
        acceptanceUpdateData.acceptedAt = serverTimestamp() as Timestamp;
        acceptanceUpdateData.declinedAt = admin.firestore.FieldValue.delete() as any; // Firestore will handle type
      } else { // declined
        acceptanceUpdateData.declinedAt = serverTimestamp() as Timestamp;
        acceptanceUpdateData.acceptedAt = admin.firestore.FieldValue.delete() as any;
        acceptanceUpdateData.recipientConsentedShare = admin.firestore.FieldValue.delete() as any;
        acceptanceUpdateData.senderConsentedShare = admin.firestore.FieldValue.delete() as any; // Also clear sender consent if recipient declines
        acceptanceUpdateData.sharingExpiresAt = admin.firestore.FieldValue.delete() as any;
      }

      await acceptanceRef.set(acceptanceUpdateData, { merge: true });

      if (recipientStatus === 'accepted') {
        const senderUserSnap = await db.collection('users').doc(signalData.senderId).get();
        if (senderUserSnap.exists()) {
          const senderData = senderUserSnap.data() as User;
          const recipientNameForNotification = recipientProfile?.displayName || 'Someone';

          if (senderData.expoPushToken) {
            const notification: ExpoNotification = {
              to: senderData.expoPushToken,
              title: 'Signal Accepted!',
              body: `${recipientNameForNotification} has accepted your Bat Signal!`,
              sound: 'default',
              data: {
                screenIdentifier: 'SignalAcceptedNotification',
                signalId: signalId,
                recipientId: recipientId,
                recipientName: recipientNameForNotification,
              },
            };
            await sendExpoNotifications([notification]);
          }
        } else {
          console.warn(`Sender (ID: ${signalData.senderId}) profile not found for notification.`);
        }
      }

      return { success: true, acceptanceId: acceptanceId, status: recipientStatus };

    } catch (error: any) {
      console.error('Error responding to Bat Signal:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', 'An unexpected error occurred.', error.message);
    }
  });
