// functions/src/updatePhoneNumberHash.ts
import { https } from 'firebase-functions/v2';
import { defineString } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const PHONE_PEPPER = defineString('PHONE_PEPPER').value();

const hashPhoneNumber = (phone: string): string => {
  return crypto.createHmac('sha256', PHONE_PEPPER).update(phone).digest('hex');
};

export const updatePhoneNumberHash = https.onCall(async (request: https.CallableRequest) => {
  const { data, auth } = request;
  if (!auth) {
    throw new https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const phoneNumber = data.phoneNumber;
  if (!phoneNumber) {
    throw new https.HttpsError('invalid-argument', 'phoneNumber is required.');
  }
  const hashedPhoneNumber = hashPhoneNumber(phoneNumber);
  const uid = auth.uid;
  await admin.firestore().collection('users').doc(uid).update({
    hashedPhoneNumber,
  });
  return { success: true };
});
