// functions/src/notifications/pokeCrew.ts

import * as functions from 'firebase-functions/v2';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { getDateDescription } from '../utils/dateHelpers';

interface PokeCrewData {
  crewId: string;
  date: string; // Format: 'YYYY-MM-DD'
  userId: string;
}

interface PokeCrewResponse {
  success: boolean;
  message: string;
}

export const pokeCrew = functions.https.onCall(
  async (request: CallableRequest<PokeCrewData>): Promise<PokeCrewResponse> => {
    const data = request.data;
    const context = request.auth;

    if (!context || !context.uid) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const { crewId, date, userId } = data;

    if (!crewId || !date || !userId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'The function must be called with crewId, date, and userId.'
      );
    }

    const db = admin.firestore();

    try {
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

      const { name: crewName, activity } = crewData;
      const activityName = activity ? activity.toLowerCase() : 'meeting up';

      // Exclude the sender from the crew member IDs
      const crewMemberIds = crewData.memberIds.filter((id: string) => id !== userId);

      // Fetch User Statuses for the Selected Date
      const userStatusesRef = crewRef
        .collection('statuses')
        .doc(date)
        .collection('userStatuses');
      const userStatusesSnapshot = await userStatusesRef.get();

      // Build a list of members who have already responded
      const respondedMemberIds: string[] = [];
      userStatusesSnapshot.forEach((docSnap) => {
        const statusData = docSnap.data();
        if (typeof statusData.upForGoingOutTonight === 'boolean') {
          respondedMemberIds.push(docSnap.id);
        }
      });

      // Only notify users who have not responded
      const notRespondedMemberIds = crewMemberIds.filter(
        (memberId: string) => !respondedMemberIds.includes(memberId)
      );

      console.log('Responded Members:', respondedMemberIds);
      console.log('Not Responded Members:', notRespondedMemberIds);

      // Ensure the user sending the poke is marked as up
      const senderStatusDoc = await userStatusesRef.doc(userId).get();
      if (!senderStatusDoc.exists || senderStatusDoc.data()?.upForGoingOutTonight !== true) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'You must be marked as up for it to poke the crew.'
        );
      }

      if (notRespondedMemberIds.length === 0) {
        console.log('All crew members have already responded.');
        return {
          success: true,
          message: 'All crew members have already responded.',
        };
      }

      // Fetch the User Document of the sender
      const senderDoc = await db.collection('users').doc(userId).get();
      if (!senderDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found.');
      }
      const senderData = senderDoc.data();
      const senderName = senderData?.displayName || 'A crew member';

      // Prepare the Notification Message
      const dateDescription = getDateDescription(date);
      const messageBody = `${senderName} has poked the ${crewName} crew about ${activityName} ${dateDescription}!`;

      // Fetch Push Tokens for Members Who Have Not Responded
      const batchSize = 10;
      const expoPushTokens: string[] = [];
      for (let i = 0; i < notRespondedMemberIds.length; i += batchSize) {
        const batch = notRespondedMemberIds.slice(i, i + batchSize);
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
        console.log('No valid Expo push tokens found for members who have not responded.');
        return {
          success: false,
          message:
            'The crew members who haven\'t responded didn\'t have push notifications set up correctly.',
        };
      }

      console.log(`Expo Push Tokens to notify: ${expoPushTokens}`);

      // Prepare and send the notification messages
      const messages: ExpoPushMessage[] = expoPushTokens.map((pushToken) => ({
        to: pushToken,
        sound: 'default',
        title: `${senderName} poked you!`,
        subtitle: crewName,
        body: messageBody,
        data: {
          crewId,
          date,
          screen: 'Crew',
        },
      }));

      await sendExpoNotifications(messages);
      console.log(
        `Sent poke notifications to crew members who haven't responded in crew ${crewName} for date ${dateDescription}.`
      );

      return { success: true, message: 'The crew were successfully poked' };
    } catch (error) {
      console.error('Error in pokeCrew function:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        'unknown',
        'An unknown error occurred.'
      );
    }
  }
);
