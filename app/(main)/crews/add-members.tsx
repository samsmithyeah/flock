// screens/AddMembersScreen.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  addDoc,
  getDoc,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { User } from '@/types/User';
import MemberList from '@/components/MemberList';
import CustomSearchInput from '@/components/CustomSearchInput';
import CustomButton from '@/components/CustomButton';
import CustomModal from '@/components/CustomModal';
import CustomTextInput from '@/components/CustomTextInput';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import { useContacts } from '@/context/ContactsContext';
import { useLocalSearchParams, useNavigation, router } from 'expo-router';

interface MemberWithStatus extends User {
  status?: 'member' | 'invited' | 'available';
}

const AddMembersScreen: React.FC = () => {
  const navigation = useNavigation();
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const { user } = useUser();

  const { allContacts, loading: contactsLoading } = useContacts();

  const [allPotentialMembers, setAllPotentialMembers] = useState<
    MemberWithStatus[]
  >([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [emailToAdd, setEmailToAdd] = useState<string>('');
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [invitingEmail, setInvitingEmail] = useState<boolean>(false);

  useEffect(() => {
    const fetchCrewSpecificData = async () => {
      if (!user) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'User not authenticated',
        });
        return;
      }

      try {
        // Fetch pending invitations to the crew
        const invitationsRef = collection(db, 'invitations');
        const invitationsQuery = query(
          invitationsRef,
          where('crewId', '==', crewId),
          where('status', '==', 'pending'),
        );
        const invitationsSnapshot = await getDocs(invitationsQuery);

        const invitedUserIds = invitationsSnapshot.docs.map(
          (doc) => doc.data().toUserId,
        );

        // Fetch current crew members
        const currentCrewRef = doc(db, 'crews', crewId);
        const currentCrewSnap = await getDoc(currentCrewRef);
        if (!currentCrewSnap.exists()) {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Crew not found',
          });
          return;
        }
        const currentCrewData = currentCrewSnap.data();
        const currentCrewMemberIds: string[] = currentCrewData.memberIds || [];

        // Map allContacts to include their status based on the current crew
        const membersWithStatus: MemberWithStatus[] = allContacts
          .filter((member) => member.uid !== user.uid) // Exclude the current user
          .map((member) => {
            if (currentCrewMemberIds.includes(member.uid)) {
              return { ...member, status: 'member' };
            } else if (invitedUserIds.includes(member.uid)) {
              return { ...member, status: 'invited' };
            } else {
              return { ...member, status: 'available' };
            }
          });

        setAllPotentialMembers(membersWithStatus);
      } catch (error) {
        console.error('Error fetching crew-specific data:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not fetch crew-specific data',
        });
      }
    };

    fetchCrewSpecificData();
  }, [crewId, user, allContacts]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleAddSelectedMembers}
          disabled={selectedMemberIds.length === 0}
          accessibilityLabel="Invite Selected Members to Crew"
          accessibilityHint="Invites the selected members to the crew"
        >
          <Text
            style={{
              color: selectedMemberIds.length === 0 ? '#999' : '#1e90ff',
              fontSize: 16,
              fontWeight: 'bold',
            }}
          >
            Invite
          </Text>
        </TouchableOpacity>
      ),
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Go Back"
          accessibilityHint="Navigates back to the previous screen"
        >
          <Text style={{ color: '#1e90ff', fontSize: 16 }}>Cancel</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, selectedMemberIds]);

  // Handle selection toggling
  const handleSelectMember = (member: User) => {
    setSelectedMemberIds((prevSelected) => {
      if (prevSelected.includes(member.uid)) {
        return prevSelected.filter((id) => id !== member.uid);
      }
      return [...prevSelected, member.uid];
    });
  };

  // Handle adding selected members to the crew
  const handleAddSelectedMembers = async () => {
    if (selectedMemberIds.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'No members selected',
      });
      return;
    }

    try {
      // Iterate through selectedMemberIds and send invitations
      const invitationsRef = collection(db, 'invitations');
      const batch = writeBatch(db); // Use batch writes for atomicity

      for (const memberId of selectedMemberIds) {
        // Check if there's already a pending invitation
        const existingInvitationQuery = query(
          invitationsRef,
          where('crewId', '==', crewId),
          where('toUserId', '==', memberId),
          where('status', '==', 'pending'),
        );
        const existingInvitationSnapshot = await getDocs(
          existingInvitationQuery,
        );

        if (!existingInvitationSnapshot.empty) {
          continue; // Skip if already invited
        }

        // Create an invitation
        const newInvitationRef = doc(invitationsRef);
        batch.set(newInvitationRef, {
          crewId: crewId,
          fromUserId: user?.uid,
          toUserId: memberId,
          status: 'pending',
          timestamp: new Date(),
        });
      }

      await batch.commit();

      const successMessage = () => {
        if (selectedMemberIds.length === 1) {
          return '1 member invited to the crew';
        }

        return `${selectedMemberIds.length} members invited to the crew`;
      };

      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: successMessage(),
      });
      router.replace({
        pathname: '/crews/[crewId]',
        params: { crewId },
      });
    } catch (error) {
      console.error('Error adding members:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not add members to the crew',
      });
    }
  };

  // Handle opening and closing the email invitation modal
  const openEmailModal = () => {
    setIsModalVisible(true);
  };

  const closeEmailModal = () => {
    setIsModalVisible(false);
    setEmailToAdd('');
  };

  // Handle adding a member by email from the modal
  const handleAddByEmail = async () => {
    if (!emailToAdd.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Email address cannot be empty',
      });
      return;
    }

    setInvitingEmail(true);

    try {
      // Normalize the email to lowercase
      const normalizedEmail = emailToAdd.trim().toLowerCase();

      // Find the user by email
      const usersRef = collection(db, 'users');
      const emailQuery = query(
        usersRef,
        where('email', '==', normalizedEmail),
        limit(1),
      );
      const querySnapshot = await getDocs(emailQuery);

      if (querySnapshot.empty) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'User not found with that email address',
        });
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const inviteeId = userDoc.id;

      // Prevent the user from inviting themselves
      if (inviteeId === user?.uid) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'You cannot invite yourself to the crew',
        });
        return;
      }

      // Check if the user is already a member of the crew
      const crewDoc = await getDoc(doc(db, 'crews', crewId));
      const crewData = crewDoc.data();
      const crewMemberIds: string[] = crewData?.memberIds || [];

      if (crewMemberIds.includes(inviteeId)) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'User is already a member of the crew',
        });
        return;
      }

      // Check if there's already a pending invitation
      const invitationsRef = collection(db, 'invitations');
      const existingInvitationQuery = query(
        invitationsRef,
        where('crewId', '==', crewId),
        where('toUserId', '==', inviteeId),
        where('status', '==', 'pending'),
      );
      const existingInvitationSnapshot = await getDocs(existingInvitationQuery);

      if (!existingInvitationSnapshot.empty) {
        Toast.show({
          type: 'info',
          text1: 'Already invited',
          text2: 'A pending invitation already exists for this user',
        });
        return;
      }

      // Create an invitation
      await addDoc(collection(db, 'invitations'), {
        crewId: crewId,
        fromUserId: user?.uid,
        toUserId: inviteeId,
        status: 'pending',
        timestamp: new Date(),
      });

      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Invitation sent successfully',
      });
      closeEmailModal();
      router.back();
    } catch (error) {
      console.error('Error adding member by email:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not send invitation',
      });
    } finally {
      setInvitingEmail(false);
    }
  };

  // Filtered list based on search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) {
      return allPotentialMembers;
    }

    const lowercasedQuery = searchQuery.trim().toLowerCase();

    return allPotentialMembers.filter((member) => {
      const displayNameMatch = member.displayName
        ? member.displayName.toLowerCase().includes(lowercasedQuery)
        : false;
      const emailMatch = member.email
        ? member.email.toLowerCase().includes(lowercasedQuery)
        : false;

      return displayNameMatch || emailMatch;
    });
  }, [allPotentialMembers, searchQuery]);

  return (
    <>
      {contactsLoading && <LoadingOverlay />}
      <View style={styles.container}>
        {/* Search Input */}
        <CustomSearchInput
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />

        {/* Members List */}
        <View style={styles.membersList}>
          <MemberList
            members={filteredMembers}
            currentUserId={user?.uid || null}
            selectedMemberIds={selectedMemberIds}
            onSelectMember={handleSelectMember}
            isLoading={contactsLoading}
            emptyMessage={
              searchQuery.trim() !== ''
                ? 'No members match your search.'
                : 'No members available to add.'
            }
            adminIds={[]}
            onMemberPress={handleSelectMember}
            scrollEnabled={true}
          />
        </View>

        <View style={styles.addViaEmailContainer}>
          <Text style={styles.addViaEmailText}>
            Or add someone not in your contacts with their email address:
          </Text>
          <CustomButton
            title="Invite with email address"
            onPress={openEmailModal}
            accessibilityLabel="Add member with email address"
            accessibilityHint="Opens a modal to invite a member by their email address"
            variant="secondary"
          />
        </View>

        {/* Invitation Modal */}
        <CustomModal
          isVisible={isModalVisible}
          onClose={closeEmailModal}
          title="Add a new member"
          buttons={[
            { label: 'Cancel', onPress: closeEmailModal, variant: 'secondary' },
            {
              label: 'Invite',
              onPress: handleAddByEmail,
              variant: 'primary',
              disabled: !emailToAdd.trim(),
            },
          ]}
          loading={invitingEmail}
        >
          <CustomTextInput
            placeholder="Email address"
            value={emailToAdd}
            onChangeText={setEmailToAdd}
            keyboardType="email-address"
            autoCapitalize="none"
            hasBorder={true}
            iconName="mail-outline"
          />
        </CustomModal>
      </View>
    </>
  );
};

export default AddMembersScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  addViaEmailText: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 16,
  },
  membersList: {
    flex: 1,
  },
  addViaEmailContainer: {
    marginBottom: 16,
  },
});
