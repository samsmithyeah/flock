// functions/src/notifyContactsOnNewUser.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';

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

    console.log('New user data:', afterData);

    if (!beforeData.hashedPhoneNumber && afterData.hashedPhoneNumber) {
      console.log('Hashed phone number added. Firing notifications.');

      const newUserHashed = afterData.hashedPhoneNumber;

      // Query all users whose stored hashedContacts contain this new user's hash.
      const usersRef = admin.firestore().collection('users');
      const querySnapshot = await usersRef
        .where('hashedContacts', 'array-contains', newUserHashed)
        .get();

      // Exclude self-notifications.
      const pushTokens: string[] = [];
      querySnapshot.forEach((doc) => {
        if (doc.id !== event.params.uid) {
          const userData = doc.data();
          if (userData.expoPushToken && Expo.isExpoPushToken(userData.expoPushToken)) {
            pushTokens.push(userData.expoPushToken);
          }
        }
      });

      if (pushTokens.length === 0) {
        console.log('No contacts to notify.');
        return null;
      }

      const messages: ExpoPushMessage[] = pushTokens.map((token) => ({
        to: token,
        sound: 'default',
        title: `${afterData.displayName || 'A friend'} just joined Flock!`,
        body: 'Send them a message to say hi 💬',
        data: { senderId: event.params.uid, screen: 'DMChat' },
      }));

      await sendExpoNotifications(messages);
      console.log(`Notified ${pushTokens.length} contacts.`);
    } else {
      console.log('No change in hashedPhoneNumber; not firing notifications.');
    }
    return null;
  });
