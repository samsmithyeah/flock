import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
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
import { useCrews } from '@/context/CrewsContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import useGlobalStyles from '@/styles/globalStyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';

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
    <View style={globalStyles.containerWithHeader}>
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
          <Text style={styles.navCardTitle}>Crew calendar</Text>
          <Text style={styles.navCardDescription}>
            Update your availability, see upcoming events, and meet up with your
            crew.
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
          <Text style={styles.navCardTitle}>Event polls</Text>
          <Text style={styles.navCardDescription}>
            Create polls to find the best date for your next crew event
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navCard}
          onPress={() =>
            router.push(
              {
                pathname: '/chats/crew-chat',
                params: { crewId },
              },
              { withAnchor: true },
            )
          }
        >
          <Ionicons name="chatbubbles-outline" size={36} color="#4CAF50" />
          <Text style={styles.navCardTitle}>Crew Chat</Text>
          <Text style={styles.navCardDescription}>
            Message everyone in your crew in an ongoing group conversation.
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CrewLandingScreen;

const styles = StyleSheet.create({
  navigationCards: {
    marginTop: vs(16),
  },
  navCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    padding: vs(20),
    marginBottom: vs(16),
    alignItems: 'center',
  },
  navCardTitle: {
    fontSize: vs(18),
    fontWeight: '600',
    marginTop: vs(12),
    marginBottom: vs(8),
    color: '#333',
  },
  navCardDescription: {
    fontSize: vs(14),
    color: '#666',
    textAlign: 'center',
  },
});
