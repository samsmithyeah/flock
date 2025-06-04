import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { MaterialIcons } from '@expo/vector-icons';
import { Crew } from '@/types/Crew';
import CrewHeader from '@/components/CrewHeader';
import NavigationCard from '@/components/NavigationCard';
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
    <ScrollView style={globalStyles.containerWithHeader}>
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
            router.push(
              {
                pathname: '/signal/send',
                params: { crewId },
              },
              { withAnchor: true },
            )
          }
        />

        <NavigationCard
          icon="chatbubbles-outline"
          iconColor="#673ab7"
          title="Crew chat"
          description="Chat with your crew members."
          onPress={() =>
            router.push(
              {
                pathname: '/chats/crew-chat',
                params: { crewId },
              },
              {
                withAnchor: true,
              },
            )
          }
        />
      </View>
    </ScrollView>
  );
};

export default CrewLandingScreen;

const styles = StyleSheet.create({
  navigationCards: {
    marginTop: vs(16),
  },
});
