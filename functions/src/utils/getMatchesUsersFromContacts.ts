// functions/src/getMatchedUsersFromContacts.ts
import { https } from 'firebase-functions/v2';
import { defineString } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const PHONE_PEPPER = defineString('PHONE_PEPPER').value();

const hashPhoneNumber = (phone: string): string => {
  return crypto.createHmac('sha256', PHONE_PEPPER).update(phone).digest('hex');
};

export const getMatchedUsersFromContacts = https.onCall(async (request: https.CallableRequest) => {
  const { data } = request;
  if (!data.phoneNumbers || !Array.isArray(data.phoneNumbers)) {
    throw new https.HttpsError(
      'invalid-argument',
      'phoneNumbers must be an array'
    );
  }
  const phoneNumbers: string[] = data.phoneNumbers;
  // Compute hashes for all provided phone numbers.
  const hashedNumbers = phoneNumbers.map(hashPhoneNumber);
  const usersRef = admin.firestore().collection('users');
  const matchedUsers: any[] = [];
  const batchSize = 10;

  // Firestore "in" queries allow max 10 elements. Process in batches.
  for (let i = 0; i < hashedNumbers.length; i += batchSize) {
    const batch = hashedNumbers.slice(i, i + batchSize);
    const snapshot = await usersRef.where('hashedPhoneNumber', 'in', batch).get();
    snapshot.forEach((doc) => {
      matchedUsers.push({ uid: doc.id, ...doc.data() });
    });
  }
  return { matchedUsers };
});
