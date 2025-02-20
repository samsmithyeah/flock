// screens/MatchesListScreen.tsx

import React, { useEffect, useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useCrews } from '@/context/CrewsContext';
import CrewList from '@/components/CrewList';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { NavParamList } from '@/navigation/AppNavigator'; // Adjust the path as necessary
import { Crew } from '@/types/Crew';
import { User } from '@/types/User';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '@/firebase';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import useglobalStyles from '@/styles/globalStyles';
import { getFormattedDay } from '@/utils/dateHelpers';

type MatchesListScreenProps = NativeStackScreenProps<
  NavParamList,
  'MatchesList'
>;

const MatchesListScreen: React.FC<MatchesListScreenProps> = ({
  route,
  navigation,
}) => {
  const { date } = route.params;
  const {
    dateMatchingCrews,
    crews,
    loadingCrews,
    loadingMatches,
    usersCache,
    setUsersCache,
  } = useCrews();
  const globalStyles = useglobalStyles();
  const [matchingCrews, setMatchingCrews] = useState<Crew[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `${getFormattedDay(date)}'s matches`,
    });
  }, [navigation, date]);

  useEffect(() => {
    const getMatchingCrews = () => {
      const matchingCrewIds = dateMatchingCrews[date] || [];
      const filteredCrews = crews.filter((crew) =>
        matchingCrewIds.includes(crew.id),
      );
      setMatchingCrews(filteredCrews);
    };

    getMatchingCrews();

    // Get member names
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
  }, [date, dateMatchingCrews, crews, usersCache, setUsersCache]);

  // Determine if loading is needed
  const isLoading = loadingCrews || loadingMatches || isLoadingUsers;

  // Render loading indicator while fetching data
  if (isLoading) {
    return <LoadingOverlay />;
  }

  // Handle case when there are no matching crews
  if (matchingCrews.length === 0) {
    return (
      <View style={globalStyles.containerWithHeader}>
        <Text style={styles.noMatchesText}>
          You have no matches on this day.
        </Text>
      </View>
    );
  }

  return (
    <View style={globalStyles.containerWithHeader}>
      <CrewList
        crews={matchingCrews}
        usersCache={usersCache}
        currentDate={date}
      />
    </View>
  );
};

export default MatchesListScreen;

const styles = StyleSheet.create({
  noMatchesText: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    marginTop: 20,
  },
});
