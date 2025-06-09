// functions/src/notifications/notifyCrewOnStatusChange.ts

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { getDateDescription } from '../utils/dateHelpers';
import { shouldSendNotification } from '../utils/notificationSettings';

export const notifyCrewOnStatusChange = onDocumentWritten(
  'crews/{crewId}/statuses/{date}/userStatuses/{userId}',
  async (event) => {
    const { crewId, date, userId } = event.params;

    const beforeData = event.data?.before.exists ? event.data.before.data() : null;
    const afterData = event.data?.after.exists ? event.data.after.data() : null;

    const beforeStatus =
      typeof beforeData?.upForGoingOutTonight === 'boolean' ? beforeData.upForGoingOutTonight : null;
    const afterStatus =
      typeof afterData?.upForGoingOutTonight === 'boolean' ? afterData.upForGoingOutTonight : null;

    // Only proceed if the status has changed.
    if (beforeStatus === afterStatus) {
      console.log('Status did not change.');
      return null;
    }

    if (beforeStatus === false && afterStatus === null) {
      console.log('Status changed from unavailable to null; no notification needed.');
      return null;
    }

    const statusChangedToUp = afterStatus === true;
    const statusChangedToDown = afterStatus === false;

    // Fetch the crew document to get memberIds and crew name
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

    // Set notification message based on the new status.
    let messageBody = '';

    if (afterStatus === true) {
      messageBody = `${userName} is up for ${crewActivity} ${dateDescription}!`;
    } else if (beforeStatus === true) {
      messageBody = `${userName} is no longer up for ${crewActivity} ${dateDescription}.`;
    } else if (afterStatus === false) {
      messageBody = `${userName} is not available for ${crewActivity} ${dateDescription}.`;
    }

    console.log(`Notification Message: ${messageBody}`);

    // Identify members who are also available (true) on the same date.
    const userStatusesRef = admin
      .firestore()
      .collection('crews')
      .doc(crewId)
      .collection('statuses')
      .doc(date)
      .collection('userStatuses');

    const batchSize = 10;
    const eligibleMemberIds: string[] = [];

    for (let i = 0; i < memberIds.length; i += batchSize) {
      const batch = memberIds.slice(i, i + batchSize);
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

    // Fetch Expo push tokens for eligible members.
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

        // Check notification preferences
        if (!shouldSendNotification(memberData.notificationSettings, 'user_status_changed')) {
          console.log(`User ${doc.id} has disabled user_status_changed notifications. Skipping.`);
          return;
        }

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

    // Prepare the notification messages.
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

    // Send the notifications.
    await sendExpoNotifications(messages);
    console.log('Notifications sent successfully.');

    return null;
  }
);
