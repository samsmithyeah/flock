// context/InvitationsContext.tsx

import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
  useCallback,
} from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { Alert } from 'react-native';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { Crew } from '@/types/Crew';
import { User } from '@/types/User';
import { InvitationWithDetails, Invitation } from '@/types/Invitation';
import Toast from 'react-native-toast-message';
import { useCrews } from '@/context/CrewsContext';
import { useContacts } from '@/context/ContactsContext';
import { router } from 'expo-router';

interface InvitationsContextType {
  invitations: InvitationWithDetails[];
  pendingCount: number;
  loading: boolean;
  acceptInvitation: (invitation: InvitationWithDetails) => Promise<void>;
  declineInvitation: (invitation: InvitationWithDetails) => Promise<void>;
}

const InvitationsContext = createContext<InvitationsContextType | undefined>(
  undefined,
);

type InvitationsProviderProps = {
  children: ReactNode;
};

export const InvitationsProvider: React.FC<InvitationsProviderProps> = ({
  children,
}) => {
  const { user } = useUser();
  const { setCrews, setCrewIds } = useCrews();
  const { refreshCrewContacts } = useContacts();
  const [invitations, setInvitations] = useState<InvitationWithDetails[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [crewsCache, setCrewsCache] = useState<{ [key: string]: Crew }>({});
  const [usersCache, setUsersCache] = useState<{ [key: string]: User }>({});

  useEffect(() => {
    if (!user?.uid) {
      console.log('User not logged in. Clearing invitations.');
      setInvitations([]);
      setLoading(false);
      return;
    }

    // Reference to the invitations collection
    const invitationsRef = collection(db, 'invitations');

    // Query to get pending invitations for the user
    const q = query(
      invitationsRef,
      where('toUserId', '==', user.uid),
      where('status', '==', 'pending'),
    );

    // Real-time listener
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const invitationsList: Invitation[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Invitation, 'id'>),
        }));

        // Extract unique crewIds and fromUserIds
        const uniqueCrewIds = Array.from(
          new Set(invitationsList.map((inv) => inv.crewId)),
        );
        const uniqueFromUserIds = Array.from(
          new Set(invitationsList.map((inv) => inv.fromUserId)),
        );

        // Fetch crew details
        const newCrewsCache = { ...crewsCache };
        await Promise.all(
          uniqueCrewIds.map(async (crewId) => {
            if (!newCrewsCache[crewId]) {
              const crewSnap = await getDoc(doc(db, 'crews', crewId));
              if (crewSnap.exists()) {
                const crewData = crewSnap.data();
                newCrewsCache[crewId] = {
                  id: crewSnap.id,
                  name: crewData.name,
                  ownerId: crewData.ownerId,
                  memberIds: crewData.memberIds,
                  iconUrl: crewData.iconUrl,
                  activity: crewData.activity,
                };
              } else {
                newCrewsCache[crewId] = {
                  id: crewId,
                  name: 'Unknown Crew',
                  ownerId: '',
                  memberIds: [],
                  iconUrl: '',
                  activity: '',
                };
              }
            }
          }),
        );

        setCrewsCache(newCrewsCache);

        // Fetch inviter details
        const newUsersCache = { ...usersCache };
        await Promise.all(
          uniqueFromUserIds.map(async (userId) => {
            if (!newUsersCache[userId]) {
              const userSnap = await getDoc(doc(db, 'users', userId));
              if (userSnap.exists()) {
                const userData = userSnap.data();
                newUsersCache[userId] = {
                  uid: userSnap.id,
                  displayName: userData.displayName,
                  firstName: userData.firstName,
                  lastName: userData.lastName,
                  email: userData.email,
                  photoURL: userData.photoURL,
                };
              } else {
                newUsersCache[userId] = {
                  uid: userId,
                  displayName: 'Unknown User',
                  email: '',
                };
              }
            }
          }),
        );

        setUsersCache(newUsersCache);

        // Combine invitation with crew and inviter details
        const invitationsWithDetails: InvitationWithDetails[] =
          invitationsList.map((inv) => ({
            ...inv,
            crew: newCrewsCache[inv.crewId],
            inviter: newUsersCache[inv.fromUserId],
          }));

        setInvitations(invitationsWithDetails);
        setLoading(false);
      },
      (error) => {
        if (!user) return;
        if (error.code === 'permission-denied') return;
        console.error('Error fetching invitations:', error);
        setLoading(false);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not fetch invitations',
        });
      },
    );

    return () => unsubscribe();
  }, [user?.uid, crewsCache, usersCache]);

  // Function to accept an invitation
  const acceptInvitation = useCallback(
    async (invitation: InvitationWithDetails) => {
      if (!user) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'User not authenticated',
        });
        return;
      }

      try {
        // First verify the invitation is still valid
        const invitationRef = doc(db, 'invitations', invitation.id);
        const invitationSnap = await getDoc(invitationRef);

        if (
          !invitationSnap.exists() ||
          invitationSnap.data().status !== 'pending'
        ) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Invitation is no longer valid',
          });
          return;
        }

        // Reference to the crew document
        const crewRef = doc(db, 'crews', invitation.crewId);
        const crewSnap = await getDoc(crewRef);

        if (!crewSnap.exists()) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Crew not found',
          });
          return;
        }

        // Update the crew's memberIds first
        await updateDoc(crewRef, {
          memberIds: arrayUnion(user.uid),
          invitationId: invitation.id,
        });

        // Update the invitation status next
        await updateDoc(invitationRef, {
          status: 'accepted',
        });

        // Small delay to ensure Firestore recognizes the user as a crew member
        await new Promise((resolve) => setTimeout(resolve, 500));

        try {
          // Initialize last read timestamp for user in crew chat
          const chatMetadataRef = doc(
            db,
            'crews',
            invitation.crewId,
            'messages',
            'metadata',
          );
          await setDoc(
            chatMetadataRef,
            {
              lastRead: {
                [user.uid]: serverTimestamp(),
              },
            },
            { merge: true },
          );
        } catch (metadataError) {
          // Don't fail the whole process if metadata update fails
          console.error('Error updating chat metadata:', metadataError);
          // Continue with the flow despite this error
        }

        // Update local state
        setCrews((prevCrews) => [
          ...prevCrews,
          {
            id: crewRef.id,
            name: crewSnap.data()?.name || 'Unknown Crew',
            ownerId: crewSnap.data()?.ownerId || '',
            memberIds: crewSnap.data()?.memberIds || [],
            activity: crewSnap.data()?.activity || '',
          },
        ]);
        setCrewIds((prevIds: string[]) => [...prevIds, crewRef.id]);

        // Refresh crew contacts to include members from the new crew
        await refreshCrewContacts();

        Toast.show({
          type: 'success',
          text1: 'Invitation accepted',
          text2: `You have joined ${invitation.crew?.name}`,
        });
        router.push(
          {
            pathname: '/crews/[crewId]',
            params: { crewId: invitation.crewId },
          },
          { withAnchor: true },
        );
      } catch (error) {
        console.error('Error accepting invitation:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not accept invitation',
        });
      }
    },
    [user, setCrews, setCrewIds, refreshCrewContacts],
  );

  // Function to decline an invitation
  const declineInvitation = async (invitation: InvitationWithDetails) => {
    try {
      // Update the invitation status
      const invitationRef = doc(db, 'invitations', invitation.id);
      await updateDoc(invitationRef, {
        status: 'declined',
      });

      Toast.show({
        type: 'info',
        text1: 'Invitation declined',
        text2: `You have declined the invitation to ${invitation.crew?.name}`,
      });
    } catch (error) {
      console.error('Error declining invitation:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'User not authenticated',
      });
      return;
    }

    // Show confirmation alert
    Alert.alert(
      'Accept invitation',
      `Are you sure you want to join ${invitation.crew?.name}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Accept',
          style: 'default',
          onPress: async () => {
            try {
              // Reference to the crew document
              const crewRef = doc(db, 'crews', invitation.crewId);
              const crewSnap = await getDoc(crewRef);

              if (!crewSnap.exists()) {
                Toast.show({
                  type: 'error',
                  text1: 'Error',
                  text2: 'Crew not found',
                });
                return;
              }

              // Update the crew's memberIds and include the invitationId
              await updateDoc(crewRef, {
                memberIds: arrayUnion(user.uid),
                invitationId: invitation.id,
              });

              // Initialize last read timestamp for user in crew chat
              const chatMetadataRef = doc(
                db,
                'crews',
                invitation.crewId,
                'messages',
                'metadata',
              );
              await setDoc(
                chatMetadataRef,
                {
                  [`lastRead.${user.uid}`]: serverTimestamp(),
                },
                { merge: true },
              );

              // Update the invitation status
              const invitationRef = doc(db, 'invitations', invitation.id);
              await updateDoc(invitationRef, {
                status: 'accepted',
              });

              // Update local state
              setCrews((prevCrews) => [
                ...prevCrews,
                {
                  id: crewRef.id,
                  name: crewSnap.data()?.name || 'Unknown Crew',
                  ownerId: crewSnap.data()?.ownerId || '',
                  memberIds: crewSnap.data()?.memberIds || [],
                  activity: crewSnap.data()?.activity || '',
                },
              ]);
              setCrewIds((prevIds: string[]) => [...prevIds, crewRef.id]);

              // Refresh crew contacts to include members from the new crew
              await refreshCrewContacts();

              Toast.show({
                type: 'success',
                text1: 'Invitation accepted',
                text2: `You have joined ${invitation.crew?.name}`,
              });
              router.push(
                {
                  pathname: '/crews/[crewId]',
                  params: { crewId: invitation.crewId },
                },
                { withAnchor: true },
              );
            } catch (error) {
              console.error('Error accepting invitation:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Could not accept invitation',
              });
            }
          },
        },
      ],
    );
  };

  // Function to decline an invitation
  const declineInvitation = async (invitation: InvitationWithDetails) => {
    // Show confirmation alert
    Alert.alert(
      'Decline invitation',
      `Are you sure you want to decline the invitation to join ${invitation.crew?.name}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              // Update the invitation status
              const invitationRef = doc(db, 'invitations', invitation.id);
              await updateDoc(invitationRef, {
                status: 'declined',
              });

              Toast.show({
                type: 'info',
                text1: 'Invitation declined',
                text2: `You have declined the invitation to ${invitation.crew?.name}`,
              });
            } catch (error) {
              console.error('Error declining invitation:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Could not decline invitation',
              });
            }
          },
        },
      ],
    );
  };

  const pendingCount = invitations.length;

  return (
    <InvitationsContext.Provider
      value={{
        invitations,
        pendingCount,
        loading,
        acceptInvitation,
        declineInvitation,
      }}
    >
      {children}
    </InvitationsContext.Provider>
  );
};

export const useInvitations = () => {
  const context = useContext(InvitationsContext);
  if (context === undefined) {
    throw new Error(
      'useInvitations must be used within an InvitationsProvider',
    );
  }
  return context;
};
