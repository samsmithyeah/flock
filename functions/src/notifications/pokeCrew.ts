// functions/src/notifications/pokeCrew.ts

import * as functions from 'firebase-functions/v2';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { getDateDescription } from '../utils/dateHelpers';

// Define the type for the data expected from the client
interface PokeCrewData {
  crewId: string;
  date: string; // Format: 'YYYY-MM-DD'
  userId: string;
}

// Define the type for the response
interface PokeCrewResponse {
  success: boolean;
  message: string;
}

/**
 * Callable function to poke the crew.
 * Expects data: { crewId: string, date: string, userId: string }
 */
export const pokeCrew = functions.https.onCall(
  async (request: CallableRequest<PokeCrewData>): Promise<PokeCrewResponse> => {
    const data = request.data;
    const context = request.auth;

    // **Authentication Check**
    if (!context || !context.uid) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const { crewId, date, userId } = data;

    // **Input Validation**
    if (!crewId || !date || !userId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'The function must be called with crewId, date, and userId.'
      );
    }

    const db = admin.firestore();

    try {
      // **Fetch the Crew Document**
      const crewRef = db.collection('crews').doc(crewId);
      const crewDoc = await crewRef.get();

      if (!crewDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Crew not found.');
      }

      const crewData = crewDoc.data();

      if (
        !crewData ||
        !crewData.memberIds ||
        !crewData.name
      ) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Crew data is incomplete.'
        );
      }

      const { name: crewName, activity } = crewData;

      const activityName = activity ? activity.toLowerCase() : 'meeting up';

      const crewMemberIds = crewData.memberIds.filter((id: string) => id !== userId);

      // **Fetch User Statuses for the Selected Date**
      const userStatusesRef = crewRef
        .collection('statuses')
        .doc(date)
        .collection('userStatuses');

      const userStatusesSnapshot = await userStatusesRef.get();

      const upMemberIds: string[] = [];
      const notUpMemberIds: string[] = [];

      userStatusesSnapshot.forEach((docSnap) => {
        const statusData = docSnap.data();
        if (statusData.upForGoingOutTonight) {
          upMemberIds.push(docSnap.id);
        }
      });

      crewMemberIds.forEach((memberId: string) => {
        if (!upMemberIds.includes(memberId)) {
          notUpMemberIds.push(memberId);
        }
      });

      console.log('Up Members:', upMemberIds);
      console.log('Not Up Members:', notUpMemberIds);

      // **Ensure the User Sending the Poke is Marked as Up**
      if (!upMemberIds.includes(userId)) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'You must be marked as up for it to poke the crew.'
        );
      }

      // **If No Members Are Not Up, Exit**
      if (notUpMemberIds.length === 0) {
        console.log('All crew members are already up for it.');
        return {
          success: true,
          message: 'All crew members are already up for it.',
        };
      }

      // **Fetch the User Document of the sender**
      const senderDoc = await db.collection('users').doc(userId).get();
      if (!senderDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found.');
      }

      const senderData = senderDoc.data();
      const senderName = senderData?.displayName || 'A crew member';

      // **Prepare the Notification Message**
      const dateDescription = getDateDescription(date);
      const messageBody = `${senderName} has poked the crew about ${activityName} ${dateDescription}!`;

      // **Fetch Push Tokens for Members Not Up**
      const batchSize = 10; // Firestore 'in' queries support up to 10 elements
      const expoPushTokens: string[] = [];

      for (let i = 0; i < notUpMemberIds.length; i += batchSize) {
        const batch = notUpMemberIds.slice(i, i + batchSize);

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
        console.log('No valid Expo push tokens found for members not up.');
        return {
          success: false,
          message: 'The crew members not up for it didn\'t have push notifications set up correctly.',
        };
      }

      console.log(`Expo Push Tokens to notify: ${expoPushTokens}`);

      // **Prepare the Notification Messages**
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

      // **Send the Notifications**
      await sendExpoNotifications(messages);

      console.log(
        `Sent poke notifications to members not up in crew ${crewName} for date ${dateDescription}.`
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
