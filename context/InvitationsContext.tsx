// context/InvitationsContext.tsx

import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
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
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { Crew } from '@/types/Crew';
import { User } from '@/types/User';
import { InvitationWithDetails, Invitation } from '@/types/Invitation';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { NavParamList } from '@/navigation/AppNavigator';
import Toast from 'react-native-toast-message';
import { useCrews } from '@/context/CrewsContext';

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
  const navigation = useNavigation<StackNavigationProp<NavParamList>>();
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
  const acceptInvitation = async (invitation: InvitationWithDetails) => {
    if (!user) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'User not authenticated',
      });
      return;
    }

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

      Toast.show({
        type: 'success',
        text1: 'Invitation accepted',
        text2: `You have joined ${invitation.crew?.name}`,
      });

      navigation.navigate('CrewsStack', {
        screen: 'Crew',
        params: { crewId: invitation.crewId },
        initial: false,
      });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not accept invitation',
      });
    }
  };

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
        text2: 'Could not decline invitation',
      });
    }
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
