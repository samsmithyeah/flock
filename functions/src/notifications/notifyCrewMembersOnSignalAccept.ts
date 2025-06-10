import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { ExpoPushMessage, Expo } from 'expo-server-sdk';
import { sendExpoNotifications } from '../utils/sendExpoNotifications';
import { shouldSendNotification } from '../utils/notificationSettings';

interface SignalResponse {
  id: string;
  signalId: string;
  responderId: string;
  responderName?: string;
  response: 'accept' | 'ignore';
  respondedAt: admin.firestore.Timestamp;
}

interface Signal {
  id: string;
  senderId: string;
  message?: string;
  radius: number;
  location: {
    latitude: number;
    longitude: number;
  };
  targetType: 'all' | 'crews' | 'contacts';
  targetIds: string[];
  targetCrewNames?: string[];
  createdAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
  durationMinutes?: number;
  responses: SignalResponse[];
  status: 'active' | 'expired' | 'cancelled';
}

/**
 * Notify remaining crew members when someone accepts a signal
 * This function triggers when a signal document is updated with new responses
 */
export const notifyCrewMembersOnSignalAccept = onDocumentUpdated(
  'signals/{signalId}',
  async (event) => {
    const db = admin.firestore();

    // Ensure event data exists
    if (!event.data?.before || !event.data?.after) {
      console.log('Event data is missing before or after data.');
      return null;
    }

    const beforeData = event.data.before.data() as Signal;
    const afterData = event.data.after.data() as Signal;
    const signalId = event.params.signalId;

    // Check if this is a crew-targeted signal
    if (afterData.targetType !== 'crews' || !afterData.targetIds || afterData.targetIds.length === 0) {
      console.log('Signal is not targeting crews, skipping notification.');
      return null;
    }

    // Check if the signal is still active
    if (afterData.status !== 'active') {
      console.log('Signal is not active, skipping notification.');
      return null;
    }

    // Compare responses to find new acceptances
    const beforeResponses = beforeData.responses || [];
    const afterResponses = afterData.responses || [];

    // Find new accept responses
    const newAcceptResponses = afterResponses.filter((afterResponse) => {
      // Check if this is a new response or if response changed to 'accept'
      const beforeResponse = beforeResponses.find((r) => r.responderId === afterResponse.responderId);

      if (!beforeResponse) {
        // This is a new response
        return afterResponse.response === 'accept';
      } else {
        // This is an updated response that changed to 'accept'
        return beforeResponse.response !== 'accept' && afterResponse.response === 'accept';
      }
    });

    if (newAcceptResponses.length === 0) {
      console.log('No new accept responses found.');
      return null;
    }

    try {
      // Process each new accept response
      for (const acceptResponse of newAcceptResponses) {
        await processSignalAcceptNotification(
          db,
          signalId,
          afterData,
          acceptResponse
        );
      }

      return null;
    } catch (error) {
      console.error('Error processing signal accept notifications:', error);
      return null;
    }
  }
);

/**
 * Process signal accept notification by sending push notifications to crew members
 * @param {admin.firestore.Firestore} db - Firestore database instance
 * @param {string} signalId - The ID of the signal that was accepted
 * @param {Signal} signalData - The signal document data
 * @param {SignalResponse} acceptResponse - The accept response that triggered the notification
 */
async function processSignalAcceptNotification(
  db: admin.firestore.Firestore,
  signalId: string,
  signalData: Signal,
  acceptResponse: SignalResponse
) {
  console.log(`Processing accept notification for signal ${signalId} by user ${acceptResponse.responderId}`);

  // Get the accepter's information
  const accepterDoc = await db.collection('users').doc(acceptResponse.responderId).get();
  if (!accepterDoc.exists) {
    console.log(`Accepter user ${acceptResponse.responderId} not found.`);
    return;
  }

  const accepterData = accepterDoc.data();
  const accepterName = accepterData?.displayName || 'Someone';

  // Get all crew members from the targeted crews and store crew names
  const allCrewMemberIds = new Set<string>();
  const crewIdToNameMap = new Map<string, string>();
  const memberToCrewsMap = new Map<string, string[]>();

  for (const crewId of signalData.targetIds) {
    const crewDoc = await db.collection('crews').doc(crewId).get();
    if (crewDoc.exists) {
      const crewData = crewDoc.data();
      const crewName = crewData?.name || 'Unknown Crew';
      const memberIds = crewData?.memberIds || [];

      crewIdToNameMap.set(crewId, crewName);

      memberIds.forEach((memberId: string) => {
        allCrewMemberIds.add(memberId);

        // Track which crews each member belongs to
        if (!memberToCrewsMap.has(memberId)) {
          memberToCrewsMap.set(memberId, []);
        }
        const memberCrews = memberToCrewsMap.get(memberId);
        if (memberCrews) {
          memberCrews.push(crewName);
        }
      });
    }
  }

  // Filter out the sender and the accepter from notification recipients
  const recipientIds = Array.from(allCrewMemberIds).filter(
    (memberId) => memberId !== signalData.senderId && memberId !== acceptResponse.responderId
  );

  if (recipientIds.length === 0) {
    console.log('No crew members to notify after filtering sender and accepter.');
    return;
  }

  // Fetch recipient user documents in batches and create personalized notifications
  const expoPushTokens: string[] = [];
  const recipientNotifications: Array<{
    tokens: string[];
    crewNames: string[];
  }> = [];
  const batchSize = 10;

  for (let i = 0; i < recipientIds.length; i += batchSize) {
    const batch = recipientIds.slice(i, i + batchSize);
    const usersSnapshot = await db
      .collection('users')
      .where(admin.firestore.FieldPath.documentId(), 'in', batch)
      .get();

    usersSnapshot.forEach((doc) => {
      const userData = doc.data();
      const userId = doc.id;

      // Check notification preferences
      if (!shouldSendNotification(userData.notificationSettings, 'signal_received')) {
        console.log(`User ${doc.id} has disabled signal_received notifications. Skipping.`);
        return;
      }

      // Collect push tokens for this user
      const userTokens: string[] = [];
      const singleToken = userData?.expoPushToken;
      const tokensArray = userData?.expoPushTokens;

      if (singleToken && Expo.isExpoPushToken(singleToken)) {
        userTokens.push(singleToken);
        expoPushTokens.push(singleToken);
      }

      if (tokensArray && Array.isArray(tokensArray)) {
        tokensArray.forEach((token: string) => {
          if (Expo.isExpoPushToken(token)) {
            userTokens.push(token);
            expoPushTokens.push(token);
          }
        });
      }

      // Get crew names for this user
      const userCrewNames = memberToCrewsMap.get(userId) || [];

      if (userTokens.length > 0) {
        recipientNotifications.push({
          tokens: userTokens,
          crewNames: userCrewNames,
        });
      }
    });
  }

  if (expoPushTokens.length === 0) {
    console.log('No valid Expo push tokens found for crew members.');
    return;
  }

  // Create personalized notifications for each recipient
  const allMessages: ExpoPushMessage[] = [];

  recipientNotifications.forEach(({ tokens, crewNames }) => {
    // For each crew this user belongs to that was targeted by the signal
    const relevantCrews = crewNames.filter((crewName) =>
      Array.from(crewIdToNameMap.values()).includes(crewName)
    );

    // Use the first relevant crew for the notification
    const primaryCrewName = relevantCrews[0] || crewNames[0] || 'your crew';

    // Find the crew ID for the primary crew
    let primaryCrewId = '';
    for (const [crewId, crewName] of crewIdToNameMap.entries()) {
      if (crewName === primaryCrewName) {
        primaryCrewId = crewId;
        break;
      }
    }

    // Create crew-specific notification text
    const notificationTitle = `${accepterName} accepted a signal!`;
    let notificationBody = `Someone from ${primaryCrewName} is meeting up right now. Chat with the crew to find out what's happening.`;

    // Add custom message if available
    if (signalData.message) {
      notificationBody = `"${signalData.message}" - ${notificationBody}`;
    }

    // Create messages for this recipient's tokens
    const recipientMessages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title: notificationTitle,
      body: notificationBody,
      data: {
        type: 'signal_accept',
        signalId,
        accepterId: acceptResponse.responderId,
        accepterName,
        screen: 'CrewChat',
        crewId: primaryCrewId,
      },
    }));

    allMessages.push(...recipientMessages);
  });

  await sendExpoNotifications(allMessages);
  console.log(`Sent ${allMessages.length} signal accept notifications for signal ${signalId}`);
}
