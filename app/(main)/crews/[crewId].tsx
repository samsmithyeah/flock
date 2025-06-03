import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Crew } from '@/types/Crew';
import CrewHeader from '@/components/CrewHeader';
import NavigationCard from '@/components/NavigationCard';
import { useCrews } from '@/context/CrewsContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import useGlobalStyles from '@/styles/globalStyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Image } from 'expo-image';

const { height } = Dimensions.get('window');
const BASE_HEIGHT = 852;
const vs = (size: number) => (height / BASE_HEIGHT) * size;

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
    <ScrollView style={globalStyles.containerWithHeader}>
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
        <NavigationCard
          icon="calendar-outline"
          iconColor="#1e90ff"
          title="Crew calendar"
          description="Update your availability, see upcoming events, and meet up with your crew."
          onPress={() =>
            router.push({
              pathname: '/crews/[crewId]/calendar',
              params: { crewId },
            })
          }
        />

        <NavigationCard
          icon="stats-chart-outline"
          iconColor="#ff7043"
          title="Event polls"
          description="Create polls to find the best date for your next crew event"
          onPress={() =>
            router.push({
              pathname: '/crews/event-poll',
              params: { crewId },
            })
          }
        />

        <NavigationCard
          icon="radio-outline"
          iconColor="#4caf50"
          title="Signal"
          description="Send a signal to your crew to meet up right now!"
          onPress={() =>
            router.push({
              pathname: '/signal/send',
              params: { crewId },
            })
          }
        />
      </View>
    </ScrollView>
  );
};

export default CrewLandingScreen;

const styles = StyleSheet.create({
  crewInfo: {
    alignItems: 'center',
    marginVertical: vs(24),
  },
  crewImage: {
    width: vs(100),
    height: vs(100),
    borderRadius: 50,
    marginBottom: vs(16),
  },
  crewImagePlaceholder: {
    width: vs(100),
    height: vs(100),
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: vs(16),
  },
  crewName: {
    fontSize: vs(24),
    fontWeight: 'bold',
    color: '#333',
    marginBottom: vs(4),
  },
  memberCount: {
    fontSize: 16,
    color: '#666',
  },
  navigationCards: {
    marginTop: vs(16),
  },
});
