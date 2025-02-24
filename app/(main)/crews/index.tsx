// app/(main)/crews/index.tsx

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCrews } from '@/context/CrewsContext';
import ScreenTitle from '@/components/ScreenTitle';
import CrewList from '@/components/CrewList';
import CreateCrewModal from '@/components/CreateCrewModal';
import { Crew } from '@/types/Crew';
import CustomSearchInput from '@/components/CustomSearchInput';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import Icon from '@expo/vector-icons/MaterialIcons';
import useGlobalStyles from '@/styles/globalStyles';
import { useUser } from '@/context/UserContext';
import { router } from 'expo-router';

const CrewsListScreen: React.FC = () => {
  const { crews, usersCache, loadingCrews, loadingStatuses, subscribeToUsers } =
    useCrews();
  const { user, updateCrewOrder } = useUser();
  const globalStyles = useGlobalStyles();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>(''); // State for search
  const [filteredCrews, setFilteredCrews] = useState<Crew[]>([]); // State for filtered crews
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false); // Loading state for user data
  const [orderedCrews, setOrderedCrews] = useState<Crew[]>([]);

  // Determine if overall loading is needed
  const isLoading = loadingCrews || loadingStatuses || isLoadingUsers;

  // Filter crews based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCrews(orderedCrews);
    } else {
      const filtered = orderedCrews.filter((crew) =>
        crew.name.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      setFilteredCrews(filtered);
    }
  }, [searchQuery, crews, orderedCrews]);

  // Initialize ordered crews using user's saved order
  useEffect(() => {
    if (crews.length > 0) {
      if (user?.crewOrder) {
        // Create ordered array based on saved order, putting any new crews at the end
        const orderedCrewsList = [
          ...user.crewOrder
            .map((id) => crews.find((c) => c.id === id))
            .filter((c): c is Crew => c !== undefined),
          ...crews.filter((c) => !user.crewOrder?.includes(c.id)),
        ];
        setOrderedCrews(orderedCrewsList);
      } else {
        setOrderedCrews(crews);
      }
    }
  }, [crews, user?.crewOrder]);

  // Subscribe to all crew members
  useEffect(() => {
    if (!crews?.length) return;

    const memberIds = new Set<string>();
    crews.forEach((crew) => {
      crew.memberIds.forEach((id) => memberIds.add(id));
    });

    setIsLoadingUsers(true);

    (async () => {
      try {
        await subscribeToUsers(Array.from(memberIds));
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoadingUsers(false);
      }
    })();
  }, [crews, subscribeToUsers]);

  useEffect(() => {
    setFilteredCrews((prevFiltered) => {
      if (searchQuery.trim() === '') {
        return [...orderedCrews];
      }
      return [...prevFiltered];
    });
  }, [usersCache, orderedCrews, searchQuery]);

  const handleOrderChange = (newOrder: Crew[]) => {
    setOrderedCrews(newOrder);
    updateCrewOrder(newOrder.map((crew) => crew.id));
  };

  const handleCrewCreated = (crewId: string) => {
    console.log('Crew created:', crewId);
    setIsModalVisible(false);
    Toast.show({
      type: 'success',
      text1: 'Success',
      text2: 'Crew created successfully',
    });
    router.push({
      pathname: '/crews/add-members',
      params: { crewId },
    });
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
          <CrewList
            crews={filteredCrews}
            usersCache={usersCache}
            orderEditable={!searchQuery.trim() && crews.length > 1}
            onOrderChange={handleOrderChange}
          />
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
