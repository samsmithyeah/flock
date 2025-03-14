import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';

export const notifyCrewMembersOnPollCreation = onDocumentCreated(
  'event_polls/{pollId}',
  async (event) => {
    const { pollId } = event.params;

    // If there's no data, exit
    if (!event.data) {
      console.log('No poll data present.');
      return null;
    }

    const pollData = event.data.data();

    if (!pollData) {
      console.log('Poll data is empty.');
      return null;
    }

    const { crewId, title, createdBy } = pollData;

    if (!crewId || !createdBy) {
      console.log('Missing required poll data (crewId or createdBy).');
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

    // Fetch the user who created the poll
    const userRef = admin.firestore().collection('users').doc(createdBy);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`Creator user ${createdBy} not found.`);
      return null;
    }

    const userData = userDoc.data() as { displayName?: string };
    const actorName = userData.displayName || 'Someone';

    // Create notification message
    const pollTitle = title || 'Untitled Poll';
    const notificationBody = `${actorName} created a new poll "${pollTitle}" to pick a date.`;

    // Exclude the creator from receiving the notification
    const memberIdsToNotify = memberIds.filter((id: string) => id !== createdBy);

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
        screen: 'EventPollRespond',
      },
    }));

    await sendExpoNotifications(messages);

    console.log(
      `Sent ${messages.length} notifications for new poll ${pollId} in crew ${crewId}.`
    );

    return null;
  }
);
