import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { shouldSendNotification } from '../utils/notificationSettings';

// Notify crew members when the crew is deleted
export const notifyCrewMembersOnCrewDeletion = onDocumentDeleted(
  'crews/{crewId}',
  async (event) => {
    if (!event.data) {
      console.log('Event data is undefined.');
      return null;
    }

    const crewId = event.params.crewId;
    const deletedCrewData = event.data.data();

    if (!deletedCrewData) {
      console.log(`No data found for deleted crew with ID: ${crewId}`);
      return null;
    }

    const { memberIds, name: crewName, ownerId } = deletedCrewData;

    // Get the display name of the user who deleted the crew
    const deleterRef = admin.firestore().collection('users').doc(ownerId);
    const deleterDoc = await deleterRef.get();

    if (!deleterDoc.exists) {
      console.log(`Deleting user ${ownerId} does not exist.`);
      return null;
    }

    const deleterData = deleterDoc.data();
    const deleterUserName = deleterData?.displayName || 'A member';

    // Filter out the deleter from the list of members
    const memberIdsToNotify = memberIds.filter((id: string) => id !== ownerId);

    if (memberIdsToNotify.length === 0) {
      console.log('No other members to notify for deleted crew.');
      return null;
    }

    const expoPushTokens: string[] = [];

    // Firestore 'in' queries support up to 10 elements per query
    const batchSize = 10;
    for (let i = 0; i < memberIdsToNotify.length; i += batchSize) {
      const batch = memberIdsToNotify.slice(i, i + batchSize);
      const usersSnapshot = await admin
        .firestore()
        .collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', batch)
        .get();

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();

        // Check notification preferences
        if (!shouldSendNotification(userData.notificationSettings, 'crew_disbanded')) {
          console.log(`User ${doc.id} has disabled crew_disbanded notifications. Skipping.`);
          return;
        }

        const token = userData?.expoPushToken;
        const tokensArray = userData?.expoPushTokens;

        if (token && Expo.isExpoPushToken(token)) {
          expoPushTokens.push(token);
        }

        if (tokensArray && Array.isArray(tokensArray)) {
          tokensArray.forEach((tok: string) => {
            if (Expo.isExpoPushToken(tok)) {
              expoPushTokens.push(tok);
            }
          });
        }
      });
    }

    if (expoPushTokens.length === 0) {
      console.log('No valid Expo push tokens found for crew members.');
      return null;
    }

    // Prepare individual messages for each member
    const individualMessages: ExpoPushMessage[] = expoPushTokens.map((pushToken) => ({
      to: pushToken,
      sound: 'default',
      title: crewName,
      body: `${deleterUserName} has deleted the crew.`,
      data: { crewId, screen: 'Home' },
    }));

    // Send the notifications
    await sendExpoNotifications(individualMessages);

    console.log(`Sent deletion notifications to members of crew: ${crewId}`);

    return null;
  }
);
