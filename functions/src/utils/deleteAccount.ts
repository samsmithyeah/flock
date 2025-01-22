import { https } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

interface DeleteAccountData {
  targetUserId?: string; // optional parameter
}

export const deleteAccount = https.onCall(async (request: https.CallableRequest<DeleteAccountData>) => {
  console.log('deleteAccount called with data:', request.data);
  console.log('deleteAccount called with auth:', request.auth);

  const { auth } = request;
  if (!auth || !auth.uid) {
    throw new https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  // Check if caller is admin
  const isAdmin = auth.token?.admin === true;
  const callerUid = auth.uid;
  const targetUserId = request.data?.targetUserId;

  // Determine which user we are deleting
  let userIdToDelete = callerUid;

  // If a targetUserId is provided, only admins can delete
  if (targetUserId) {
    if (!isAdmin) {
      throw new https.HttpsError('permission-denied', 'Only admins can delete other users.');
    }
    userIdToDelete = targetUserId;
  }

  const db = admin.firestore();

  try {
    // ----------------------------------------
    // 1. Anonymize Direct Messages
    // ----------------------------------------
    const dmQuery = db
      .collection('direct_messages')
      .where('participants', 'array-contains', userIdToDelete);
    const dmSnap = await dmQuery.get();

    for (const dmDoc of dmSnap.docs) {
      const dmRef = dmDoc.ref;
      const dmData = dmDoc.data();

      // Remove user from participants
      const participants = dmData.participants || [];
      const updatedParticipants = participants.filter((p: string) => p !== userIdToDelete);
      await dmRef.update({ participants: updatedParticipants });

      // Overwrite the senderId in messages
      const messagesRef = dmRef.collection('messages');
      const messagesSnap = await messagesRef.where('senderId', '==', userIdToDelete).get();

      const batch = db.batch();
      messagesSnap.forEach((msgDoc) => {
        batch.update(msgDoc.ref, { senderId: 'deleted-user' });
      });
      await batch.commit();
    }

    // ----------------------------------------
    // 2. Anonymize Crew Date Chats
    // ----------------------------------------
    const crewChatQuery = db
      .collection('crew_date_chats')
      .where('memberIds', 'array-contains', userIdToDelete);
    const crewChatSnap = await crewChatQuery.get();

    for (const chatDoc of crewChatSnap.docs) {
      const chatRef = chatDoc.ref;
      const chatData = chatDoc.data();

      // Remove user from memberIds
      const memberIds = chatData.memberIds || [];
      const updatedMemberIds = memberIds.filter((m: string) => m !== userIdToDelete);
      await chatRef.update({ memberIds: updatedMemberIds });

      // Overwrite the senderId in messages
      const messagesRef = chatRef.collection('messages');
      const messagesSnap = await messagesRef.where('senderId', '==', userIdToDelete).get();

      const batch = db.batch();
      messagesSnap.forEach((msgDoc) => {
        batch.update(msgDoc.ref, { senderId: 'deleted-user' });
      });
      await batch.commit();
    }

    // ----------------------------------------
    // 3. Remove from Crews
    // ----------------------------------------
    const crewQuery = db
      .collection('crews')
      .where('memberIds', 'array-contains', userIdToDelete);
    const crewSnap = await crewQuery.get();

    for (const crewDoc of crewSnap.docs) {
      const crewRef = crewDoc.ref;
      const crewData = crewDoc.data();

      const memberIds = crewData.memberIds || [];
      const updatedMemberIds = memberIds.filter((id: string) => id !== userIdToDelete);
      await crewRef.update({ memberIds: updatedMemberIds });
    }

    // Remove them as owner if they own any crews
    const ownerQuery = db
      .collection('crews')
      .where('ownerId', '==', userIdToDelete);
    const ownerSnap = await ownerQuery.get();

    for (const crewDoc of ownerSnap.docs) {
      const crewRef = crewDoc.ref;
      // Example logic: disband the crew or transfer ownership
      // Here we simply set a placeholder:
      await crewRef.update({ ownerId: 'deleted-user' });
    }

    // ----------------------------------------
    // 4. Remove Invitations
    // ----------------------------------------
    const fromInvites = db
      .collection('invitations')
      .where('fromUserId', '==', userIdToDelete);
    const toInvites = db
      .collection('invitations')
      .where('toUserId', '==', userIdToDelete);

    const [fromSnap, toSnap] = await Promise.all([fromInvites.get(), toInvites.get()]);

    const deletePromises: Promise<FirebaseFirestore.WriteResult>[] = [];
    fromSnap.forEach((doc) => deletePromises.push(doc.ref.delete()));
    toSnap.forEach((doc) => deletePromises.push(doc.ref.delete()));
    await Promise.all(deletePromises);

    // ----------------------------------------
    // 5. Delete (or Mark) User Doc
    // ----------------------------------------
    const userRef = db.collection('users').doc(userIdToDelete);
    await userRef.delete();
    // Alternatively:
    // await userRef.set({ deleted: true, ...otherFields }, { merge: true });

    // ----------------------------------------
    // 6. Delete from Firebase Auth
    // ----------------------------------------
    await admin.auth().deleteUser(userIdToDelete);

    return { success: true, deletedUserId: userIdToDelete };
  } catch (error) {
    console.error('Error deleting user account:', error);
    throw new https.HttpsError('unknown', 'Failed to delete user account.');
  }
});
