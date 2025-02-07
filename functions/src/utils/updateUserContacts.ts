// functions/src/updateUserContacts.ts
import { https } from 'firebase-functions/v2';
import { defineString } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const PHONE_PEPPER = defineString('PHONE_PEPPER').value();

const hashPhoneNumber = (phone: string): string => {
  return crypto.createHmac('sha256', PHONE_PEPPER).update(phone).digest('hex');
};

export const updateUserContacts = https.onCall(async (request: https.CallableRequest) => {
  const { data, auth } = request;
  if (!auth) {
    throw new https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  if (!data.phoneNumbers || !Array.isArray(data.phoneNumbers)) {
    throw new https.HttpsError('invalid-argument', 'phoneNumbers must be an array.');
  }

  // Assume the numbers are already sanitized (E.164 format)
  const sanitizedNumbers: string[] = data.phoneNumbers;
  const hashedContacts = sanitizedNumbers.map(hashPhoneNumber);

  // You can store these hashed contacts in the user's document,
  // or in a separate collection (e.g. "userContacts" with document id = user uid)
  const uid = auth.uid;
  await admin.firestore().collection('users').doc(uid).update({
    hashedContacts,
  });
  return { success: true };
});
