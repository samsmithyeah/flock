import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';

interface SignalResponseData {
  signalId: string;
  response: 'accept' | 'ignore';
  location?: {
    latitude: number;
    longitude: number;
  };
}

interface SignalResponseResult {
  success: boolean;
  message: string;
}

interface SignalResponse {
  id: string;
  signalId: string;
  responderId: string;
  responderName?: string;
  response: 'accept' | 'ignore';
  location?: {
    latitude: number;
    longitude: number;
  };
  respondedAt: admin.firestore.Timestamp;
}

export const respondToSignal = functions.https.onCall(
  async (request): Promise<SignalResponseResult> => {
    const { auth, data } = request;

    if (!auth || !auth.uid) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.',
      );
    }

    const { signalId, response, location }: SignalResponseData = data;

    if (!signalId || !response || !['accept', 'ignore'].includes(response)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Valid signalId and response (accept/ignore) are required.',
      );
    }

    if (response === 'accept' && (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number')) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Location is required when accepting a signal.',
      );
    }

    const db = admin.firestore();

    try {
      // Get the signal document
      const signalRef = db.collection('signals').doc(signalId);
      const signalDoc = await signalRef.get();

      if (!signalDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Signal not found.');
      }

      const signalData = signalDoc.data();
      if (!signalData) {
        throw new functions.https.HttpsError('invalid-argument', 'Signal data is invalid.');
      }

      // Check if signal is still active
      if (signalData.status !== 'active') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'This signal is no longer active.',
        );
      }

      // Check if signal has expired
      const now = admin.firestore.Timestamp.now();
      if (signalData.expiresAt && signalData.expiresAt.toMillis() < now.toMillis()) {
        // Update signal status to expired
        await signalRef.update({ status: 'expired' });
        throw new functions.https.HttpsError(
          'failed-precondition',
          'This signal has expired.',
        );
      }

      // Check if user has already responded
      const existingResponses = signalData.responses || [];
      const existingResponse = existingResponses.find((r: SignalResponse) => r.responderId === auth.uid);
      if (existingResponse) {
        return {
          success: false,
          message: 'You have already responded to this signal.',
        };
      }

      // Get responder information
      const responderDoc = await db.collection('users').doc(auth.uid).get();
      if (!responderDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Responder user not found.');
      }

      const responderData = responderDoc.data();
      const responderName = responderData?.displayName || 'Someone';

      // Create response object
      const responseData = {
        id: db.collection('signalResponses').doc().id,
        signalId,
        responderId: auth.uid,
        responderName,
        response,
        location: response === 'accept' ? location : undefined,
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Update signal with new response
      await signalRef.update({
        responses: admin.firestore.FieldValue.arrayUnion(responseData),
      });

      // If accepting, create a mutual location sharing session
      if (response === 'accept' && location) {
        const locationSharingData = {
          signalId,
          senderId: signalData.senderId,
          responderId: auth.uid,
          senderLocation: signalData.location,
          responderLocation: location,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          status: 'active',
        };

        await db.collection('locationSharing').add(locationSharingData);
      }

      // Send notification to signal sender
      const senderDoc = await db.collection('users').doc(signalData.senderId).get();
      if (senderDoc.exists) {
        const senderData = senderDoc.data();
        const expoPushTokens: string[] = [];

        // Collect sender's push tokens
        if (senderData?.expoPushToken && Expo.isExpoPushToken(senderData.expoPushToken)) {
          expoPushTokens.push(senderData.expoPushToken);
        }
        if (senderData?.expoPushTokens && Array.isArray(senderData.expoPushTokens)) {
          senderData.expoPushTokens.forEach((token: string) => {
            if (Expo.isExpoPushToken(token)) {
              expoPushTokens.push(token);
            }
          });
        }

        if (expoPushTokens.length > 0) {
          const notificationTitle = response === 'accept' ?
            '🎉 Someone accepted your signal!' :
            '📱 Someone saw your signal';

          const notificationBody = response === 'accept' ?
            `${responderName} wants to meet up! Check the app to see their location.` :
            `${responderName} saw your signal.`;

          const messages: ExpoPushMessage[] = expoPushTokens.map((token) => ({
            to: token,
            sound: 'default',
            title: notificationTitle,
            body: notificationBody,
            data: {
              type: 'signal_response',
              signalId,
              responderId: auth.uid,
              responderName,
              response,
              screen: 'Signal',
            },
            priority: response === 'accept' ? 'high' : 'normal',
          }));

          await sendExpoNotifications(messages);
        }
      }

      const successMessage = response === 'accept' ?
        'You accepted the signal! Your location has been shared.' :
        'Signal ignored.';

      return {
        success: true,
        message: successMessage,
      };
    } catch (error) {
      console.error('Error responding to signal:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to respond to signal.',
      );
    }
  },
);

export const getLocationSharing = functions.https.onCall(
  async (request) => {
    const { auth, data } = request;

    if (!auth || !auth.uid) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.',
      );
    }

    const { signalId } = data;

    if (!signalId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Signal ID is required.',
      );
    }

    const db = admin.firestore();

    try {
      // Get active location sharing for this signal and user
      const locationSharingSnapshot = await db.collection('locationSharing')
        .where('signalId', '==', signalId)
        .where('status', '==', 'active')
        .get();

      const locationSharing = locationSharingSnapshot.docs.find((doc) => {
        const data = doc.data();
        return data.senderId === auth.uid || data.responderId === auth.uid;
      });

      if (!locationSharing) {
        return { success: false, message: 'No active location sharing found.' };
      }

      const data = locationSharing.data();

      // Check if expired
      const now = admin.firestore.Timestamp.now();
      if (data.expiresAt && data.expiresAt.toMillis() < now.toMillis()) {
        // Update status to expired
        await locationSharing.ref.update({ status: 'expired' });
        return { success: false, message: 'Location sharing has expired.' };
      }

      // Return appropriate location based on user role
      const otherUserLocation = auth.uid === data.senderId ?
        data.responderLocation :
        data.senderLocation;

      const otherUserId = auth.uid === data.senderId ?
        data.responderId :
        data.senderId;

      // Get other user's name
      const otherUserDoc = await db.collection('users').doc(otherUserId).get();
      const otherUserName = otherUserDoc.exists ?
        otherUserDoc.data()?.displayName || 'Unknown' :
        'Unknown';

      return {
        success: true,
        data: {
          otherUserLocation,
          otherUserId,
          otherUserName,
          expiresAt: data.expiresAt,
        },
      };
    } catch (error) {
      console.error('Error getting location sharing:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get location sharing data.',
      );
    }
  },
);
