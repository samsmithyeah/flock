// functions/src/notifications/notifyUserOnNewDMMessage.ts

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';

/**
 * Notify user when they receive a new Direct Message (DM)
 */
export const notifyUserOnNewDMMessage = onDocumentCreated(
  'direct_messages/{dmId}/messages/{messageId}',
  async (event) => {
    const db = admin.firestore();

    // Ensure event data exists
    if (!event.data) {
      console.log('Event data is undefined.');
      return null;
    }

    const { dmId } = event.params;
    const messageData = event.data.data();

    // Destructure necessary fields from message data
    const { senderId, text, imageUrl } = messageData;

    // Skip notification if there's no content to notify about
    if (!senderId || (!text && !imageUrl)) {
      console.log('Missing senderId or both text and imageUrl in message data.');
      return null;
    }

    // Fetch the sender's user document to get their name
    const senderDoc = await db.collection('users').doc(senderId).get();

    if (!senderDoc.exists) {
      console.log(`Sender user ${senderId} does not exist.`);
      return null;
    }

    const senderData = senderDoc.data();
    const senderName = senderData?.displayName || 'Someone';

    // Assuming dmId is in the format 'user1_user2'
    const participantIds = dmId.split('_');
    const recipientId = participantIds.find((id) => id !== senderId);

    if (!recipientId) {
      console.log('Recipient ID not found.');
      return null;
    }

    // Reference to the recipient's user document
    const recipientRef = db.collection('users').doc(recipientId);

    // Initialize variable to hold the new badge count
    let newBadgeCount: number | null = null;

    try {
      // Run a transaction to check activeChats and increment badgeCount if necessary
      newBadgeCount = await db.runTransaction(async (transaction) => {
        const recipientDoc = await transaction.get(recipientRef);

        if (!recipientDoc.exists) {
          throw new Error(`Recipient user ${recipientId} does not exist.`);
        }

        const recipientData = recipientDoc.data();

        if (!recipientData) {
          throw new Error(`Recipient data for user ${recipientId} is undefined.`);
        }

        const activeChats: string[] = recipientData.activeChats || [];
        const isOnline = recipientData.isOnline === true;

        // Check if the recipient is actively viewing the DM chat AND is online
        if (activeChats.includes(dmId) && isOnline) {
          console.log('Recipient is actively viewing the DM chat and is online. No badge increment.');
          return null; // Do not increment badgeCount
        }

        // Get current badge count, default to 0 if undefined
        const currentBadge = typeof recipientData.badgeCount === 'number' ? recipientData.badgeCount : 0;
        const updatedBadge = currentBadge + 1;

        // Update the badgeCount atomically
        transaction.update(recipientRef, { badgeCount: updatedBadge });

        return updatedBadge;
      });
    } catch (error) {
      console.error('Transaction failed:', error);
      return null;
    }

    // If badgeCount was incremented, proceed to send notification
    if (newBadgeCount !== null) {
      // Fetch the updated recipient data
      const recipientDoc = await recipientRef.get();
      const recipientData = recipientDoc.data();

      if (!recipientData) {
        console.log(`Recipient data for user ${recipientId} is undefined after transaction.`);
        return null;
      }

      // Collect all valid Expo push tokens for the recipient
      const expoPushTokens: string[] = [];

      if (recipientData.expoPushToken && Expo.isExpoPushToken(recipientData.expoPushToken)) {
        expoPushTokens.push(recipientData.expoPushToken);
      }

      if (recipientData.expoPushTokens && Array.isArray(recipientData.expoPushTokens)) {
        recipientData.expoPushTokens.forEach((token: string) => {
          if (Expo.isExpoPushToken(token)) {
            expoPushTokens.push(token);
          }
        });
      }

      if (expoPushTokens.length === 0) {
        console.log(`No valid Expo push tokens found for user ${recipientId}.`);
        return null;
      }

      // Determine notification body text based on content
      let notificationBody = '';
      if (text) {
        notificationBody = text;
      } else if (imageUrl) {
        notificationBody = 'Sent you an image';
      }

      // Prepare notification payload with the incremented badge count
      const messages: ExpoPushMessage[] = expoPushTokens.map((pushToken) => ({
        to: pushToken,
        sound: 'default',
        title: senderName,
        body: notificationBody,
        data: {
          screen: 'DMChat',
          dmId,
          senderId,
          senderName: senderName,
          messageText: text || '',
          imageUrl: imageUrl || null,
          hasImage: !!imageUrl,
        },
        badge: newBadgeCount ?? 0,
        // Enable notification content extension for iOS image display
        mutableContent: !!imageUrl,
      }));

      try {
        // Send the notifications using the sendExpoNotifications utility
        await sendExpoNotifications(messages);
        console.log(`Sent DM notification to user ${recipientId} with badge count ${newBadgeCount}.`);
      } catch (error) {
        console.error('Failed to send notifications:', error);
      }
    } else {
      // Optionally, handle cases where the user is actively viewing the chat
      console.log('No badge count incremented. User is actively viewing the chat.');
    }

    return null;
  }
);
