import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';

export const notifyCrewMembersOnPollResponse = onDocumentUpdated(
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

    const { crewId, title } = afterData;

    // Check if this update is a poll finalization (handled by another function)
    if (!beforeData.finalized && afterData.finalized) {
      console.log('Poll finalization will be handled by another function.');
      return null;
    }

    // Check if the options changed (someone responded to the poll)
    // We need to find who responded by comparing the before and after options
    const beforeOptions = beforeData.options || [];
    const afterOptions = afterData.options || [];

    // If number of options changed, this is not a response update
    if (beforeOptions.length !== afterOptions.length) {
      console.log('Options structure changed, not a response update.');
      return null;
    }

    let responderId: string | null = null;
    let isNewResponse = false;

    // Compare each option to find new responder
    for (let i = 0; i < afterOptions.length; i++) {
      const beforeResponses = beforeOptions[i].responses || {};
      const afterResponses = afterOptions[i].responses || {};

      // Find new responders by comparing response objects
      const beforeKeys = Object.keys(beforeResponses);
      const afterKeys = Object.keys(afterResponses);

      if (afterKeys.length > beforeKeys.length) {
        const newResponders = afterKeys.filter((key) => !beforeKeys.includes(key));
        if (newResponders.length > 0) {
          responderId = newResponders[0]; // Take the first new responder
          isNewResponse = true;
          break;
        }
      }

      // Also check if any existing user changed their response
      for (const userId of afterKeys) {
        if (beforeKeys.includes(userId) && beforeResponses[userId] !== afterResponses[userId]) {
          responderId = userId;
          isNewResponse = true;
          break;
        }
      }

      if (isNewResponse) break;
    }

    // If no new response was found, exit
    if (!isNewResponse || !responderId) {
      console.log('No new poll responses detected.');
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
    const memberIds = crewData.memberIds;

    // Fetch the user who responded to the poll
    const userRef = admin.firestore().collection('users').doc(responderId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`Responder user ${responderId} not found.`);
      return null;
    }

    const userData = userDoc.data() as { displayName?: string };
    const responderName = userData.displayName || 'Someone';

    // Create notification message
    const pollTitle = title || 'Untitled Poll';
    const notificationBody = `${responderName} responded to the poll "${pollTitle}".`;

    // Exclude the responder from receiving the notification
    // Also exclude the poll creator as they might get too many notifications
    const memberIdsToNotify = memberIds.filter(
      (id: string) => id !== responderId && id !== afterData.createdBy
    );

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
      `Sent ${messages.length} notifications for poll response to poll ${pollId} in crew ${crewId}.`
    );

    return null;
  }
);
