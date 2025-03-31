import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { Expo } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import moment from 'moment-timezone';
import { countryToTimezone } from '../utils/timezoneHelper';

// Ensure Firebase Admin is initialized
// admin.initializeApp();

/**
 * Sends notifications to users about events happening today
 * - If user is marked available (true) or hasn't set (null/undefined), send appropriate message.
 * - If user is marked unavailable (false), DO NOT send a notification.
 *
 * Runs at 10:00 AM in the user's local timezone (based on their country)
 */
export const notifyUsersAboutTodaysEvents = onSchedule({
  schedule: '0 10 * * *', // 10:00 AM
  timeZone: 'Europe/London',
}, async (event) => {
  const functionStartTime = moment();
  console.log(`Starting notifyUsersAboutTodaysEvents run. Triggered at: ${event?.scheduleTime || 'N/A'}`);
  const db = admin.firestore();

  try {
    const today = moment().tz('Europe/London').format('YYYY-MM-DD');
    console.log(`Checking for events on date: ${today}`);
    const crewsSnapshot = await db.collection('crews').get();
    let totalNotificationsSent = 0;

    for (const crewDoc of crewsSnapshot.docs) {
      const crewId = crewDoc.id;
      const crewData = crewDoc.data();
      const crewName = crewData.name || 'Your Crew';
      const memberIds = crewData.memberIds || [];

      if (memberIds.length === 0) continue;

      const eventsSnapshot = await db.collection('crews')
        .doc(crewId)
        .collection('events')
        .where('startDate', '<=', today)
        .where('endDate', '>=', today)
        .get();

      if (eventsSnapshot.empty) continue;

      const statusCollectionPath = `crews/${crewId}/statuses/${today}/userStatuses`;

      for (const eventDoc of eventsSnapshot.docs) {
        const eventId = eventDoc.id;
        const eventData = eventDoc.data();
        const eventTitle = eventData.title || 'Untitled Event';

        for (const memberId of memberIds) {
          let userStatus: boolean | null | undefined = null;

          const userStatusPath = `${statusCollectionPath}/${memberId}`;
          const userStatusRef = db.doc(userStatusPath);
          const userStatusDoc = await userStatusRef.get();

          if (userStatusDoc.exists) {
            userStatus = userStatusDoc.data()?.upForGoingOutTonight;
          }

          // --- NEW LOGIC: Skip if explicitly set to false ---
          if (userStatus === false) {
            console.log(`User ${memberId} opted out (status is false) for event ${eventId} on ${today}. Skipping notification.`);
            continue; // Skip to the next member
          }
          // --- END NEW LOGIC ---

          // Proceed only if userStatus is true, null, or undefined
          const userDoc = await db.collection('users').doc(memberId).get();
          if (!userDoc.exists) {
            console.warn(`User document not found for memberId: ${memberId}. Skipping.`);
            continue;
          }
          const userData = userDoc.data();

          // Timezone Check (8am-12pm)
          // TODO: Convert this whole thing to use cloud tasks
          const countryCode = userData?.country;
          const userTimezone = countryCode ? countryToTimezone(countryCode) : 'Europe/London';
          const userLocalTime = functionStartTime.clone().tz(userTimezone);
          const userHour = userLocalTime.hour();
          if (userHour < 8 || userHour > 12) {
            continue;
          }

          // Collect push tokens
          const expoPushTokens: string[] = [];
          // ...(token collection logic)...
          if (userData?.expoPushToken && Expo.isExpoPushToken(userData.expoPushToken)) {
            expoPushTokens.push(userData.expoPushToken);
          }
          if (userData?.expoPushTokens && Array.isArray(userData.expoPushTokens)) {
            for (const token of userData.expoPushTokens) {
              if (Expo.isExpoPushToken(token) && !expoPushTokens.includes(token)) {
                expoPushTokens.push(token);
              }
            }
          }
          if (expoPushTokens.length === 0) {
            continue;
          }

          // Determine notification content (only reached if status is not false)
          let notificationBody = '';
          let targetScreen = '';
          let additionalData = {};

          if (userStatus === true) { // User is available
            notificationBody = `${eventTitle} is happening today! Join the chat to finalise the details.`;
            targetScreen = 'CrewDateChat';
            additionalData = { chatId: `${crewId}_${today}`, crewId, date: today, eventId };
          } else { // User hasn't set status (null/undefined)
            notificationBody = `${eventTitle} is happening today! Let your crew know if you're joining.`;
            targetScreen = 'Crew';
            additionalData = { crewId, date: today, eventId };
          }

          // Create and send messages
          const messages = expoPushTokens.map((token) => ({ /* ... message structure ... */
            to: token, sound: 'default' as const, title: crewName, body: notificationBody, data: { screen: targetScreen, ...additionalData },
          }));
          try {
            await sendExpoNotifications(messages);
            totalNotificationsSent += messages.length;
          } catch (notificationError) {
            console.error(`Error sending notification to user ${memberId} for event ${eventId}:`, notificationError);
          }
        } // End member loop
      } // End event loop
    } // End crew loop

    console.log(`Finished notifyUsersAboutTodaysEvents run. Total notifications sent: ${totalNotificationsSent}`);
    return;
  } catch (error) {
    console.error('Error running notifyUsersAboutTodaysEvents:', error);
    return;
  }
});
