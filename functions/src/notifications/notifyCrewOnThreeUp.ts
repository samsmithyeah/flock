// functions/src/notifications/notifyCrewOnThreeUp.ts

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { getDateDescription } from '../utils/dateHelpers';
import { shouldSendNotification } from '../utils/notificationSettings';

export const notifyCrewOnThreeUp = onDocumentWritten(
  'crews/{crewId}/statuses/{date}/userStatuses/{userId}',
  async (event) => {
    const db = admin.firestore();
    const { crewId, date } = event.params;

    const beforeData = event.data?.before.exists ?
      event.data.before.data() :
      null;
    const afterData = event.data?.after.exists ?
      event.data.after.data() :
      null;

    // Check if upForGoingOutTonight status changed
    const statusChanged =
      (beforeData?.upForGoingOutTonight === false &&
        afterData?.upForGoingOutTonight === true) ||
      (beforeData?.upForGoingOutTonight === true &&
        afterData?.upForGoingOutTonight === false);

    if (!statusChanged) {
      // No relevant status change; exit
      console.log('No relevant status change detected.');
      return null;
    }

    // Fetch the crew document to get memberIds and crew.name
    const crewRef = db.collection('crews').doc(crewId);
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
    const memberIds: string[] = crewData.memberIds;

    // Fetch all userStatuses documents to determine who is up
    const userStatusesRef = db
      .collection('crews')
      .doc(crewId)
      .collection('statuses')
      .doc(date)
      .collection('userStatuses');

    const userStatusesSnapshot = await userStatusesRef.get();

    // Extract userIds who are up
    const upMemberIds: string[] = userStatusesSnapshot.docs
      .filter((doc) => doc.data().upForGoingOutTonight === true)
      .map((doc) => doc.id);

    const totalUpCount = upMemberIds.length;

    console.log(`Total members up for it today: ${totalUpCount}`);

    // Proceed only if totalUpCount is 3 or more
    if (totalUpCount >= 3) {
      // Reference to the fomoNotification document to track last notified count
      const notificationRef = db
        .collection('crews')
        .doc(crewId)
        .collection('statuses')
        .doc(date)
        .collection('notifications')
        .doc('fomoNotification');

      const notificationDoc = await notificationRef.get();

      let lastNotifiedCount = 0;
      if (notificationDoc.exists) {
        const data = notificationDoc.data();
        if (data && typeof data.lastNotifiedCount === 'number') {
          lastNotifiedCount = data.lastNotifiedCount;
        }
      }

      console.log(`Last notified count: ${lastNotifiedCount}`);

      // Check if current count is greater than last notified count
      if (totalUpCount > lastNotifiedCount) {
        // Identify members who are NOT up
        const membersNotUp: string[] = memberIds.filter(
          (id) => !upMemberIds.includes(id)
        );

        // Log each member's status for debugging
        memberIds.forEach((id) => {
          const isUp = upMemberIds.includes(id);
          console.log(`User ${id} upForGoingOutTonight: ${isUp}`);
        });

        if (membersNotUp.length === 0) {
          console.log('All crew members are up; no one to notify.');
          // Update lastNotifiedCount to current count to prevent future redundant notifications
          await notificationRef.set({ lastNotifiedCount: totalUpCount });
          return null;
        }

        const crewActivity = crewData.activity.toLowerCase() || 'meeting up';

        console.log(`Members not up for ${crewActivity} today: ${membersNotUp}`);

        // Prepare notification message
        const dateDescription = getDateDescription(date);
        const messageBody = `${totalUpCount} of your crew members are up for ${crewActivity} ${dateDescription}!`;

        // Fetch push tokens for members not up
        const batchSize = 10; // Firestore 'in' queries support up to 10 elements per query
        const expoPushTokens: string[] = [];

        for (let i = 0; i < membersNotUp.length; i += batchSize) {
          const batch = membersNotUp.slice(i, i + batchSize);

          // Firestore 'in' queries support up to 10 elements
          const usersSnapshot = await db
            .collection('users')
            .where(admin.firestore.FieldPath.documentId(), 'in', batch)
            .get();

          usersSnapshot.docs.forEach((doc) => {
            const userData = doc.data();

            // Check notification preferences
            if (!shouldSendNotification(userData.notificationSettings, 'user_status_changed')) {
              console.log(`User ${doc.id} has disabled user_status_changed notifications. Skipping.`);
              return;
            }

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
          return null;
        }

        console.log(`Expo Push Tokens to notify: ${expoPushTokens}`);

        // Prepare the notification messages
        const messages: ExpoPushMessage[] = expoPushTokens.map((pushToken) => ({
          to: pushToken,
          sound: 'default',
          title: crewName,
          body: messageBody,
          data: {
            crewId,
            date,
            screen: 'Crew',
          },
        }));

        // Send the notifications
        await sendExpoNotifications(messages);

        console.log(
          `Sent notifications to members not up in crew ${crewName} for date ${dateDescription} with count ${totalUpCount}.`
        );

        // Update the lastNotifiedCount to current count
        await notificationRef.set({ lastNotifiedCount: totalUpCount });

        return null;
      } else {
        console.log(
          `Current up count (${totalUpCount}) is not greater than last notified count (${lastNotifiedCount}). No notification sent.`
        );
        return null;
      }
    }

    return null;
  }
);
