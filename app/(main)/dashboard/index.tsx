import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useCrews } from '@/context/CrewsContext';
import DateCard from '@/components/DateCard';
import moment from 'moment';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import ScreenTitle from '@/components/ScreenTitle';
import CreateCrewModal from '@/components/CreateCrewModal';
import Icon from '@expo/vector-icons/MaterialIcons';
import useglobalStyles from '@/styles/globalStyles';
import { router } from 'expo-router';

const DashboardScreen: React.FC = () => {
  const {
    crewIds,
    dateCounts,
    dateMatches,
    dateEvents,
    setStatusForDateAllCrews,
    loadingCrews,
    loadingStatuses,
    loadingMatches,
  } = useCrews();

  const globalStyles = useglobalStyles();

  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false);
  const [isCreateModalVisible, setIsCreateModalVisible] =
    useState<boolean>(false);
  const [weekDates, setWeekDates] = useState<string[]>([]);

  useEffect(() => {
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(moment().add(i, 'days').format('YYYY-MM-DD'));
    }
    setWeekDates(days);
  }, []);

  const isLoading = loadingCrews || loadingStatuses || isLoadingUsers;

  const handleToggle = async (date: string, toggleTo: boolean | null) => {
    setIsLoadingUsers(true);
    try {
      await setStatusForDateAllCrews(date, toggleTo);
    } catch (error) {
      console.error('Error toggling status:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to update status',
      });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Opens MatchesList screen
  const handlePressMatches = (date: string) => {
    router.push({
      pathname: '/dashboard/matches-list',
      params: { date },
    });
  };

  // NEW: Opens EventCrewsList screen for that date
  const handlePressEvents = (date: string) => {
    router.push({
      pathname: '/dashboard/events-list',
      params: { date },
    });
  };

  const openCreateCrewModal = () => {
    setIsCreateModalVisible(true);
  };

  const closeCreateCrewModal = () => {
    setIsCreateModalVisible(false);
  };

  const handleCrewCreated = (crewId: string) => {
    closeCreateCrewModal();
    Toast.show({
      type: 'success',
      text1: 'Success',
      text2: 'Crew created successfully',
    });
    router.push(
      {
        pathname: '/crews/add-members',
        params: { crewId },
      },
      { withAnchor: true },
    );
  };

  const renderDayItem = ({ item }: { item: string }) => {
    const availableCount = dateCounts[item]?.available ?? 0;
    const unavailableCount = dateCounts[item]?.unavailable ?? 0;
    const matches = dateMatches[item] ?? 0;
    const events = dateEvents[item] ?? 0;
    const total = crewIds.length;
    const isDisabled = moment(item).isBefore(moment(), 'day');

    return (
      <DateCard
        date={item}
        availableCount={availableCount}
        unavailableCount={unavailableCount}
        matches={matches}
        events={events}
        total={total}
        isDisabled={isDisabled}
        isLoading={loadingMatches}
        onToggle={handleToggle}
        onPressMatches={handlePressMatches}
        onPressEvents={handlePressEvents}
      />
    );
  };

  return (
    <>
      {isLoading && <LoadingOverlay />}
      <View style={globalStyles.container}>
        <ScreenTitle title="Your week" />
        {crewIds.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="group-add" size={64} color="#888" />
            <Text style={styles.emptyText}>You are not in any crews yet</Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={openCreateCrewModal}
            >
              <Text style={styles.createButtonText}>Create one</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={weekDates}
            renderItem={renderDayItem}
            keyExtractor={(item) => item}
            horizontal={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.weekListContainer}
          />
        )}
      </View>
      <CreateCrewModal
        isVisible={isCreateModalVisible}
        onClose={closeCreateCrewModal}
        onCrewCreated={handleCrewCreated}
      />
    </>
  );
};

const styles = StyleSheet.create({
  weekListContainer: {},
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

export default DashboardScreen;
