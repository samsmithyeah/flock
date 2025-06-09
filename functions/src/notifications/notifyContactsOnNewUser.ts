// functions/src/notifyContactsOnNewUser.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { shouldSendNotification } from '../utils/notificationSettings';

export const notifyContactsOnNewUser = functions.firestore
  .onDocumentUpdated('users/{uid}', async (event) => {
    const beforeData = event.data?.before.exists ?
      event.data.before.data() :
      null;
    const afterData = event.data?.after.exists ?
      event.data.after.data() :
      null;

    if (!beforeData || !afterData) {
      console.log('No data found before or after the update.');
      return null;
    }

    if (!beforeData.hashedPhoneNumber && afterData.hashedPhoneNumber) {
      console.log('New user data:', afterData);
      console.log('Hashed phone number added. Firing notifications.');

      const newUserHashed = afterData.hashedPhoneNumber;

      // Query all users whose stored hashedContacts contain this new user's hash.
      const usersRef = admin.firestore().collection('users');
      const querySnapshot = await usersRef
        .where('hashedContacts', 'array-contains', newUserHashed)
        .get();
      // Exclude self-notifications.
      const pushTokens: string[] = [];
      const contactNames: string[] = [];
      querySnapshot.forEach((doc) => {
        if (doc.id !== event.params.uid) {
          const userData = doc.data();

          // Check notification preferences
          if (!shouldSendNotification(userData.notificationSettings, 'friend_request')) {
            console.log(`User ${doc.id} has disabled friend_request notifications. Skipping.`);
            return;
          }

          if (userData.displayName) {
            contactNames.push(userData.displayName);
          }
          if (userData.expoPushToken && Expo.isExpoPushToken(userData.expoPushToken)) {
            pushTokens.push(userData.expoPushToken);
          }
        }
      });
      console.log(`Sent notifications to ${contactNames.length} users: ${contactNames.join(', ')}`);

      if (pushTokens.length === 0) {
        console.log('No contacts to notify.');
        return null;
      }

      const messages: ExpoPushMessage[] = pushTokens.map((token) => ({
        to: token,
        sound: 'default',
        title: `${afterData.displayName || 'A friend'} just joined Flock`,
        body: 'Send them a message to say hi!',
        data: { userId: event.params.uid, screen: 'OtherUserProfile' },
      }));

      await sendExpoNotifications(messages);
      console.log(`Notified ${pushTokens.length} contacts.`);
    }
    return null;
  });
