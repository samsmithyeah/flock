// functions/src/notifications/notifyUsersOnNewGroupMessage.ts

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import moment from 'moment';

/**
 * Notify users when a new message is posted in a Crew Date Chat
 */
export const notifyUsersOnNewGroupMessage = onDocumentCreated(
  'crew_date_chats/{chatId}/messages/{messageId}',
  async (event) => {
    const db = admin.firestore();

    // Ensure event data exists
    if (!event.data) {
      console.log('Event data is undefined.');
      return null;
    }

    const { chatId } = event.params;
    const messageData = event.data.data();

    // Destructure necessary fields from message data
    const { senderId, text } = messageData;

    if (!senderId || !text) {
      console.log('Missing senderId or text in message data.');
      return null;
    }

    try {
      // Fetch the sender's user document to get their name
      const senderDoc = await db.collection('users').doc(senderId).get();

      if (!senderDoc.exists) {
        console.log(`Sender user ${senderId} does not exist.`);
        return null;
      }

      const senderData = senderDoc.data();
      const senderName = senderData?.displayName || 'Someone';

      // Fetch the crew document to get the crew name
      const crewId = chatId.split('_')[0];
      const crewDoc = await db.collection('crews').doc(crewId).get();

      if (!crewDoc.exists) {
        console.log(`Crew ${crewId} does not exist.`);
        return null;
      }

      const crewData = crewDoc.data();
      const crewName = crewData?.name || 'Your Crew';

      // Get formatted date for the chat name
      const date = chatId.split('_')[1];
      const formattedDate = moment(date).format('MMM Do');
      const chatName = `${crewName} - ${formattedDate}`;

      // Fetch the chat document to get member IDs and crew details
      const chatDoc = await db.collection('crew_date_chats').doc(chatId).get();

      if (!chatDoc.exists) {
        console.log(`Chat ${chatId} does not exist.`);
        return null;
      }

      const chatData = chatDoc.data();

      if (!chatData) {
        console.log(`Chat data for ${chatId} is undefined.`);
        return null;
      }

      const memberIds = chatData.memberIds || [];

      // Exclude the sender from the list of recipients
      const recipientIds = memberIds.filter((id: string) => id !== senderId);

      if (recipientIds.length === 0) {
        console.log('No recipients found for the group message.');
        return null;
      }

      // Firestore 'in' queries are limited to 10
      const batchSize = 10;
      const chunks = [];

      for (let i = 0; i < recipientIds.length; i += batchSize) {
        chunks.push(recipientIds.slice(i, i + batchSize));
      }

      const recipientDocs: FirebaseFirestore.DocumentData[] = [];

      // Fetch all recipient user documents in batches
      for (const chunk of chunks) {
        const q = db.collection('users').where('uid', 'in', chunk);
        const snapshot = await q.get();
        snapshot.forEach((doc) => {
          recipientDocs.push(doc);
        });
      }

      if (recipientDocs.length === 0) {
        console.log('No valid recipient user documents found.');
        return null;
      }

      // Prepare an array to hold all notification messages
      const notifications: ExpoPushMessage[] = [];

      // Process each recipient individually
      await Promise.all(
        recipientDocs.map(async (doc) => {
          const recipientData = doc.data();
          const recipientId = doc.id;

          if (!recipientData) {
            console.log(`Recipient data for user ${recipientId} is undefined.`);
            return;
          }

          const activeChats = recipientData.activeChats || [];

          // Check if the recipient has the chat open
          if (activeChats.includes(chatId)) {
            console.log(`Recipient ${recipientId} is actively viewing the chat. No notification sent.`);
            return;
          }

          const recipientRef = db.collection('users').doc(recipientId);

          // Initialize variable to hold the new badge count
          let newBadgeCount = 0;

          try {
            // Run a transaction to conditionally increment badgeCount
            newBadgeCount = await db.runTransaction(async (transaction) => {
              const recipientDoc = await transaction.get(recipientRef);

              if (!recipientDoc.exists) {
                throw new Error(`Recipient user ${recipientId} does not exist.`);
              }

              const recipientData = recipientDoc.data();

              if (!recipientData) {
                throw new Error(`Recipient data for user ${recipientId} is undefined.`);
              }

              // Check if the recipient is actively viewing the chat
              const activeChats = recipientData.activeChats || [];
              if (activeChats.includes(chatId)) {
                console.log(`Recipient ${recipientId} is actively viewing the chat during transaction. No badge increment.`);
                return 0; // Do not increment badgeCount
              }

              // Get current badge count, default to 0 if undefined
              const currentBadge = typeof recipientData.badgeCount === 'number' ? recipientData.badgeCount : 0;
              const updatedBadge = currentBadge + 1;

              // Update the badgeCount atomically
              transaction.update(recipientRef, { badgeCount: updatedBadge });

              return updatedBadge;
            });
          } catch (error) {
            console.error(`Transaction failed for recipient ${recipientId}:`, error);
            return;
          }

          // If badgeCount was incremented, prepare the notification
          if (newBadgeCount !== 0) {
            // Collect all valid Expo push tokens for the recipient
            const expoPushTokens = [];

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
              return;
            }

            // Prepare notification payload with the incremented badge count
            const messages = expoPushTokens.map((pushToken) => ({
              to: pushToken,
              sound: 'default' as const,
              title: chatName,
              body: `${senderName}: ${text}`,
              data: {
                screen: 'CrewDateChat',
                chatId,
                senderId,
                senderName: senderName,
                messageText: text,
              },
              badge: newBadgeCount, // Use the incremented badge count here
            }));

            // Add the messages to the notifications array
            notifications.push(...messages);
          } else {
            console.log(`No badge count incremented for recipient ${recipientId}. They are actively viewing the chat.`);
          }
        })
      );

      if (notifications.length === 0) {
        console.log('No notifications to send.');
        return null;
      }

      // Send the notifications using the sendExpoNotifications utility
      await sendExpoNotifications(notifications);

      console.log(`Sent group message notifications for chat ${chatId} to ${recipientIds.length} users: ${recipientIds.join(', ')}`);
      return null;
    } catch (error) {
      console.error('Error processing group message notification:', error);
      return null;
    }
  }
);
