// app/(main)/dashboard/events-list.tsx

import React, { useEffect, useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useCrews } from '@/context/CrewsContext';
import CrewList from '@/components/CrewList';
import { Crew } from '@/types/Crew';
import { User } from '@/types/User';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '@/firebase';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import useglobalStyles from '@/styles/globalStyles';
import { getFormattedDay } from '@/utils/dateHelpers';
import { useLocalSearchParams, useNavigation } from 'expo-router';

const EventCrewsListScreen: React.FC = () => {
  const { date } = useLocalSearchParams<{
    date: string;
  }>();
  const navigation = useNavigation();
  const {
    dateEventCrews,
    crews,
    loadingCrews,
    loadingEvents,
    usersCache,
    setUsersCache,
  } = useCrews();

  const globalStyles = useglobalStyles();
  const [eventCrews, setEventCrews] = useState<Crew[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `${getFormattedDay(date)}'s crews with events`,
    });
  }, [navigation, date]);

  useEffect(() => {
    /**
     * 1. Filter which crews actually have events on this date
     * Ensure we have unique crew IDs even if multiple events exist on the same day
     */
    const matchingCrewIds = dateEventCrews[date] || [];

    // Use Map to ensure each crew appears only once
    const uniqueCrewMap = new Map<string, Crew>();

    crews.forEach((crew) => {
      if (matchingCrewIds.includes(crew.id) && !uniqueCrewMap.has(crew.id)) {
        uniqueCrewMap.set(crew.id, crew);
      }
    });

    // Convert map back to array for state
    const filteredCrews = Array.from(uniqueCrewMap.values());
    console.log(`Found ${filteredCrews.length} unique crews for ${date}`);

    setEventCrews(filteredCrews);

    /**
     * 2. Identify which user documents we have not yet cached
     */
    const allMemberIds = filteredCrews.reduce<string[]>(
      (acc, crew) => acc.concat(crew.memberIds),
      [],
    );
    const uniqueMemberIds = Array.from(new Set(allMemberIds));
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
              firstName: 'Unknown',
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
  }, [date, dateEventCrews, crews, usersCache, setUsersCache]);

  // Determine if loading is needed
  const isLoading = loadingCrews || loadingEvents || isLoadingUsers;

  if (isLoading) {
    return <LoadingOverlay />;
  }

  if (eventCrews.length === 0) {
    return (
      <View style={globalStyles.containerWithHeader}>
        <Text style={styles.noEventsText}>No events on this day.</Text>
      </View>
    );
  }

  return (
    <View style={globalStyles.containerWithHeader}>
      <CrewList crews={eventCrews} usersCache={usersCache} currentDate={date} />
    </View>
  );
};

export default EventCrewsListScreen;

const styles = StyleSheet.create({
  noEventsText: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    marginTop: 20,
  },
});
