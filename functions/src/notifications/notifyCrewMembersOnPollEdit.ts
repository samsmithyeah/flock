import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { shouldSendNotification } from '../utils/notificationSettings';

// Define interfaces for poll data types
interface PollOption {
  date: string;
  responses: Record<string, string>;
}

interface PollData {
  title: string;
  description?: string;
  location?: string;
  crewId: string;
  createdBy: string;
  finalized: boolean;
  options: PollOption[];
  selectedDate?: string;
}

export const notifyCrewMembersOnPollEdit = onDocumentUpdated(
  'event_polls/{pollId}',
  async (event) => {
    // Exit if no data is available
    if (!event.data) {
      console.log('No poll data present.');
      return null;
    }

    const { pollId } = event.params;
    const beforeData = event.data.before.data() as PollData | undefined;
    const afterData = event.data.after.data() as PollData | undefined;

    // If data is missing or unchanged, exit
    if (!beforeData || !afterData) {
      console.log('Poll data is missing.');
      return null;
    }

    // Don't send notifications for finalization - that has its own notification
    if (!beforeData.finalized && afterData.finalized) {
      console.log('Poll was finalized - skipping edit notification.');
      return null;
    }

    // Check if meaningful edits were made
    const titleChanged = beforeData.title !== afterData.title;
    const descriptionChanged = beforeData.description !== afterData.description;
    const locationChanged = beforeData.location !== afterData.location;

    // Check if dates were added
    const beforeDates = new Set(beforeData.options.map((opt: PollOption) => opt.date));
    const afterDates = new Set(afterData.options.map((opt: PollOption) => opt.date));
    const hasNewDates = Array.from(afterDates).some((date) => !beforeDates.has(date));

    // If nothing meaningful changed, exit
    if (!titleChanged && !descriptionChanged && !locationChanged && !hasNewDates) {
      console.log('No significant changes detected.');
      return null;
    }

    const { crewId, title, createdBy } = afterData;

    if (!crewId) {
      console.log('Missing required poll data (crewId).');
      return null;
    }

    const actorUserId = createdBy;

    if (!actorUserId) {
      console.log('Could not determine who edited the poll.');
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

    // Fetch the user who edited the poll
    const userRef = admin.firestore().collection('users').doc(actorUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`Actor user ${actorUserId} not found.`);
      return null;
    }

    const userData = userDoc.data() as { displayName?: string };
    const actorName = userData.displayName || 'Someone';

    // Create appropriate notification message
    let notificationBody = '';
    if (hasNewDates) {
      notificationBody = `${actorName} added new date options to "${title}"`;
    } else if (titleChanged) {
      notificationBody = `${actorName} changed the poll "${beforeData.title}" to "${title}"`;
    } else if (locationChanged) {
      notificationBody = `${actorName} updated the location for "${title}"`;
    } else if (descriptionChanged) {
      notificationBody = `${actorName} updated the description for "${title}"`;
    } else {
      notificationBody = `${actorName} edited details for the poll "${title}"`;
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
        if (!shouldSendNotification(memberData.notificationSettings, 'poll_updated')) {
          console.log(`User ${doc.id} has disabled poll_updated notifications. Skipping.`);
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
      title: `${crewName} - Poll Updated`,
      body: notificationBody,
      data: {
        crewId,
        pollId,
        screen: 'EventPollDetails',
        params: { pollId, crewId },
      },
    }));

    await sendExpoNotifications(messages);

    console.log(
      `Sent ${messages.length} notifications for edited poll ${pollId} in crew ${crewId}.`
    );

    return null;
  }
);
