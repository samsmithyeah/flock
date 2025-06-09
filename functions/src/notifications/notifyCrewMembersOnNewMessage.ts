import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { shouldSendNotification } from '../utils/notificationSettings';

/**
 * Notify crew members when a new message is posted in a Crew Chat
 */
export const notifyCrewMembersOnNewMessage = onDocumentCreated(
  'crews/{crewId}/messages/{messageId}',
  async (event) => {
    const db = admin.firestore();

    // Ensure event data exists
    if (!event.data) {
      console.log('Event data is undefined.');
      return null;
    }

    const { crewId } = event.params;
    const messageData = event.data.data();

    // Destructure necessary fields from message data
    const { senderId, text, imageUrl, poll } = messageData;

    // Skip notification if there's no content to notify about
    if (!senderId || (!text && !imageUrl && !poll)) {
      console.log('Missing senderId or content (text, image, or poll) in message data.');
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

      // Fetch the crew document to get the crew name and members
      const crewDoc = await db.collection('crews').doc(crewId).get();

      if (!crewDoc.exists) {
        console.log(`Crew ${crewId} does not exist.`);
        return null;
      }

      const crewData = crewDoc.data();
      const crewName = crewData?.name || 'Your Crew';
      const memberIds = crewData?.memberIds || [];

      // Exclude the sender from the list of recipients
      const recipientIds = memberIds.filter((id: string) => id !== senderId);

      if (recipientIds.length === 0) {
        console.log('No recipients found for the crew message.');
        return null;
      }

      // Firestore 'in' queries are limited to 10
      const batchSize = 10;
      const chunks = [];

      for (let i = 0; i < recipientIds.length; i += batchSize) {
        chunks.push(recipientIds.slice(i, i + batchSize));
      }

      const recipientDocs: admin.firestore.DocumentSnapshot<admin.firestore.DocumentData>[] = [];

      // Fetch all recipient user documents in batches
      for (const chunk of chunks) {
        const q = db.collection('users').where('uid', 'in', chunk);
        const snapshot = await q.get();
        snapshot.forEach((doc) => {
          recipientDocs.push(doc);
        });
      }

      if (recipientDocs.length === 0) {
        console.log('No recipient user documents found.');
        return null;
      }

      // Fetch the chat metadata to check lastRead timestamps
      const chatMetadataRef = db.collection('crews').doc(crewId).collection('messages').doc('metadata');
      const chatMetadataSnap = await chatMetadataRef.get();

      const lastReadTimestamps = chatMetadataSnap.exists ?
        chatMetadataSnap.data()?.lastRead || {} :
        {};

      // Current timestamp for comparison
      const currentTimestamp = admin.firestore.Timestamp.now();
      const messageTimestamp = messageData.createdAt || currentTimestamp;

      // Prepare notifications
      const notifications: ExpoPushMessage[] = [];

      for (const doc of recipientDocs) {
        const userData = doc.data();
        if (!userData) continue; // Skip if no user data

        const userId = doc.id;
        console.log(`Processing potential notification for user ${userId}`);

        // Skip if user doesn't have a pushToken
        if (!userData.expoPushToken) {
          console.log(`User ${userId} does not have a pushToken. Skipping notification.`);
          continue;
        }

        // Check notification preferences
        if (!shouldSendNotification(userData.notificationSettings, 'crew_chat_message')) {
          console.log(`User ${userId} has disabled crew_chat_message notifications. Skipping.`);
          continue;
        }

        // Skip if the user has read the chat after this message was sent
        // or if they are currently viewing this chat (based on activeChats) AND are online
        const lastReadTimestamp = lastReadTimestamps[userId];
        const isActiveChat = userData.activeChats &&
                            Array.isArray(userData.activeChats) &&
                            userData.activeChats.includes(crewId);
        const isOnline = userData.isOnline === true;

        if (lastReadTimestamp && lastReadTimestamp.toMillis() > messageTimestamp.toMillis()) {
          continue;
        }

        // Only skip if user is both actively viewing the chat AND online
        if (isActiveChat && isOnline) {
          console.log(`User ${userId} is actively viewing the chat and is online. No notification sent.`);
          continue;
        }

        // Create notification content
        let notificationBody;

        if (imageUrl) {
          notificationBody = `${senderName} sent an image`;
        } else if (poll) {
          notificationBody = `${senderName} created a poll: ${poll.question}`;
        } else {
          notificationBody = `${senderName}: ${text}`;
        }

        notifications.push({
          to: userData.expoPushToken,
          sound: 'default',
          title: crewName,
          body: notificationBody,
          data: {
            screen: 'CrewChat',
            crewId,
            senderId,
          },
        });
      }

      // Send notifications
      if (notifications.length > 0) {
        await sendExpoNotifications(notifications);
        console.log(`Sent ${notifications.length} crew chat notifications for message in crew ${crewId}`);
      } else {
        console.log('No notifications to send.');
      }

      return null;
    } catch (error) {
      console.error('Error sending crew chat notifications:', error);
      return null;
    }
  }
);
