// functions/src/phoneVerification.ts

import { https } from 'firebase-functions/v2';
import { defineString } from 'firebase-functions/params';
import twilio from 'twilio';

interface SendCodeData {
  phone: string;
}

interface VerifyCodeData {
  phone: string;
  code: string;
}
const accountSid = defineString('TWILIO_ACCOUNT_SID');
const authToken = defineString('TWILIO_AUTH_TOKEN');
const verifyServiceSid = defineString('TWILIO_VERIFY_SID');

const client = twilio(accountSid.value(), authToken.value());

/**
 * sendCode
 * A callable function that requests Twilio to send a code to the user’s phone.
 */
export const sendCode = https.onCall<SendCodeData>(async (request) => {
  const { data, auth } = request;
  const { phone } = data;

  console.log('sendCode called with data:', data);
  console.log('sendCode called with auth:', auth);

  // [Optional] If you want to require the user to be authenticated:
  // if (!auth || !auth.uid) {
  //   console.error('Unauthenticated or missing auth.uid in request.');
  //   throw new https.HttpsError('unauthenticated', 'User must be authenticated to send a code.');
  // }

  if (!phone) {
    throw new https.HttpsError(
      'invalid-argument',
      'Missing phone number in request.'
    );
  }

  try {
    // Create a verification via Twilio’s Verify Service
    const verification = await client.verify.v2
      .services(verifyServiceSid.value())
      .verifications.create({
        to: phone,
        channel: 'sms',
      });

    console.log('Twilio verification response:', verification);

    return { success: true, message: 'Verification code sent.' };
  } catch (error) {
    console.error('Error sending verification code:', error);
    throw new https.HttpsError(
      'unknown',
      'An error occurred while sending the verification code.'
    );
  }
});

/**
 * verifyCode
 * A callable function that checks the code the user entered against Twilio.
 */
export const verifyCode = https.onCall<VerifyCodeData>(async (request) => {
  const { data, auth } = request;
  const { phone, code } = data;

  console.log('verifyCode called with data:', data);
  console.log('verifyCode called with auth:', auth);

  // [Optional] If you want to require the user to be authenticated:
  // if (!auth || !auth.uid) {
  //   console.error('Unauthenticated or missing auth.uid in request.');
  //   throw new https.HttpsError('unauthenticated', 'User must be authenticated to verify a code.');
  // }

  if (!phone || !code) {
    throw new https.HttpsError(
      'invalid-argument',
      'Missing phone or code in request.'
    );
  }

  try {
    // Check the verification code using Twilio
    const verificationCheck = await client.verify.v2
      .services(verifyServiceSid.value())
      .verificationChecks.create({ to: phone, code });

    console.log('Twilio verificationCheck response:', verificationCheck);

    // Twilio returns 'approved' if the code is valid
    if (verificationCheck.status === 'approved') {
      return { success: true, message: 'Code verified successfully.' };
    } else {
      throw new https.HttpsError(
        'invalid-argument',
        'Invalid or expired verification code.'
      );
    }
  } catch (error) {
    console.error('Error verifying code:', error);
    throw new https.HttpsError(
      'unknown',
      'An error occurred while verifying the code.'
    );
  }
});
