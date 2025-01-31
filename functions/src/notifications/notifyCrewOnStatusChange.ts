// functions/src/notifications/notifyCrewOnStatusChange.ts

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { getDateDescription } from '../utils/dateHelpers';

/**
 * Cloud Function to notify crew members when a user's status changes.
 */
export const notifyCrewOnStatusChange = onDocumentWritten(
  'crews/{crewId}/statuses/{date}/userStatuses/{userId}',
  async (event) => {
    const { crewId, date, userId } = event.params;

    const beforeData = event.data?.before.exists ?
      event.data.before.data() :
      null;
    const afterData = event.data?.after.exists ?
      event.data.after.data() :
      null;

    // Determine if the status was changed to up or down
    const statusChangedToUp =
      !beforeData?.upForGoingOutTonight && afterData?.upForGoingOutTonight;
    const statusChangedToDown =
      beforeData?.upForGoingOutTonight && !afterData?.upForGoingOutTonight;

    if (!statusChangedToUp && !statusChangedToDown) {
      // Status did not change in a way that requires notification
      console.log('Status change does not require notification.');
      return null;
    }

    // Fetch the crew document to get memberIds and crew.name
    const crewRef = admin.firestore().collection('crews').doc(crewId);
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
    const memberIds = crewData.memberIds.filter((id: string) => id !== userId);

    if (memberIds.length === 0) {
      console.log('No other members in the crew to notify.');
      return null;
    }

    // Fetch the user's displayName
    const userRef = admin.firestore().collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`User ${userId} does not exist.`);
      return null;
    }

    const userData = userDoc.data() as { displayName: string };
    const userName = userData.displayName;

    // Determine date description
    const dateDescription = getDateDescription(date);
    console.log(`Date Description: ${dateDescription}`);

    const crewActivity = crewData.activity ? crewData.activity.toLowerCase() : 'meeting up';

    // Determine notification message based on status change
    let messageBody = '';
    if (statusChangedToUp) {
      messageBody = `${userName} is up for ${crewActivity} ${dateDescription}!`;
    } else if (statusChangedToDown) {
      messageBody = `${userName} is no longer up for ${crewActivity} ${dateDescription}.`;
    }

    console.log(`Notification Message: ${messageBody}`);

    // Fetch userStatuses to identify members who are also up for it on the same date
    const userStatusesRef = admin
      .firestore()
      .collection('crews')
      .doc(crewId)
      .collection('statuses')
      .doc(date)
      .collection('userStatuses');

    // Firestore 'in' queries support up to 10 elements per query
    const batchSize = 10;
    const eligibleMemberIds: string[] = [];

    for (let i = 0; i < memberIds.length; i += batchSize) {
      const batch = memberIds.slice(i, i + batchSize);

      // Query for userStatuses where documentId (userId) is in the current batch and upForGoingOutTonight is true
      const statusesSnapshot = await userStatusesRef
        .where(admin.firestore.FieldPath.documentId(), 'in', batch)
        .where('upForGoingOutTonight', '==', true)
        .get();

      statusesSnapshot.forEach((doc) => {
        eligibleMemberIds.push(doc.id);
      });
    }

    if (eligibleMemberIds.length === 0) {
      console.log('No eligible members to notify.');
      return null;
    }

    console.log(`Eligible Members to Notify: ${eligibleMemberIds}`);

    // Now, fetch the push tokens for eligible members
    const expoPushTokens: string[] = [];

    for (let i = 0; i < eligibleMemberIds.length; i += batchSize) {
      const batch = eligibleMemberIds.slice(i, i + batchSize);

      const usersSnapshot = await admin
        .firestore()
        .collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', batch)
        .get();

      usersSnapshot.forEach((doc) => {
        const memberData = doc.data();
        const token = memberData?.expoPushToken;
        const tokensArray = memberData?.expoPushTokens;

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
      console.log('No valid Expo push tokens found for eligible members.');
      return null;
    }

    console.log(`Expo Push Tokens: ${expoPushTokens}`);

    // Prepare the notification messages
    const messages: ExpoPushMessage[] = expoPushTokens.map((pushToken) => ({
      to: pushToken,
      sound: 'default',
      title: crewName,
      body: messageBody,
      data: {
        crewId,
        userId,
        date,
        statusChangedToUp,
        statusChangedToDown,
        screen: 'Crew',
      },
    }));

    console.log(`Prepared Messages: ${JSON.stringify(messages)}`);

    // Send the notifications
    await sendExpoNotifications(messages);

    console.log('Notifications sent successfully.');

    return null;
  }
);
