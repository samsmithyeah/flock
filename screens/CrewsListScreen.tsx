// screens/CrewsListScreen.tsx

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCrews } from '@/context/CrewsContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { NavParamList } from '@/navigation/AppNavigator';
import ScreenTitle from '@/components/ScreenTitle';
import CrewList from '@/components/CrewList';
import CreateCrewModal from '@/components/CreateCrewModal';
import { Crew } from '@/types/Crew';
import { User } from '@/types/User';
import CustomSearchInput from '@/components/CustomSearchInput';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import Icon from '@expo/vector-icons/MaterialIcons';
import useGlobalStyles from '@/styles/globalStyles';

type CrewsListScreenProps = NativeStackScreenProps<NavParamList, 'CrewsList'>;

const CrewsListScreen: React.FC<CrewsListScreenProps> = ({ navigation }) => {
  const { crews, usersCache, setUsersCache, loadingCrews, loadingStatuses } =
    useCrews();
  const globalStyles = useGlobalStyles();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>(''); // State for search
  const [filteredCrews, setFilteredCrews] = useState<Crew[]>([]); // State for filtered crews
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false); // Loading state for user data

  // Determine if overall loading is needed
  const isLoading = loadingCrews || loadingStatuses || isLoadingUsers;

  // Filter crews based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCrews(crews);
    } else {
      const filtered = crews.filter((crew) =>
        crew.name.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      setFilteredCrews(filtered);
    }
  }, [searchQuery, crews]);

  // Fetch user data for crew members
  useEffect(() => {
    if (!crews || crews.length === 0) return;

    // Collect all unique memberIds from the crews
    const allMemberIds = crews.reduce<string[]>(
      (acc, crew) => acc.concat(crew.memberIds),
      [],
    );
    const uniqueMemberIds = Array.from(new Set(allMemberIds));

    // Determine which memberIds are not in the cache
    const memberIdsToFetch = uniqueMemberIds.filter((uid) => !usersCache[uid]);

    if (memberIdsToFetch.length > 0) {
      setIsLoadingUsers(true);
      const fetchUsers = async () => {
        try {
          const userPromises = memberIdsToFetch.map(async (uid) => {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
              return {
                uid: userDoc.id,
                ...(userDoc.data() as Omit<User, 'uid'>),
              } as User;
            }
            // Handle case where user document doesn't exist
            return {
              uid,
              displayName: 'Unknown User',
              email: '',
              firstName: 'Unknown', // Assuming these fields
              lastName: '',
              photoURL: '',
            } as User;
          });

          const usersData = await Promise.all(userPromises);

          // Update the users cache
          setUsersCache((prevCache) => {
            const newCache = { ...prevCache };
            usersData.forEach((userData) => {
              newCache[userData.uid] = userData;
            });
            return newCache;
          });
        } catch (error) {
          console.error('Error fetching user data:', error);
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Could not fetch user data',
          });
        } finally {
          setIsLoadingUsers(false);
        }
      };

      fetchUsers();
    }
  }, [crews, usersCache, setUsersCache]);

  const handleCrewCreated = (crewId: string) => {
    console.log('Crew created:', crewId);
    setIsModalVisible(false);
    Toast.show({
      type: 'success',
      text1: 'Success',
      text2: 'Crew created successfully',
    });
    navigation.navigate('AddMembers', { crewId });
  };

  // Render the empty state UI
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="group-add" size={64} color="#888" />
      <Text style={styles.emptyText}>You are not in any crews yet</Text>
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setIsModalVisible(true)}
      >
        <Text style={styles.createButtonText}>Create one</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      {(isLoading || isLoadingUsers) && <LoadingOverlay />}
      <View style={globalStyles.container}>
        <View style={styles.headerContainer}>
          <ScreenTitle title="Crews" />

          <TouchableOpacity
            onPress={() => setIsModalVisible(true)}
            accessibilityLabel="Add crew"
            accessibilityHint="Press to create a new crew"
          >
            <Ionicons name="add-circle" size={30} color="#1e90ff" />
          </TouchableOpacity>
        </View>

        <CustomSearchInput
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />

        {crews.length === 0 ? (
          renderEmptyState()
        ) : (
          <CrewList crews={filteredCrews} usersCache={usersCache} />
        )}

        <CreateCrewModal
          isVisible={isModalVisible}
          onClose={() => {
            console.log('Setting isModalVisible to false');
            setIsModalVisible(false);
          }}
          onCrewCreated={handleCrewCreated}
        />
      </View>
    </>
  );
};

export default CrewsListScreen;

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyText: {
    fontSize: 18,
    color: '#555',
    marginTop: 16,
    textAlign: 'center',
  },
  createButton: {
    marginTop: 12,
    paddingHorizontal: 20,
  },
  createButtonText: {
    color: '#1e90ff',
    fontSize: 20,
  },
});
