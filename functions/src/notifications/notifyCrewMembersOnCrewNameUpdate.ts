import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { shouldSendNotification } from '../utils/notificationSettings';

export const notifyCrewMembersOnCrewNameUpdate = onDocumentUpdated(
  'crews/{crewId}',
  async (event) => {
    if (!event.data) {
      console.log('Event data is undefined.');
      return null;
    }
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const crewId = event.params.crewId;

    // Check if the crew name was updated
    const oldName = beforeData?.name;
    const newName = afterData?.name;
    if (oldName === newName) {
      console.log('Crew name has not been updated.');
      return null;
    }

    // Retrieve the updater's UID (assumed to be provided in the update as updatedBy)
    const updaterId = afterData.updatedBy;
    let updaterDisplayName = 'Someone';
    if (updaterId) {
      try {
        const updaterDoc = await admin
          .firestore()
          .collection('users')
          .doc(updaterId)
          .get();
        if (updaterDoc.exists) {
          updaterDisplayName =
            (updaterDoc.data() as { displayName?: string }).displayName ||
            updaterDisplayName;
        }
      } catch (error) {
        console.error('Error fetching updater info:', error);
      }
    }

    // Exclude the updater from the list of crew members to notify
    const memberIds: string[] = afterData?.memberIds || [];
    const memberIdsToNotify = updaterId ? memberIds.filter((id) => id !== updaterId) : memberIds;

    if (memberIdsToNotify.length === 0) {
      console.log('No crew members to notify after excluding the updater.');
      return null;
    }

    // Fetch Expo push tokens for the crew members to notify
    const expoPushTokens: string[] = [];
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
        if (!shouldSendNotification(userData.notificationSettings, 'crew_updated')) {
          console.log(`User ${doc.id} has disabled crew_updated notifications. Skipping.`);
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

    // Create notification messages including old and new crew names
    const messages: ExpoPushMessage[] = expoPushTokens.map((pushToken) => ({
      to: pushToken,
      sound: 'default',
      title: newName || 'Your crew',
      body: `${updaterDisplayName} changed the crew name from "${oldName}" to "${newName}"`,
      data: { crewId, screen: 'Crew' },
    }));

    await sendExpoNotifications(messages);
    console.log(
      `Sent crew name update notifications to members of crew ${crewId}, excluding updater ${updaterId}.`
    );
    return null;
  }
);
