// src/notifications/notifyCrewMembersOnEventWrite.ts

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { getFormattedDate } from '../utils/dateHelpers';
const getEventDateRangeString = (startDate: string, endDate: string): string => {
  if (!startDate || !endDate) return '';

  const startString = getFormattedDate(startDate);
  const endString = getFormattedDate(endDate);

  // Single day vs. multiple days
  return startDate === endDate ? startString :
    `${startString} - ${endString}`;
};

export const notifyCrewMembersOnEventWrite = onDocumentWritten(
  'crews/{crewId}/events/{eventId}',
  async (event) => {
    const { crewId, eventId } = event.params;

    // If there's no data at all, just exit
    if (!event.data) {
      console.log('No event data present.');
      return null;
    }

    const beforeSnap = event.data.before;
    const afterSnap = event.data.after;
    const beforeExists = beforeSnap.exists;
    const afterExists = afterSnap.exists;

    if (!beforeExists && !afterExists) {
      // Some strange case where there was no doc before and no doc after
      console.log('Document does not exist before or after.');
      return null;
    }

    // Identify create, update, or delete
    const isCreated = !beforeExists && afterExists;
    const isDeleted = beforeExists && !afterExists;
    const isUpdated = beforeExists && afterExists;

    const afterData = afterSnap.data() || {};
    const beforeData = beforeSnap.data() || {};

    const actorUserId = isCreated ?
      afterData.createdBy :
      isDeleted ?
        beforeData.createdBy :
        afterData.updatedBy;

    if (!actorUserId) {
      console.log('No actor user ID found for this action, skipping.');
      return null;
    }

    // Fetch the crew document to get crew.name and memberIds
    const crewRef = admin.firestore().collection('crews').doc(crewId);
    const crewDoc = await crewRef.get();

    if (!crewDoc.exists) {
      console.log(`Crew ${crewId} not found.`);
      return null;
    }

    const crewData = crewDoc.data();
    if (!crewData || !crewData.memberIds) {
      console.log(`Crew ${crewId} is missing 'memberIds'.`);
      return null;
    }

    const crewName = crewData.name || 'Your Crew';
    const memberIds: string[] = crewData.memberIds;

    // Fetch the user who performed this action
    const userRef = admin.firestore().collection('users').doc(actorUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`Actor user ${actorUserId} not found.`);
      return null;
    }

    const userData = userDoc.data() as { displayName?: string };
    const actorName = userData.displayName || 'Someone';

    // Prepare info about the event
    // For create/update, we get from `afterData`.
    // For delete, we get from `beforeData`.
    const eventDoc = isDeleted ? beforeData : afterData;
    const eventTitle = eventDoc.title || 'Untitled event';

    // Build the date range string for create scenario (or you could do it for update too).
    const dateRangeStr = getEventDateRangeString(
      eventDoc.startDate,
      eventDoc.endDate
    );

    let notificationBody = '';
    if (isCreated) {
      // e.g. "Sam added 'Birthday Bash' (Jan 5 - Jan 8)."
      notificationBody = `${actorName} created a new event "${eventTitle}" (${dateRangeStr}).`;
    } else if (isUpdated) {
      // e.g. "Sam updated 'Birthday Bash'."
      notificationBody = `${actorName} updated the event "${eventTitle}".`;
    } else if (isDeleted) {
      // e.g. "Sam deleted 'Birthday Bash'."
      notificationBody = `${actorName} deleted the event "${eventTitle}".`;
    }

    // (Optional) Exclude the actor from receiving the notification
    // const memberIdsToNotify = memberIds.filter(id => id !== actorUserId);
    const memberIdsToNotify = memberIds; // If you want them to get the push, keep them in

    if (memberIdsToNotify.length === 0) {
      console.log('No members to notify.');
      return null;
    }

    // Gather all Expo push tokens
    const expoPushTokens: string[] = [];
    const batchSize = 10;

    for (let i = 0; i < memberIdsToNotify.length; i += batchSize) {
      const batch = memberIdsToNotify.slice(i, i + batchSize);
      const usersSnapshot = await admin
        .firestore()
        .collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', batch)
        .get();

      usersSnapshot.forEach((doc) => {
        const memberData = doc.data();
        const singleToken = memberData?.expoPushToken;
        const tokensArray = memberData?.expoPushTokens;

        if (singleToken && Expo.isExpoPushToken(singleToken)) {
          expoPushTokens.push(singleToken);
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
      console.log('No valid Expo push tokens found for this crew.');
      return null;
    }

    // Build the messages
    // Include the startDate in the data object, as requested
    const messages: ExpoPushMessage[] = expoPushTokens.map((token) => ({
      to: token,
      sound: 'default',
      title: crewName,
      body: notificationBody,
      data: {
        crewId,
        eventId,
        date: eventDoc.startDate,
        screen: 'Crew',
      },
    }));

    // Send
    await sendExpoNotifications(messages);

    console.log(
      `Sent ${messages.length} notifications for event ${eventId} in crew ${crewId}.`
    );

    return null;
  }
);
