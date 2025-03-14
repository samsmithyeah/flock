import * as functions from 'firebase-functions/v2';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';

interface RemindPollData {
  pollId: string;
  userId: string;
}

interface RemindPollResponse {
  success: boolean;
  message: string;
}

// Add this interface to properly type poll options
interface PollOption {
  date: string;
  responses?: Record<string, string>;
}

export const notifyNonRespondingPollMembers = functions.https.onCall(
  async (request: CallableRequest<RemindPollData>): Promise<RemindPollResponse> => {
    const data = request.data;
    const context = request.auth;

    if (!context || !context.uid) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const { pollId, userId } = data;

    if (!pollId || !userId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'The function must be called with pollId and userId.'
      );
    }

    const db = admin.firestore();

    try {
      // Fetch the Poll Document
      const pollRef = db.collection('event_polls').doc(pollId);
      const pollDoc = await pollRef.get();

      if (!pollDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Poll not found.');
      }

      const pollData = pollDoc.data();
      if (!pollData) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Poll data is incomplete.'
        );
      }

      // Check if the user is the creator of the poll
      if (pollData.createdBy !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only the poll creator can send reminders.'
        );
      }

      // Check if the poll has been finalized
      if (pollData.finalized) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Cannot send reminders for finalized polls.'
        );
      }

      const { crewId, title, options } = pollData;

      // Fetch the Crew Document
      const crewRef = db.collection('crews').doc(crewId);
      const crewDoc = await crewRef.get();

      if (!crewDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Crew not found.');
      }

      const crewData = crewDoc.data();
      if (!crewData || !crewData.memberIds || !crewData.name) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Crew data is incomplete.'
        );
      }

      const { name: crewName, memberIds } = crewData;

      // Find all members who have responded to at least one option
      const respondedMemberIds = new Set<string>();
      options.forEach((option: PollOption) => {
        if (option.responses) {
          Object.keys(option.responses).forEach((memberId) => {
            respondedMemberIds.add(memberId);
          });
        }
      });

      // Find members who haven't responded
      const nonRespondingMemberIds = memberIds.filter(
        (memberId: string) => !respondedMemberIds.has(memberId) && memberId !== userId
      );

      if (nonRespondingMemberIds.length === 0) {
        return {
          success: true,
          message: 'All crew members have already responded to the poll.',
        };
      }

      // Get the sender's name
      const senderDoc = await db.collection('users').doc(userId).get();
      if (!senderDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found.');
      }
      const senderData = senderDoc.data();
      const senderName = senderData?.displayName || 'A crew member';

      // Get push tokens for non-responding members
      const batchSize = 10;
      const expoPushTokens: string[] = [];

      for (let i = 0; i < nonRespondingMemberIds.length; i += batchSize) {
        const batch = nonRespondingMemberIds.slice(i, i + batchSize);
        const usersSnapshot = await db
          .collection('users')
          .where(admin.firestore.FieldPath.documentId(), 'in', batch)
          .get();

        usersSnapshot.docs.forEach((doc) => {
          const userData = doc.data();
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
        return {
          success: false,
          message: 'No valid push tokens found for members who have not responded.',
        };
      }

      // Prepare notification message
      const pollTitle = title || 'an event';
      const messageBody = `${senderName} wants to remind you to respond to the poll for ${pollTitle}!`;

      // Send notifications
      const messages: ExpoPushMessage[] = expoPushTokens.map((pushToken) => ({
        to: pushToken,
        sound: 'default',
        title: `Poll Reminder: ${crewName}`,
        body: messageBody,
        data: {
          pollId,
          crewId,
          screen: 'EventPollRespond',
        },
      }));

      await sendExpoNotifications(messages);

      return {
        success: true,
        message: `Reminder sent to ${nonRespondingMemberIds.length} crew member(s) who haven't responded.`,
      };
    } catch (error) {
      console.error('Error in notifyNonRespondingPollMembers function:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('unknown', 'An unknown error occurred.');
    }
  }
);
