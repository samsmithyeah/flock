// screens/CrewsListScreen.tsx

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCrews } from '../context/CrewsContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { NavParamList } from '../navigation/AppNavigator';
import ScreenTitle from '../components/ScreenTitle';
import CrewList from '../components/CrewList';
import CreateCrewModal from '../components/CreateCrewModal';
import { Crew } from '../types/Crew';
import { User } from '../types/User';
import CustomSearchInput from '../components/CustomSearchInput';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import LoadingOverlay from '../components/LoadingOverlay';
import Toast from 'react-native-toast-message';

type CrewsListScreenProps = NativeStackScreenProps<NavParamList, 'CrewsList'>;

const CrewsListScreen: React.FC<CrewsListScreenProps> = ({ navigation }) => {
  const { crews, usersCache, setUsersCache, loadingCrews, loadingStatuses } =
    useCrews();
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
            } else {
              // Handle case where user document doesn't exist
              return {
                uid,
                displayName: 'Unknown User',
                email: '',
                firstName: 'Unknown', // Assuming these fields
                lastName: '',
                photoURL: '',
              } as User;
            }
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
    navigation.navigate('Crew', { crewId });
  };

  return (
    <>
      {(isLoading || isLoadingUsers) && <LoadingOverlay />}
      <View style={styles.container}>
        {/* Header Container */}
        <View style={styles.headerContainer}>
          {/* Screen Title */}
          <ScreenTitle title="Crews" />

          {/* Add Crew Button */}
          <TouchableOpacity
            onPress={() => setIsModalVisible(true)}
            accessibilityLabel="Add crew"
            accessibilityHint="Press to create a new crew"
          >
            <Ionicons name="add-circle" size={30} color="#1e90ff" />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <CustomSearchInput
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />

        {/* Crew List */}
        <CrewList crews={filteredCrews} usersCache={usersCache} />

        {/* Create Crew Modal */}
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
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
