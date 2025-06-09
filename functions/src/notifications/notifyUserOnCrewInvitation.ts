// functions/src/notifications/notifyUserOnCrewInvitation.ts

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { shouldSendNotification } from '../utils/notificationSettings';

/**
 * Notify user when invited to a crew
 */
export const notifyUserOnCrewInvitation = onDocumentCreated(
  'invitations/{invitationId}',
  async (event) => {
    const db = admin.firestore();

    // Ensure event data exists
    if (!event.data) {
      console.log('Event data is undefined.');
      return null;
    }

    const invitationData = event.data.data();

    // Destructure necessary fields from invitation data
    const { crewId, toUserId, fromUserId, status } = invitationData;

    // Only send notifications for pending invitations
    if (status !== 'pending') {
      return null;
    }

    // Reference to the invited user's document
    const invitedUserRef = db.collection('users').doc(toUserId);

    // Initialize variable to hold the new badge count
    let newBadgeCount: number | null = null;

    try {
      // Run a transaction to increment badgeCount
      newBadgeCount = await db.runTransaction(async (transaction) => {
        const invitedUserDoc = await transaction.get(invitedUserRef);

        if (!invitedUserDoc.exists) {
          throw new Error(`Invited user ${toUserId} does not exist.`);
        }

        const invitedUserData = invitedUserDoc.data();

        if (!invitedUserData) {
          throw new Error(`Invited user data for ${toUserId} is undefined.`);
        }

        // Get current badge count, default to 0 if undefined
        const currentBadge = typeof invitedUserData.badgeCount === 'number' ? invitedUserData.badgeCount : 0;
        const updatedBadge = currentBadge + 1;

        // Update the badgeCount atomically
        transaction.update(invitedUserRef, { badgeCount: updatedBadge });

        return updatedBadge;
      });
    } catch (error) {
      console.error('Transaction failed:', error);
      return null;
    }

    // Proceed to send notification if badgeCount was incremented
    if (newBadgeCount !== null) {
      // Fetch the updated invited user data
      const invitedUserDoc = await invitedUserRef.get();
      const invitedUserData = invitedUserDoc.data();

      if (!invitedUserData) {
        console.log(`Invited user data for ${toUserId} is undefined after transaction.`);
        return null;
      }

      // Check if user wants to receive crew invitation notifications
      if (!shouldSendNotification(invitedUserData.notificationSettings, 'crew_invitation')) {
        console.log(`User ${toUserId} has disabled crew invitation notifications. Skipping notification.`);
        return null;
      }

      // Collect all valid Expo push tokens for the invited user
      const expoPushTokens: string[] = [];

      if (invitedUserData.expoPushToken && Expo.isExpoPushToken(invitedUserData.expoPushToken)) {
        expoPushTokens.push(invitedUserData.expoPushToken);
      }

      if (invitedUserData.expoPushTokens && Array.isArray(invitedUserData.expoPushTokens)) {
        invitedUserData.expoPushTokens.forEach((token: string) => {
          if (Expo.isExpoPushToken(token)) {
            expoPushTokens.push(token);
          }
        });
      }

      if (expoPushTokens.length === 0) {
        console.log(`No valid Expo push tokens found for user ${toUserId}.`);
        return null;
      }

      // Fetch the crew's data to get the crew name
      const crewRef = db.collection('crews').doc(crewId);
      const crewDoc = await crewRef.get();

      if (!crewDoc.exists) {
        console.log(`Crew ${crewId} does not exist.`);
        return null;
      }

      const crewData = crewDoc.data();
      if (!crewData || !crewData.name || !crewData.memberIds) {
        console.log(`Crew ${crewId} is missing required data.`);
        return null;
      }
      const crewName = crewData.name;

      // Fetch the inviter's data to get their display name
      const inviterUserRef = db.collection('users').doc(fromUserId);
      const inviterUserDoc = await inviterUserRef.get();

      if (!inviterUserDoc.exists) {
        console.log(`Inviter user ${fromUserId} does not exist.`);
        return null;
      }

      const inviterUserData = inviterUserDoc.data() as { displayName: string };
      const inviterUserName = inviterUserData.displayName || 'Someone';

      const messageBody = `${inviterUserName} has invited you to join their crew!`;

      // Prepare notification payload with the updated badge count
      const messages: ExpoPushMessage[] = expoPushTokens.map((pushToken) => ({
        to: pushToken,
        sound: 'default',
        title: `Invitation to join ${crewName}`,
        body: messageBody,
        data: {
          crewId,
          fromUserId,
          toUserId,
          screen: 'Invitations',
        },
        badge: newBadgeCount ?? 0,
      }));

      try {
        // Send the notifications using the sendExpoNotifications utility
        await sendExpoNotifications(messages);
        console.log(`Sent crew invitation notification to user ${toUserId} with badge count ${newBadgeCount}.`);
      } catch (error) {
        console.error('Failed to send notifications:', error);
      }
    } else {
      // This block won't execute since we're incrementing unconditionally
      console.log('No badge count incremented.');
    }

    return null;
  }
);
