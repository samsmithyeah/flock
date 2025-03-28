import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { Expo } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import moment from 'moment-timezone'; // Changed from moment to moment-timezone
import { countryToTimezone } from '../utils/timezoneHelper';

/**
 * Sends notifications to users about events happening today
 * - If user is marked available, notification links to crew-date-chat
 * - If user hasn't set availability, notification links to crew calendar
 *
 * Runs at 10:00 AM in the user's local timezone (based on their country)
 */
export const notifyUsersAboutTodaysEvents = onSchedule({
  schedule: '0 10 * * *', // Default time: 10:00 AM
  timeZone: 'Europe/London', // Default timezone (UK)
}, async () => { // Remove the unused parameter
  const db = admin.firestore();

  try {
    // Get today's date in YYYY-MM-DD format
    const today = moment().format('YYYY-MM-DD');
    console.log(`Checking for events on ${today}`);

    // Query all crews to find events for today
    const crewsSnapshot = await db.collection('crews').get();
    let totalNotificationsSent = 0;

    // Process each crew
    for (const crewDoc of crewsSnapshot.docs) {
      const crewId = crewDoc.id;
      const crewData = crewDoc.data();
      const crewName = crewData.name || 'Your Crew';
      const memberIds = crewData.memberIds || [];

      if (memberIds.length === 0) {
        continue;
      }

      // Find events for today in this crew
      const eventsSnapshot = await db.collection('crews')
        .doc(crewId)
        .collection('events')
        .where('startDate', '<=', today)
        .where('endDate', '>=', today)
        .get();

      if (eventsSnapshot.empty) {
        continue;
      }

      // Process each event
      for (const eventDoc of eventsSnapshot.docs) {
        const eventData = eventDoc.data();
        const eventTitle = eventData.title || 'Untitled Event';

        console.log(`Found event "${eventTitle}" for crew "${crewName}" today`);

        // Get status data for today's date
        const statusDocRef = db.collection('crews')
          .doc(crewId)
          .collection('statuses')
          .doc(today);

        const statusDoc = await statusDocRef.get();
        const userStatusesExist = statusDoc.exists;

        // Process notifications for each member
        for (const memberId of memberIds) {
          let userStatus = null;

          // Check if the user has set availability
          if (userStatusesExist) {
            const userStatusRef = statusDocRef.collection('userStatuses').doc(memberId);
            const userStatusDoc = await userStatusRef.get();

            if (userStatusDoc.exists) {
              const userStatusData = userStatusDoc.data();
              userStatus = userStatusData?.upForGoingOutTonight;
            }
          }

          // Get user data for push tokens and timezone
          const userDoc = await db.collection('users').doc(memberId).get();

          if (!userDoc.exists) {
            continue;
          }

          const userData = userDoc.data();

          // Get user's timezone from their country
          const countryCode = userData?.country;
          const userTimezone = countryCode ? countryToTimezone(countryCode) : 'Europe/London';

          // Get current time in user's timezone
          const userLocalTime = moment().tz(userTimezone);
          const userHour = userLocalTime.hour();

          // Only send notification if it's morning in user's timezone (between 8am-12pm)
          // This prevents sending notifications at inappropriate times
          if (userHour < 8 || userHour > 12) {
            console.log(`Skipping notification for user ${memberId} as local time (${userHour}:00) is outside 8am-12pm range`);
            continue;
          }

          const expoPushTokens = [];

          // Collect push tokens
          if (userData?.expoPushToken && Expo.isExpoPushToken(userData.expoPushToken)) {
            expoPushTokens.push(userData.expoPushToken);
          }

          if (userData?.expoPushTokens && Array.isArray(userData.expoPushTokens)) {
            for (const token of userData.expoPushTokens) {
              if (Expo.isExpoPushToken(token)) {
                expoPushTokens.push(token);
              }
            }
          }

          if (expoPushTokens.length === 0) {
            continue;
          }

          // Determine notification content based on availability status
          let notificationBody = '';
          let targetScreen = '';
          let additionalData = {};

          if (userStatus === true) {
            // User is marked as available
            notificationBody = `${eventTitle} is happening today! Join the chat to finalise the details.`;
            targetScreen = 'CrewDateChat';
            additionalData = {
              chatId: `${crewId}_${today}`,
              crewId, // Add crewId separately for consistency
              date: today, // Add date separately for consistency
              eventId: eventDoc.id,
            };
          } else {
            // User hasn't set availability or is marked as unavailable
            notificationBody = `${eventTitle} is happening today! Let your crew know if you're joining.`;
            targetScreen = 'Crew';
            additionalData = {
              crewId,
              date: today,
              eventId: eventDoc.id,
            };
          }

          // Create notification messages
          const messages = expoPushTokens.map((token) => ({
            to: token,
            sound: 'default' as const,
            title: crewName, // Use crew name as title for consistency with other notifications
            body: notificationBody,
            data: {
              screen: targetScreen,
              ...additionalData,
            },
          }));

          // Send notifications
          await sendExpoNotifications(messages);
          totalNotificationsSent += messages.length;

          console.log(`Sent ${messages.length} notifications to user ${memberId} about today's event (local time: ${userHour}:00)`);
        }
      }
    }

    console.log(`Total notifications sent for today's events: ${totalNotificationsSent}`);
    return;
  } catch (error) {
    console.error('Error sending today\'s event notifications:', error);
    return;
  }
});
