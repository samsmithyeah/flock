import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { getFormattedDate } from '../utils/dateHelpers';
import { shouldSendNotification } from '../utils/notificationSettings';

export const notifyCrewMembersOnPollFinalization = onDocumentUpdated(
  'event_polls/{pollId}',
  async (event) => {
    const { pollId } = event.params;

    // If there's no data, exit
    if (!event.data) {
      console.log('No poll data present.');
      return null;
    }

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    if (!beforeData || !afterData) {
      console.log('Poll data is empty.');
      return null;
    }

    // Check if this is a poll finalization
    // The poll was not finalized before and now it is
    if (beforeData.finalized || !afterData.finalized) {
      console.log('Not a poll finalization update.');
      return null;
    }

    const { crewId, title, selectedDate, selectedEndDate, duration } = afterData;

    if (!crewId || !selectedDate) {
      console.log('Missing required data (crewId or selectedDate).');
      return null;
    }

    // Get the user who likely finalized the poll
    // This might be recorded in the updatedBy field or can be inferred from the lastUpdatedBy
    // For now, we'll assume it's done by the poll creator
    const actorUserId = afterData.createdBy;

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
    const memberIds = crewData.memberIds;

    // Fetch the user who finalized the poll
    const userRef = admin.firestore().collection('users').doc(actorUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`Actor user ${actorUserId} not found.`);
      return null;
    }

    const userData = userDoc.data() as { displayName?: string };
    const actorName = userData.displayName || 'Someone';

    // Format the selected dates
    const formattedStartDate = getFormattedDate(selectedDate);

    // Create notification message
    const pollTitle = title || 'Untitled Poll';
    let notificationBody = '';

    if (duration > 1) {
      const formattedEndDate = selectedEndDate ?
        getFormattedDate(selectedEndDate) :
        getFormattedDate(selectedDate); // Fallback

      notificationBody = `${actorName} finalised the poll "${pollTitle}". Selected dates: ${formattedStartDate} to ${formattedEndDate} (${duration} days).`;
    } else {
      notificationBody = `${actorName} finalised the poll "${pollTitle}". The selected date is ${formattedStartDate}.`;
    }

    // Exclude the actor from receiving the notification
    const memberIdsToNotify = memberIds.filter((id: string) => id !== actorUserId);

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

        // Check notification preferences
        if (!shouldSendNotification(memberData.notificationSettings, 'poll_completed')) {
          console.log(`User ${doc.id} has disabled poll_completed notifications. Skipping.`);
          return;
        }

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

    const messages: ExpoPushMessage[] = expoPushTokens.map((token) => ({
      to: token,
      sound: 'default',
      title: crewName,
      body: notificationBody,
      data: {
        crewId,
        pollId,
        screen: 'EventPollDetails',
      },
    }));

    await sendExpoNotifications(messages);

    console.log(
      `Sent ${messages.length} notifications for finalized poll ${pollId} in crew ${crewId}.`
    );

    return null;
  }
);
