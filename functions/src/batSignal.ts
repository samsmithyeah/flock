import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GeoPoint, Timestamp } from 'firebase-admin/firestore'; // Correct import for admin SDK
import { BatSignal } from '../../types/BatSignal'; // Adjust path as per your project structure
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
    const { senderLocation, radiusMetres, targetAudienceType, targetIds, message } = data;
    if (!senderLocation || typeof radiusMetres !== 'number' || radiusMetres <= 0 || !targetAudienceType) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid parameters.');
    }
    if (targetAudienceType === 'crews' || targetAudienceType === 'contacts') {
      if (!Array.isArray(targetIds) || targetIds.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', `Target IDs must be provided for ${targetAudienceType}.`);
      }
    }

    const db = admin.firestore();
    let potentialRecipientIds: string[] = [];

    // 3. Fetch Potential Recipients
    try {
      if (targetAudienceType === 'all') {
        // This part needs to be robust. Assuming getMatchedUsersFromContacts returns UIDs.
        // If it requires more complex logic (e.g., from user's 'hashedContacts/matches'), adapt here.
        // For this example, let's assume a simplified way to get contacts or friends.
        // const matchedUsers = await getMatchedUsersFromContacts(senderId); // This function might need to be adapted or use its core logic
        // potentialRecipientIds = matchedUsers.map(u => u.uid);

        // Simplified: Fetch all users for now, EXCLUDING sender. In a real app, this would be contacts/friends.
        // This is a placeholder for actual contact/match fetching logic.
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

    // Remove sender from potential recipients
    potentialRecipientIds = potentialRecipientIds.filter(uid => uid !== senderId);
    if (potentialRecipientIds.length === 0) {
      return { success: true, signalId: null, message: "No potential recipients found." };
    }

    // 4. Fetch Last Known Locations & Filter by Stale Locations
    const validRecipientProfiles: Array<{ uid: string, location: GeoPoint, pushToken?: string, name?: string, profilePictureUrl?: string }> = [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Firestore IN queries are limited to 30 items in the array. Batch if necessary.
    // For simplicity, assuming potentialRecipientIds will be < 30. Handle batching if this list can be large.
    if (potentialRecipientIds.length > 0) {
         const userChunks = [];
         for (let i = 0; i < potentialRecipientIds.length; i += 30) {
             userChunks.push(potentialRecipientIds.slice(i, i + 30));
         }

         for (const chunk of userChunks) {
             if (chunk.length === 0) continue;
             const usersSnap = await db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
             usersSnap.forEach(doc => {
                 const userData = doc.data() as User;
                 if (userData.lastKnownLocation && userData.lastKnownLocationTimestamp &&
                     userData.lastKnownLocationTimestamp.toDate() > oneHourAgo) {
                     validRecipientProfiles.push({
                         uid: doc.id,
                         location: userData.lastKnownLocation,
                         pushToken: userData.expoPushToken, // Assuming field name is expoPushToken
                         name: userData.displayName,
                         profilePictureUrl: userData.profilePictureUrl
                     });
                 }
             });
         }
     }


    // 5. Radius Filtering
    const senderGeoPoint = new GeoPoint(senderLocation.latitude, senderLocation.longitude);
    const nearbyRecipientProfiles = validRecipientProfiles.filter(profile => {
      const distance = getDistanceInMetres(senderGeoPoint, profile.location);
      return distance <= radiusMetres;
    });

    if (nearbyRecipientProfiles.length === 0) {
      return { success: true, signalId: null, message: "No recipients found within the specified radius or with recent location." };
    }

    const notifiedRecipientIds = nearbyRecipientProfiles.map(p => p.uid);

    // 6. Create BatSignal Document
    const signalId = db.collection('batSignals').doc().id;
    const createdAt = Timestamp.now();
    const expiresAt = Timestamp.fromDate(new Date(createdAt.toMillis() + 2 * 60 * 60 * 1000)); // E.g., 2 hours expiry

    const senderProfileSnap = await db.collection('users').doc(senderId).get();
    const senderProfile = senderProfileSnap.data() as User | undefined;

    const newSignal: BatSignal = {
      id: signalId,
      senderId: senderId,
      senderName: senderProfile?.displayName || 'A user',
      senderProfilePictureUrl: senderProfile?.profilePictureUrl,
      location: senderGeoPoint,
      radiusMetres: radiusMetres,
      // message: message || null, // Phase 2
      status: 'active',
      createdAt: createdAt,
      expiresAt: expiresAt,
      notifiedRecipientIds: notifiedRecipientIds,
    };
    await db.collection('batSignals').doc(signalId).set(newSignal);

    // 7. Fetch Recipient Push Tokens (already fetched in step 4, ensure they are present) & Send Notifications
    const notifications: ExpoNotification[] = nearbyRecipientProfiles
      .filter(p => p.pushToken)
      .map(profile => ({
        to: profile.pushToken!,
        title: 'Bat Signal Received!',
        body: `${newSignal.senderName} is sending a Bat Signal near you!`,
        sound: 'default',
        data: {
          screenIdentifier: 'BatSignalResponse', // For client-side routing
          signalId: signalId,
          senderId: senderId, // To identify who sent it
          // Potentially add senderName if not fetching signalDoc on response screen initially
        },
      }));

    if (notifications.length > 0) {
      await sendExpoNotifications(notifications);
    }

    // 8. Return
    return { success: true, signalId: signalId, notifiedCount: notifications.length };
  });

export const respondToBatSignal = functions
  .region('europe-west1') // Specify your region
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    // 1. Authentication Check
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const recipientId = context.auth.uid;

    // 2. Input Validation
    const { signalId, recipientStatus } = data;
    if (!signalId || !recipientStatus || (recipientStatus !== 'accepted' && recipientStatus !== 'declined')) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid parameters (signalId, recipientStatus).');
    }

    const db = admin.firestore();

    try {
      // 3. Fetch BatSignal Document
      const signalRef = db.collection('batSignals').doc(signalId);
      const signalSnap = await signalRef.get();

      if (!signalSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Bat Signal not found.');
      }
      const signalData = signalSnap.data() as BatSignal;

      if (signalData.status !== 'active') {
        throw new functions.https.HttpsError('failed-precondition', `Bat Signal is no longer active (status: ${signalData.status}).`);
      }
       // Check if signal has expired
      if (signalData.expiresAt && signalData.expiresAt.toDate() < new Date()) {
        // Optionally update signal status to 'expired' here if not already handled by a scheduled function
        await signalRef.update({ status: 'expired' });
        throw new functions.https.HttpsError('failed-precondition', 'Bat Signal has expired.');
      }


      // 4. Construct BatSignalAcceptance Document ID and Ref
      const acceptanceId = `${signalId}_${recipientId}`;
      const acceptanceRef = db.collection('batSignalAcceptances').doc(acceptanceId);

      // 5. Update/Create BatSignalAcceptance Document
      const acceptanceUpdateData: Partial<BatSignalAcceptance> = {
        signalId: signalId,
        recipientId: recipientId,
        senderId: signalData.senderId, // Store senderId for easier querying
        status: recipientStatus,
      };

      if (recipientStatus === 'accepted') {
        acceptanceUpdateData.acceptedAt = admin.firestore.FieldValue.serverTimestamp() as Timestamp;
        // Clear declinedAt if it was previously set
        acceptanceUpdateData.declinedAt = admin.firestore.FieldValue.delete() as unknown as Timestamp;
      } else { // declined
        acceptanceUpdateData.declinedAt = admin.firestore.FieldValue.serverTimestamp() as Timestamp;
        // Clear acceptedAt if it was previously set
        acceptanceUpdateData.acceptedAt = admin.firestore.FieldValue.delete() as unknown as Timestamp;
        // If declining, also clear any consent fields
        acceptanceUpdateData.recipientConsentedShare = admin.firestore.FieldValue.delete() as unknown as Timestamp;
        acceptanceUpdateData.sharingExpiresAt = admin.firestore.FieldValue.delete() as unknown as Timestamp;
      }

      await acceptanceRef.set(acceptanceUpdateData, { merge: true });

      // 6. If 'accepted', Notify Sender
      if (recipientStatus === 'accepted') {
        const senderUserRef = db.collection('users').doc(signalData.senderId);
        const recipientUserRef = db.collection('users').doc(recipientId);

        const [senderUserSnap, recipientUserSnap] = await Promise.all([senderUserRef.get(), recipientUserRef.get()]);

        if (senderUserSnap.exists() && recipientUserSnap.exists()) {
          const senderData = senderUserSnap.data() as User;
          const recipientData = recipientUserSnap.data() as User;
          const recipientName = recipientData.displayName || 'Someone';

          if (senderData.expoPushToken) {
            const notification: ExpoNotification = {
              to: senderData.expoPushToken,
              title: 'Signal Accepted!',
              body: `${recipientName} has accepted your Bat Signal!`,
              sound: 'default',
              data: {
                screenIdentifier: 'SignalAcceptedNotification', // For client-side routing on sender's app
                signalId: signalId,
                recipientId: recipientId,
                recipientName: recipientName,
                // Potentially also send acceptanceId if useful: acceptanceId
              },
            };
            await sendExpoNotifications([notification]);
          }
        } else {
          console.warn(`Sender (ID: ${signalData.senderId}) or Recipient (ID: ${recipientId}) profile not found for notification.`);
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
