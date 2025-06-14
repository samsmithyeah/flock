// screens/CrewSettingsScreen.tsx

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Alert,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { arrayRemove, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { deleteCrew, db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { useCrews } from '@/context/CrewsContext';
import { User } from '@/types/User';
import { Ionicons } from '@expo/vector-icons';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import MemberList from '@/components/MemberList';
import { Crew } from '@/types/Crew';
import CustomButton from '@/components/CustomButton';
import CustomTextInput from '@/components/CustomTextInput';
import CustomModal from '@/components/CustomModal';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import useGlobalStyles from '@/styles/globalStyles';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';

const CrewSettingsScreen: React.FC = () => {
  const { user } = useUser();
  const {
    setCrews,
    setCrewIds,
    usersCache,
    subscribeToUsers,
    defaultActivity,
  } = useCrews();
  const globalStyles = useGlobalStyles();
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const navigation = useNavigation();
  const [crew, setCrew] = useState<Crew | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [isEditNameModalVisible, setIsEditNameModalVisible] = useState(false);
  const [isEditActivityModalVisible, setIsEditActivityModalVisible] =
    useState(false);
  const [newCrewName, setNewCrewName] = useState('');
  const [newActivity, setNewActivity] = useState('');
  const [activityError, setActivityError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [isUpdatingActivity, setIsUpdatingActivity] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [isLeavingCrew, setIsLeavingCrew] = useState(false);

  // Fetch crew data and listen for real-time updates
  useEffect(() => {
    if (!crewId) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Crew ID not found',
      });
      setLoading(false);
      return;
    }

    const crewRef = doc(db, 'crews', crewId);

    const unsubscribeCrew = onSnapshot(
      crewRef,
      (docSnap) => {
        if (!user) return;

        if (docSnap.exists()) {
          const crewData: Crew = {
            id: docSnap.id,
            ...(docSnap.data() as Omit<Crew, 'id'>),
          };
          setCrew(crewData);
          setNewCrewName(crewData.name);
          setNewActivity(crewData.activity || defaultActivity);
        } else {
          if (!isDeleting) {
            console.warn('Crew not found');
            router.push('/crews');
          }
        }
        setLoading(false);
      },
      (error) => {
        if (error.code === 'permission-denied') return;
        if (user) {
          console.error('Error fetching crew:', error);
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Could not fetch crew data',
          });
        }
        setLoading(false);
      },
    );

    return () => {
      unsubscribeCrew();
    };
  }, [crewId, isDeleting, user, navigation]);

  useEffect(() => {
    if (crew && crew.memberIds && crew.memberIds.length > 0) {
      subscribeToUsers(crew.memberIds);
    }
  }, [crew, subscribeToUsers]);

  useEffect(() => {
    if (crew && crew.memberIds && crew.memberIds.length > 0) {
      const updatedMembers = crew.memberIds
        .map((memberId) => usersCache[memberId])
        .filter(Boolean) as User[];
      setMembers(updatedMembers);
    } else {
      setMembers([]);
    }
  }, [crew, usersCache]);

  // Function to delete the crew
  const handleDeleteCrew = async () => {
    Alert.alert(
      'Confirm deletion',
      'Are you sure you want to delete this crew? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user?.uid || !crew) {
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'User or Crew data is missing',
              });
              return;
            }

            if (user.uid !== crew.ownerId) {
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Only the owner can delete the crew',
              });
              return;
            }

            setIsDeleting(true);
            try {
              // Call the Cloud Function to delete the crew
              const result = await deleteCrew(crewId);
              const data = result.data as { success: boolean };
              // Update local state
              setCrews((prevCrews) =>
                prevCrews.filter((crew) => crew.id !== crewId),
              );
              setCrewIds((prevIds) => prevIds.filter((id) => id !== crewId));
              if (data.success) {
                router.push('/crews');
                Toast.show({
                  type: 'success',
                  text1: 'Crew deleted',
                  text2: 'The crew was deleted successfully',
                });
              } else {
                throw new Error('Deletion failed');
              }
            } catch (error: any) {
              console.error('Error deleting crew:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Could not delete the crew',
              });
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  // Function to leave the crew
  const handleLeaveCrew = async () => {
    if (!user?.uid || !crew) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'User or Crew data is missing',
      });
      return;
    }

    Alert.alert(
      'Confirm Leaving',
      'Are you sure you want to leave this crew?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLeavingCrew(true);
              const crewRef = doc(db, 'crews', crewId);

              // Remove the crew from the user's crew order list
              await updateDoc(doc(db, 'users', user.uid), {
                crewOrder: arrayRemove(crewId),
              });

              // If the user is the owner of the crew
              if (user.uid === crew.ownerId) {
                if (crew.memberIds.length === 1) {
                  // If the user is the only member, delete the crew
                  await deleteCrew(crewId);
                  // Update local state
                  setCrews((prevCrews) =>
                    prevCrews.filter((crew) => crew.id !== crewId),
                  );
                  setCrewIds((prevIds) =>
                    prevIds.filter((id) => id !== crewId),
                  );
                  setIsLeavingCrew(false);
                  router.push('/crews');
                  Toast.show({
                    type: 'success',
                    text1: 'You have left the crew',
                    text2: 'Crew also deleted since you were the only member',
                  });
                } else {
                  // Assign a new owner randomly from the remaining members
                  const remainingMembers = crew.memberIds.filter(
                    (memberId) => memberId !== user.uid,
                  );
                  const newOwnerId =
                    remainingMembers[
                      Math.floor(Math.random() * remainingMembers.length)
                    ];

                  // Update the crew document with the new owner and remove the current user
                  await updateDoc(crewRef, {
                    ownerId: newOwnerId,
                    memberIds: remainingMembers,
                  });
                  setIsLeavingCrew(false);

                  router.push('/crews');
                  Toast.show({
                    type: 'success',
                    text1: 'You have left the crew',
                    text2: 'Ownership was transferred to another member',
                  });
                }
              } else {
                // If the user is not the owner, simply remove them from the crew
                const updatedMemberIds = crew.memberIds.filter(
                  (memberId) => memberId !== user.uid,
                );

                await updateDoc(crewRef, {
                  memberIds: updatedMemberIds,
                });

                // Remove the crew from local state
                setCrews((prevCrews) =>
                  prevCrews.filter((crew) => crew.id !== crewId),
                );

                // Remove the crew ID from the user's list
                setCrewIds((prevIds) => prevIds.filter((id) => id !== crewId));
                setIsLeavingCrew(false);
                router.push('/crews');
                Toast.show({
                  type: 'success',
                  text1: 'Success',
                  text2: 'You have left the crew',
                });
              }
            } catch (error) {
              console.error('Error leaving crew:', error);
              setIsLeavingCrew(false);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Could not leave the crew',
              });
            }
          },
        },
      ],
    );
  };

  const navigateToUserProfile = (selectedUser: User) => {
    if (selectedUser.uid === user?.uid) {
      router.push('/settings');
      return;
    }
    router.push(
      {
        pathname: '/contacts/other-user-profile',
        params: { userId: selectedUser.uid },
      },
      { withAnchor: true },
    );
  };

  // Function to handle crew name update
  const handleUpdateCrewName = async () => {
    if (!newCrewName.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Crew name cannot be empty',
      });
      return;
    }

    if (newCrewName.trim().length < 3) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Crew name must be at least 3 characters long',
      });
      return;
    }

    setIsUpdatingName(true);

    try {
      await updateDoc(doc(db, 'crews', crewId), {
        name: newCrewName.trim(),
        updatedBy: user?.uid,
      });
      setCrew((prev) => (prev ? { ...prev, name: newCrewName.trim() } : prev));
      setIsEditNameModalVisible(false);
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Crew name updated successfully',
      });
    } catch (error) {
      console.error('Error updating crew name:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not update crew name',
      });
    } finally {
      setIsUpdatingName(false);
    }
  };

  // Function to handle activity update
  const handleUpdateActivity = async () => {
    if (!newActivity.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Crew activity cannot be empty',
      });
      return;
    }

    if (newActivity.trim().length < 3) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Crew activity must be at least 3 characters long',
      });
      return;
    }

    if (newActivity.trim().length > 50) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Crew activity must be at most 50 characters long',
      });
      return;
    }

    setIsUpdatingActivity(true);

    try {
      await updateDoc(doc(db, 'crews', crewId), {
        activity: newActivity.trim(),
        updatedBy: user?.uid,
      });
      setCrew((prev) =>
        prev ? { ...prev, activity: newActivity.trim() } : prev,
      );
      setIsEditActivityModalVisible(false);
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Crew activity updated successfully',
      });
    } catch (error) {
      console.error('Error updating crew activity:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not update crew activity',
      });
    } finally {
      setIsUpdatingActivity(false);
    }
  };

  // Function to handle always show statuses toggle
  const handleToggleAlwaysShowStatuses = async (value: boolean) => {
    if (!crew || !user?.uid) return;

    // Only allow crew owner to change this setting
    if (user.uid !== crew.ownerId) {
      Toast.show({
        type: 'error',
        text1: 'Permission denied',
        text2: 'Only the crew owner can change this setting',
      });
      return;
    }

    setIsUpdatingSettings(true);

    try {
      await updateDoc(doc(db, 'crews', crewId), {
        alwaysShowStatuses: value,
        updatedBy: user.uid,
      });
      setCrew((prev) => (prev ? { ...prev, alwaysShowStatuses: value } : prev));
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Setting updated successfully',
      });
    } catch (error) {
      console.error('Error updating always show statuses setting:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not update setting',
      });
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  if (!crew) {
    return <LoadingOverlay />;
  }

  return (
    <>
      {(loading || !crew) && <LoadingOverlay />}
      {isDeleting && <LoadingOverlay text="Deleting..." />}
      <ScrollView style={globalStyles.containerWithHeader}>
        {/* Crew Header */}
        <View style={styles.groupInfo}>
          <ProfilePicturePicker
            imageUrl={crew.iconUrl ?? null}
            onImageUpdate={async (newUrl) => {
              // Update local state
              setCrew({ ...crew, iconUrl: newUrl });

              // Update Firestore
              if (crewId) {
                try {
                  const crewRef = doc(db, 'crews', crewId);
                  await updateDoc(crewRef, {
                    iconUrl: newUrl,
                    updatedBy: user?.uid,
                  });
                  console.log(
                    'iconUrl successfully updated in Firestore:',
                    newUrl,
                  );
                } catch (error) {
                  console.error('Error updating iconUrl in Firestore:', error);
                  Toast.show({
                    type: 'error',
                    text1: 'Error',
                    text2: 'Could not update crew icon',
                  });
                }
              }
            }}
            editable
            storagePath={`crews/${crewId}/icon.jpg`}
            size={120}
          />
          <View style={styles.groupNameContainer}>
            <Text style={styles.groupName}>{crew.name}</Text>
            {user?.uid === crew.ownerId && (
              <TouchableOpacity
                onPress={() => setIsEditNameModalVisible(true)}
                style={styles.editButton}
                accessibilityLabel="Edit Crew Name"
              >
                <Ionicons name="pencil" size={20} color="#1e90ff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Crew Activity Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Crew activity:</Text>
          <View style={styles.activityDisplayContainer}>
            <Text style={styles.activityText}>
              {crew.activity || defaultActivity}
            </Text>
            <TouchableOpacity
              onPress={() => setIsEditActivityModalVisible(true)}
              style={styles.editActivityButton}
              accessibilityLabel="Edit Crew Activity"
            >
              <Ionicons name="pencil" size={20} color="#1e90ff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Crew Settings Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Status visibility:</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingDescription}>
                Members can see who's available even if they haven't set their
                own status
              </Text>
              {user?.uid !== crew.ownerId && (
                <Text style={styles.adminOnlyText}>
                  (Only crew admins can change this setting)
                </Text>
              )}
            </View>
            <Switch
              value={crew.alwaysShowStatuses ?? false}
              onValueChange={handleToggleAlwaysShowStatuses}
              disabled={isUpdatingSettings || user?.uid !== crew.ownerId}
              trackColor={{ false: '#767577', true: '#1e90ff' }}
              thumbColor={crew.alwaysShowStatuses ? '#ffffff' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Members List Header with Add Button */}
        <View style={styles.sectionContainer}>
          <View style={styles.membersListHeader}>
            <Text
              style={styles.sectionTitle}
            >{`${members.length} member${members.length !== 1 ? 's' : ''}:`}</Text>
            <TouchableOpacity
              style={styles.addButtonInline}
              onPress={() =>
                router.push({
                  pathname: '/crews/add-members',
                  params: { crewId: crewId },
                })
              }
              accessibilityLabel="Add Member"
            >
              <Ionicons name="add-circle" size={30} color="#1e90ff" />
            </TouchableOpacity>
          </View>

          {/* Members List */}
          <MemberList
            members={members}
            currentUserId={user?.uid || null}
            isLoading={loading}
            emptyMessage="No members in this crew."
            adminIds={[crew.ownerId]}
            onMemberPress={navigateToUserProfile}
            scrollEnabled={false}
          />
        </View>

        {/* Leave Crew Button */}
        <View style={styles.leaveButton}>
          <CustomButton
            title="Leave crew"
            onPress={handleLeaveCrew}
            variant="secondaryDanger" // Red variant indicating a destructive action
            accessibilityLabel="Leave Crew"
            accessibilityHint="Leave the current crew"
            loading={isLeavingCrew}
          />
        </View>

        {/* Delete Crew Button (Visible to Owner Only) */}
        {user?.uid === crew.ownerId && (
          <CustomButton
            title="Delete crew"
            onPress={handleDeleteCrew}
            variant="danger" // Red variant indicating a destructive action
            accessibilityLabel="Delete Crew"
            accessibilityHint="Permanently delete this crew"
            loading={isDeleting} // Show loading indicator when deleting
          />
        )}

        {/* Modal for Editing Crew Name */}
        <CustomModal
          isVisible={isEditNameModalVisible}
          onClose={() => {
            setIsEditNameModalVisible(false);
            setNewCrewName('');
          }}
          title="Edit crew name"
          buttons={[
            {
              label: 'Cancel',
              onPress: () => {
                setIsEditNameModalVisible(false);
                setNewCrewName('');
              },
              variant: 'secondary',
              disabled: isUpdatingName || isUpdatingActivity,
            },
            {
              label: 'Update',
              onPress: handleUpdateCrewName,
              variant: 'primary',
              disabled:
                isUpdatingName || isUpdatingActivity || !newCrewName.trim(),
            },
          ]}
          loading={isUpdatingName}
        >
          <CustomTextInput
            placeholder="New crew name"
            value={newCrewName}
            onChangeText={setNewCrewName}
            autoCapitalize="words"
            hasBorder={true}
          />
        </CustomModal>

        {/* Modal for Editing Crew Activity */}
        <CustomModal
          isVisible={isEditActivityModalVisible}
          onClose={() => {
            setIsEditActivityModalVisible(false);
            setNewActivity('');
            setActivityError('');
          }}
          title="Edit crew activity"
          buttons={[
            {
              label: 'Cancel',
              onPress: () => {
                setIsEditActivityModalVisible(false);
                setNewActivity(crew.activity || defaultActivity);
                setActivityError('');
              },
              variant: 'secondary',
              disabled: isUpdatingActivity,
            },
            {
              label: 'Update',
              onPress: handleUpdateActivity,
              variant: 'primary',
              disabled: isUpdatingActivity || !newActivity.trim(),
            },
          ]}
          loading={isUpdatingActivity}
        >
          <CustomTextInput
            placeholder="Enter crew activity"
            value={newActivity}
            onChangeText={setNewActivity}
            hasBorder={true}
          />
          {activityError ? (
            <Text style={styles.errorText}>{activityError}</Text>
          ) : null}
        </CustomModal>
      </ScrollView>
    </>
  );
};

export default CrewSettingsScreen;

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  groupInfo: {
    alignItems: 'center',
    padding: 16,
  },
  groupNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  groupName: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  editButton: {
    marginLeft: 10,
    padding: 5,
  },
  sectionContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  activityDisplayContainer: {
    marginTop: 10,
    flexDirection: 'row',
  },
  activityText: {
    fontSize: 18,
    marginBottom: 15,
  },
  editActivityButton: {
    marginLeft: 10,
  },
  membersListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addButtonInline: {
    padding: 5,
  },
  leaveButton: {
    marginTop: 10,
    marginBottom: 10,
  },
  errorText: {
    color: 'red',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 15,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
  adminOnlyText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 4,
  },
});
