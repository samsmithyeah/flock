// context/InvitationsContext.tsx

import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
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
import { db } from '../firebase';
import { useUser } from './UserContext';
import { Alert } from 'react-native';
import { Crew } from '../screens/CrewScreen';
import { User } from '../types/User';
import { InvitationWithDetails, Invitation } from '../types/Invitation';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { NavParamList } from '../navigation/AppNavigator';

interface InvitationsContextType {
  invitations: InvitationWithDetails[];
  pendingCount: number;
  loading: boolean;
  acceptInvitation: (invitation: InvitationWithDetails) => Promise<void>;
  declineInvitation: (invitation: InvitationWithDetails) => Promise<void>;
}

const InvitationsContext = createContext<InvitationsContextType | undefined>(undefined);

type InvitationsProviderProps = {
  children: ReactNode;
};

export const InvitationsProvider: React.FC<InvitationsProviderProps> = ({ children }) => {
  const { user } = useUser();
  const navigation = useNavigation<StackNavigationProp<NavParamList>>();
  const [invitations, setInvitations] = useState<InvitationWithDetails[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [crewsCache, setCrewsCache] = useState<{ [key: string]: Crew }>({});
  const [usersCache, setUsersCache] = useState<{ [key: string]: User }>({});

  useEffect(() => {
    if (!user?.uid) {
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
        const uniqueCrewIds = Array.from(new Set(invitationsList.map((inv) => inv.crewId)));
        const uniqueFromUserIds = Array.from(new Set(invitationsList.map((inv) => inv.fromUserId)));

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
                };
              } else {
                newCrewsCache[crewId] = {
                  id: crewId,
                  name: 'Unknown Crew',
                  ownerId: '',
                  memberIds: [],
                  iconUrl: '',
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
        const invitationsWithDetails: InvitationWithDetails[] = invitationsList.map((inv) => ({
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
        Alert.alert('Error', 'Could not fetch invitations');
      },
    );

    return () => unsubscribe();
  }, [user?.uid, crewsCache, usersCache]);

  // Function to accept an invitation
  const acceptInvitation = async (invitation: InvitationWithDetails) => {
    if (!user) {
      Alert.alert('Error', 'User not logged in');
      return;
    }

    try {
      // Reference to the crew document
      const crewRef = doc(db, 'crews', invitation.crewId);
      const crewSnap = await getDoc(crewRef);

      if (!crewSnap.exists()) {
        Alert.alert('Error', 'Crew does not exist');
        return;
      }

      // Update the crew's memberIds
      await updateDoc(crewRef, {
        memberIds: arrayUnion(user.uid),
      });

      // Update the invitation status
      const invitationRef = doc(db, 'invitations', invitation.id);
      await updateDoc(invitationRef, {
        status: 'accepted',
      });

      Alert.alert('Success', `You have joined ${invitation.crew?.name}`);

      navigation.navigate('CrewsStack', {
        screen: 'Crew',
        params: { crewId: invitation.crewId },
      });
      
    } catch (error) {
      console.error('Error accepting invitation:', error);
      Alert.alert('Error', 'Could not accept invitation');
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

      Alert.alert('Invitation Declined');
    } catch (error) {
      console.error('Error declining invitation:', error);
      Alert.alert('Error', 'Could not decline invitation');
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
    throw new Error('useInvitations must be used within an InvitationsProvider');
  }
  return context;
};
