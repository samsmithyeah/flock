import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { shouldSendNotification } from '../utils/notificationSettings';

// Define interfaces for poll option and response types
interface PollOption {
  date: string;
  responses: Record<string, string>;
}

export const notifyPollCreatorOnAllResponded = onDocumentUpdated(
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

    // Skip if the poll is already finalized
    if (beforeData.finalized || afterData.finalized) {
      console.log('Poll is already finalized, skipping notification.');
      return null;
    }

    const { crewId, title, createdBy } = afterData;

    if (!crewId || !createdBy) {
      console.log('Missing required poll data (crewId or createdBy).');
      return null;
    }

    // Fetch the crew document to get memberIds
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

    // Skip if there's only one member (the creator)
    if (memberIds.length <= 1) {
      console.log('Crew has only one member, skipping check.');
      return null;
    }

    // Get current poll options with responses
    const options = afterData.options || [];
    if (options.length === 0) {
      console.log('Poll has no options to respond to.');
      return null;
    }

    // Collect all unique user IDs who have responded to any option
    const respondedUserIds = new Set<string>();
    options.forEach((option: PollOption) => {
      const responses = option.responses || {};
      Object.keys(responses).forEach((userId: string) => {
        respondedUserIds.add(userId);
      });
    });

    // Check if all crew members except the creator have responded
    // We need to check if everyone EXCEPT the creator has responded
    const otherMemberIds = memberIds.filter((id: string) => id !== createdBy);

    // Check if all other members have responded
    const allMembersResponded = otherMemberIds.every((memberId: string) =>
      respondedUserIds.has(memberId)
    );

    // If notification was already sent or not all members have responded, exit
    if (!allMembersResponded) {
      console.log('Not all crew members have responded to the poll yet.');
      return null;
    }

    // Check if we're crossing the threshold from "not all responded" to "all responded"
    // by comparing with the previous state
    const beforeOptions = beforeData.options || [];
    const beforeRespondedUserIds = new Set<string>();
    beforeOptions.forEach((option: PollOption) => {
      const responses = option.responses || {};
      Object.keys(responses).forEach((userId: string) => {
        beforeRespondedUserIds.add(userId);
      });
    });

    const wasAllMembersResponded = otherMemberIds.every((memberId: string) =>
      beforeRespondedUserIds.has(memberId)
    );

    // If all members had already responded before, don't send duplicate notification
    if (wasAllMembersResponded) {
      console.log('All members had already responded, no need to notify again.');
      return null;
    }

    // Create notification for the poll creator
    // Fetch the user's push tokens
    const userRef = admin.firestore().collection('users').doc(createdBy);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`Poll creator ${createdBy} not found.`);
      return null;
    }

    const userData = userDoc.data();

    // Check notification preferences
    if (!shouldSendNotification(userData?.notificationSettings, 'poll_completed')) {
      console.log(`Poll creator ${createdBy} has disabled poll_completed notifications. Skipping.`);
      return null;
    }

    const expoPushTokens: string[] = [];

    const singleToken = userData?.expoPushToken;
    const tokensArray = userData?.expoPushTokens;

    if (singleToken && Expo.isExpoPushToken(singleToken)) {
      expoPushTokens.push(singleToken);
    }

    if (tokensArray && Array.isArray(tokensArray)) {
      tokensArray.forEach((token: string) => {
        if (Expo.isExpoPushToken(token)) {
          expoPushTokens.push(token);
        }
      });
    }

    if (expoPushTokens.length === 0) {
      console.log('No valid Expo push tokens found for the poll creator.');
      return null;
    }

    // Create notification message
    const pollTitle = title || 'Untitled Poll';
    const notificationBody = `Everyone in "${crewName}" has responded to your poll "${pollTitle}". You can now finalise a date!`;

    const messages: ExpoPushMessage[] = expoPushTokens.map((token) => ({
      to: token,
      sound: 'default',
      title: 'Poll Complete',
      body: notificationBody,
      data: {
        crewId,
        pollId,
        screen: 'EventPollDetails',
      },
    }));

    await sendExpoNotifications(messages);

    console.log(
      `Sent notification to poll creator that all ${otherMemberIds.length} members have responded to poll ${pollId}.`
    );

    return null;
  }
);
