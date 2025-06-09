// functions/src/notifications/notifyCrewMembersOnNewJoin.ts

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { shouldSendNotification } from '../utils/notificationSettings';

// Notify crew members when a new user joins the crew
export const notifyCrewMembersOnNewJoin = onDocumentUpdated(
  'crews/{crewId}',
  async (event) => {
    if (!event.data) {
      console.log('Event data is undefined.');
      return null;
    }
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    const crewId = event.params.crewId;

    const beforeMemberIds: string[] = beforeData?.memberIds || [];
    const afterMemberIds: string[] = afterData?.memberIds || [];

    // Determine newly added members
    const newMemberIds = afterMemberIds.filter((id) => !beforeMemberIds.includes(id));

    if (newMemberIds.length === 0) {
      // No new members added
      return null;
    }

    // Fetch the crew's name
    const crewName = afterData.name;

    // Fetch new members' display names
    const newMembersPromises = newMemberIds.map(async (userId) => {
      const userRef = admin.firestore().collection('users').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        console.log(`User ${userId} does not exist.`);
        return { userId, displayName: 'A new member' };
      }

      const userData = userDoc.data() as { displayName: string };
      return { userId, displayName: userData.displayName };
    });

    const newMembers = await Promise.all(newMembersPromises);

    // Fetch existing members' Expo push tokens (excluding new members)
    const existingMemberIds = beforeMemberIds; // Before the update

    if (existingMemberIds.length === 0) {
      console.log('No existing members to notify.');
      return null;
    }

    const expoPushTokens: string[] = [];

    // Firestore 'in' queries support up to 10 elements per query
    const batchSize = 10;
    for (let i = 0; i < existingMemberIds.length; i += batchSize) {
      const batch = existingMemberIds.slice(i, i + batchSize);
      const usersSnapshot = await admin
        .firestore()
        .collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', batch)
        .get();

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();

        // Check if user wants to receive crew member notifications
        if (!shouldSendNotification(userData?.notificationSettings, 'crew_member_joined')) {
          console.log(`User ${doc.id} has disabled crew member notifications. Skipping.`);
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
      console.log('No valid Expo push tokens found for existing members.');
      return null;
    }

    // Since 'to' expects a single token per message, we'll need to send individual messages
    const individualMessages: ExpoPushMessage[] = [];

    expoPushTokens.forEach((pushToken) => {
      newMembers.forEach(({ userId, displayName }) => {
        individualMessages.push({
          to: pushToken,
          sound: 'default',
          title: crewName,
          body: `${displayName} has joined the crew!`,
          data: { crewId, newMemberId: userId, screen: 'Crew' },
        });
      });
    });

    // Send the notifications
    await sendExpoNotifications(individualMessages);

    console.log(`Sent notifications to existing members about new members: ${newMemberIds.join(', ')}`);

    return null;
  }
);
