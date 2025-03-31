import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { Expo } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import moment from 'moment-timezone';
import { countryToTimezone } from '../utils/timezoneHelper';

/**
 * Sends notifications to users about events happening tomorrow
 * - If user is marked available (true) or hasn't set (null/undefined), send appropriate message.
 * - If user is marked unavailable (false), DO NOT send a notification.
 *
 * Runs at 6:00 PM UK time
 */
export const notifyUsersAboutTomorrowsEvents = onSchedule({
  schedule: '0 18 * * *', // 6:00 PM
  timeZone: 'Europe/London',
}, async (event) => {
  const functionStartTime = moment();
  console.log(`Starting notifyUsersAboutTomorrowsEvents run. Triggered at: ${event?.scheduleTime || 'N/A'}`);
  const db = admin.firestore();

  try {
    const tomorrow = moment().tz('Europe/London').add(1, 'day').format('YYYY-MM-DD');
    console.log(`Checking for events on date: ${tomorrow}`);

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
        .where('startDate', '<=', tomorrow)
        .where('endDate', '>=', tomorrow)
        .get();

      if (eventsSnapshot.empty) continue;

      const statusCollectionPath = `crews/${crewId}/statuses/${tomorrow}/userStatuses`;

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

          if (userStatus === false) {
            console.log(`User ${memberId} opted out (status is false) for event ${eventId} on ${tomorrow}. Skipping notification.`);
            continue;
          }

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

          const expoPushTokens: string[] = [];
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

          let notificationBody = '';
          let targetScreen = '';
          let additionalData = {};

          if (userStatus === true) {
            notificationBody = `${eventTitle} is happening tomorrow. Join the chat!`;
            targetScreen = 'CrewDateChat';
            additionalData = { chatId: `${crewId}_${tomorrow}`, crewId, date: tomorrow, eventId };
          } else {
            notificationBody = `${eventTitle} is happening tomorrow. Set your availability to let your crew know if you can make it!`;
            targetScreen = 'Crew';
            additionalData = { crewId, date: tomorrow, eventId };
          }

          const messages = expoPushTokens.map((token) => ({
            to: token, sound: 'default' as const, title: crewName, body: notificationBody, data: { screen: targetScreen, ...additionalData },
          }));
          try {
            await sendExpoNotifications(messages);
            totalNotificationsSent += messages.length;
          } catch (notificationError) {
            console.error(`Error sending notification to user ${memberId} for event ${eventId}:`, notificationError);
          }
        }
      }
    }

    console.log(`Finished notifyUsersAboutTomorrowsEvents run. Total notifications sent: ${totalNotificationsSent}`);
    return;
  } catch (error) {
    console.error('Error running notifyUsersAboutTomorrowsEvents:', error);
    return;
  }
});
