import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Crew } from '@/types/Crew';
import CrewHeader from '@/components/CrewHeader';
import { useCrews } from '@/context/CrewsContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import useGlobalStyles from '@/styles/globalStyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Image } from 'expo-image';

const CrewLandingScreen: React.FC = () => {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const navigation = useNavigation();
  const { user } = useUser();
  const { subscribeToUsers } = useCrews();
  const globalStyles = useGlobalStyles();
  const insets = useSafeAreaInsets();

  const [crew, setCrew] = useState<Crew | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch crew data
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
          navigation.setOptions({ title: crewData.name });

          // Subscribe to all crew members
          if (crewData.memberIds) {
            subscribeToUsers(crewData.memberIds);
          }
        } else {
          router.push('/crews/');
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

    return () => unsubscribeCrew();
  }, [crewId, user, navigation, subscribeToUsers]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: '/crews/crew-settings',
              params: { crewId },
            })
          }
        >
          <MaterialIcons name="settings" size={24} color="black" />
        </TouchableOpacity>
      ),
      headerTitle: crew
        ? () => (
            <CrewHeader
              crew={crew}
              onPress={() =>
                router.push({
                  pathname: '/crews/crew-settings',
                  params: { crewId },
                })
              }
            />
          )
        : 'Crew',
      headerTitleAlign: 'left',
      headerStatusBarHeight: insets.top,
    });
  }, [navigation, crew, crewId, insets.top]);

  if (loading || !crew) {
    return <LoadingOverlay />;
  }

  return (
    <View style={globalStyles.containerWithHeader}>
      <View style={styles.crewInfo}>
        {crew.iconUrl ? (
          <Image source={{ uri: crew.iconUrl }} style={styles.crewImage} />
        ) : (
          <View style={styles.crewImagePlaceholder}>
            <Ionicons name="people-outline" size={40} color="#888" />
          </View>
        )}
        <Text style={styles.crewName}>{crew.name}</Text>
        <Text style={styles.memberCount}>
          {crew.memberIds.length}{' '}
          {crew.memberIds.length === 1 ? 'member' : 'members'}
        </Text>
      </View>

      <View style={styles.navigationCards}>
        <TouchableOpacity
          style={styles.navCard}
          onPress={() =>
            router.push({
              pathname: '/crews/[crewId]/calendar',
              params: { crewId },
            })
          }
        >
          <Ionicons name="calendar-outline" size={36} color="#1e90ff" />
          <Text style={styles.navCardTitle}>Calendar</Text>
          <Text style={styles.navCardDescription}>
            View and manage upcoming crew events
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navCard}
          onPress={() =>
            router.push({
              pathname: '/crews/event-poll',
              params: { crewId },
            })
          }
        >
          <Ionicons name="stats-chart-outline" size={36} color="#ff7043" />
          <Text style={styles.navCardTitle}>Date Polls</Text>
          <Text style={styles.navCardDescription}>
            Create polls to find the best date for your next event
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CrewLandingScreen;

const styles = StyleSheet.create({
  crewInfo: {
    alignItems: 'center',
    marginVertical: 24,
  },
  crewImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  crewImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  crewName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  memberCount: {
    fontSize: 16,
    color: '#666',
  },
  navigationCards: {
    marginTop: 16,
  },
  navCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  navCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
    color: '#333',
  },
  navCardDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
