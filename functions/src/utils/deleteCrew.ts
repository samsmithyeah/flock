// functions/src/utils/deleteCrew.ts

import { https } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

interface DeleteCrewData {
  crewId: string;
}

export const deleteCrew = https.onCall(async (request: https.CallableRequest<DeleteCrewData>) => {
  const { data, auth } = request;

  console.log('deleteCrew called with data:', data);
  console.log('deleteCrew called with auth:', auth);

  // Authentication check
  if (!auth || !auth.uid) {
    console.error('Unauthenticated or missing auth.uid in request.');
    throw new https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const { crewId } = data;

  if (!crewId) {
    throw new https.HttpsError(
      'invalid-argument',
      'The function must be called with a crewId.'
    );
  }

  const crewRef = admin.firestore().collection('crews').doc(crewId);
  const crewDoc = await crewRef.get();

  if (!crewDoc.exists) {
    throw new https.HttpsError(
      'not-found',
      'Crew not found.'
    );
  }

  const crewData = crewDoc.data();

  if (!crewData) {
    throw new https.HttpsError(
      'invalid-argument',
      'Crew data is missing.'
    );
  }

  const ownerId = crewData.ownerId;

  if (ownerId !== auth.uid) {
    throw new https.HttpsError(
      'permission-denied',
      'Only the crew owner can delete the crew.'
    );
  }

  try {
    // Delete invitations
    const invitationsRef = admin.firestore().collection('invitations').where('crewId', '==', crewId);
    const invitationsSnapshot = await invitationsRef.get();

    const batch = admin.firestore().batch();
    invitationsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    // Delete crew ID from each crew member's crew order
    const membersRef = admin.firestore().collection('users').where('crewOrder', 'array-contains', crewId);
    const membersSnapshot = await membersRef.get();
    membersSnapshot.forEach((doc) => {
      const userRef = admin.firestore().collection('users').doc(doc.id);
      userRef.update({
        crewOrder: admin.firestore.FieldValue.arrayRemove(crewId),
      });
    });

    // Recursively delete the crew document
    await admin.firestore().recursiveDelete(crewRef);

    return { success: true };
  } catch (error) {
    console.error('Error deleting crew:', error);
    throw new https.HttpsError(
      'unknown',
      'An error occurred while deleting the crew.'
    );
  }
});
