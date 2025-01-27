// screens/CrewScreen.tsx

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Modal,
} from 'react-native';
import {
  useRoute,
  RouteProp,
  useNavigation,
  NavigationProp,
  useIsFocused,
} from '@react-navigation/native';
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import moment, { Moment } from 'moment';
import { db, pokeCrew } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { User } from '@/types/User';
import { MaterialIcons } from '@expo/vector-icons';
import { NavParamList } from '@/navigation/AppNavigator';
import { Crew } from '@/types/Crew';
import CrewHeader from '@/components/CrewHeader';
import { useCrews } from '@/context/CrewsContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import { useCrewDateChat } from '@/context/CrewDateChatContext';
import useglobalStyles from '@/styles/globalStyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import WeekNavButtons from '@/components/WeekNavButtons';
import DayContainer from '@/components/DayContainer';

type CrewScreenRouteProp = RouteProp<NavParamList, 'Crew'>;

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.75;
const CARD_MARGIN = 16;
const TOTAL_CARD_WIDTH = CARD_WIDTH + CARD_MARGIN;

const CrewScreen: React.FC = () => {
  const route = useRoute<CrewScreenRouteProp>();
  const { crewId, date } = route.params;
  const navigation = useNavigation<NavigationProp<NavParamList>>();
  const { user } = useUser();
  const { toggleStatusForCrew } = useCrews();
  const { addMemberToChat, removeMemberFromChat } = useCrewDateChat();
  const globalStyles = useglobalStyles();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [crew, setCrew] = useState<Crew | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Moment>(moment().startOf('day'));
  const [weekDates, setWeekDates] = useState<string[]>([]);
  const [statusesForWeek, setStatusesForWeek] = useState<{
    [date: string]: { [userId: string]: boolean };
  }>({});
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [scrolledToStart, setScrolledToStart] = useState<boolean | undefined>(
    undefined,
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!isFocused) {
      setSelectedDate(null);
    }
  }, [isFocused]);

  useEffect(() => {
    if (date && !selectedDate) {
      setSelectedDate(date);
    }
  }, [date, selectedDate]);

  useEffect(() => {
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(moment(startDate).add(i, 'days').format('YYYY-MM-DD'));
    }
    setWeekDates(days);
  }, [startDate]);

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
        } else {
          navigation.navigate('CrewsList');
        }
        setLoading(false);
      },
      (error) => {
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

    return () => {
      unsubscribeCrew();
    };
  }, [crewId, user, navigation]);

  // Fetch members of the crew
  useEffect(() => {
    const fetchMembers = async () => {
      if (crew && crew.memberIds && crew.memberIds.length > 0) {
        try {
          const memberDocs = await Promise.all(
            crew.memberIds.map((memberId) =>
              getDoc(doc(db, 'users', memberId)),
            ),
          );

          const membersList: User[] = memberDocs
            .filter((docSnap) => docSnap.exists())
            .map((docSnap) => ({
              uid: docSnap.id,
              ...(docSnap.data() as Omit<User, 'uid'>),
            }));

          setMembers(membersList);
        } catch (error) {
          console.error('Error fetching members:', error);
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Could not fetch members',
          });
        }
      } else {
        setMembers([]);
      }
    };

    fetchMembers();
  }, [crew]);

  // Firestore listeners for each day in "weekDates"
  useEffect(() => {
    if (!crewId || !user || !weekDates.length) return;

    const unsubscribes: (() => void)[] = [];

    weekDates.forEach((day) => {
      const userStatusesRef = collection(
        db,
        'crews',
        crewId,
        'statuses',
        day,
        'userStatuses',
      );

      const unsub = onSnapshot(
        userStatusesRef,
        (snapshot) => {
          setStatusesForWeek((prev) => {
            const newStatusesForDay: { [userId: string]: boolean } = {};
            snapshot.forEach((docSnap) => {
              const data = docSnap.data() as { upForGoingOutTonight: boolean };
              newStatusesForDay[docSnap.id] =
                data.upForGoingOutTonight || false;
            });
            return { ...prev, [day]: newStatusesForDay };
          });
        },
        (error) => {
          console.error('Error fetching statuses for', day, error);
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: `Could not fetch user statuses for ${day}`,
          });
        },
      );

      unsubscribes.push(unsub);
    });

    return () => {
      unsubscribes.forEach((fn) => fn());
    };
  }, [crewId, user, weekDates]);

  useEffect(() => {
    if (selectedDate && weekDates.length > 0) {
      console.log('selectedDate:', selectedDate);
      console.log('weekDates:', weekDates);
      const dateIndex = weekDates.indexOf(selectedDate);
      console.log('dateIndex:', dateIndex);
      if (dateIndex === -1) {
        const newStartDate = moment(selectedDate).startOf('week');
        const today = moment().startOf('day');
        if (newStartDate.isBefore(today)) {
          setStartDate(today);
          return;
        }
        setStartDate(newStartDate);
        return;
      }
      console.log('Scrolling to dateIndex:', dateIndex);
      scrollToDate(dateIndex);
    }
  }, [selectedDate, weekDates, startDate]);

  const scrollToDate = (dateIndex: number, animated: boolean = true) => {
    setTimeout(() => {
      if (!scrollViewRef.current) {
        console.log('No scrollViewRef, returning');
        return;
      }
      if (dateIndex < 0) {
        console.log(`Invalid dateIndex: ${dateIndex}`);
        return;
      }
      const scrollAmount = dateIndex * TOTAL_CARD_WIDTH;
      scrollViewRef.current.scrollTo({ x: scrollAmount, animated });
    }, 150);
  };

  // Toggling user status
  const isUserUpForDay = (day: string) => {
    if (!user) return false;
    return statusesForWeek[day]?.[user.uid] || false;
  };

  const getCrewActivity = () =>
    crew?.activity ? crew.activity.toLowerCase() : 'meeting up';

  const toggleDayStatus = (day: string) => {
    if (!user?.uid || !crew) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'User or crew data not found',
      });
      return;
    }
    const currentStatus = isUserUpForDay(day);
    const newStatus = !currentStatus;
    const chatId = `${crewId}_${day}`;

    const confirmToggle = async () => {
      toggleStatusForCrew(crewId, day, newStatus);
      if (newStatus) {
        await addMemberToChat(chatId, user.uid);
      } else {
        await removeMemberFromChat(chatId, user.uid);
      }
    };

    Alert.alert(
      'Confirm status change',
      currentStatus
        ? `Are you sure you want to mark yourself as not up for ${getCrewActivity()} on this day?`
        : `Are you sure you want to mark yourself as up for ${getCrewActivity()} on this day?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: confirmToggle },
      ],
    );
  };

  // Poke crew
  const handlePokeCrew = async (day: string) => {
    if (!crewId || !day || !user?.uid) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Missing required info to poke the crew.',
      });
      return;
    }

    Alert.alert(
      'Poke the others?',
      `Send a poke to members not up for it on this day?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Poke',
          onPress: async () => {
            try {
              const poke = await pokeCrew(crewId, day, user.uid);
              Toast.show({
                type: 'success',
                text1: 'Poke Sent',
                text2: (poke.data as { message: string }).message,
              });
            } catch (error) {
              console.error('Error sending poke:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to send poke.',
              });
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  // Navigate to day chat
  const navigateToDayChat = (day: string) => {
    navigation.navigate('ChatsStack', {
      screen: 'CrewDateChat',
      params: { crewId, date: day },
      initial: false,
    });
  };

  // Navigate to user’s profile
  const navigateToUserProfile = (selectedUser: User) => {
    if (!user) return;
    if (selectedUser.uid === user.uid) {
      navigation.navigate('UserProfileStack', {
        screen: 'UserProfile',
        params: { userId: user.uid },
        initial: false,
      });
    } else {
      navigation.navigate('OtherUserProfile', { userId: selectedUser.uid });
    }
  };

  // Next & previous weeks
  const canGoPrevWeek =
    startDate.isAfter(moment().startOf('day'), 'day') && scrolledToStart;
  const goNextWeek = () => {
    setSelectedDate(null);
    setStartDate((prev) => moment(prev).add(7, 'days'));
    scrollToDate(0, false);
  };
  const goPrevWeek = () => {
    if (!canGoPrevWeek) return;
    setSelectedDate(null);
    setStartDate((prev) => moment(prev).subtract(7, 'days'));
    scrollToDate(6, false);
  };

  // Scroll tracking
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const x = contentOffset.x;
    const visibleWidth = layoutMeasurement.width;
    const totalWidth = contentSize.width;
    const nearEndThreshold = 20;
    const isNearEnd = x + visibleWidth >= totalWidth - nearEndThreshold;
    const isNearStart = x <= nearEndThreshold;
    setScrolledToEnd(isNearEnd);
    setScrolledToStart(isNearStart);
  };
  const showNextWeekButton = scrolledToEnd;

  // When user presses a day in the month calendar
  const handleCalendarDayPress = (dayObj: { dateString: string }) => {
    setCalendarVisible(false);
    const chosenDate = dayObj.dateString;
    setSelectedDate(chosenDate);
  };

  // Custom header with gear icon
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={{ marginRight: 16 }}
          onPress={() => navigation.navigate('CrewSettings', { crewId })}
        >
          <MaterialIcons name="settings" size={24} color="black" />
        </TouchableOpacity>
      ),
      headerTitle: crew
        ? () => (
            <CrewHeader
              crew={crew}
              onPress={() => navigation.navigate('CrewSettings', { crewId })}
            />
          )
        : 'Crew',
      headerTitleAlign: 'left',
      headerStatusBarHeight: insets.top,
    });
  }, [navigation, crew, crewId]);

  if (loading || !crew) {
    return <LoadingOverlay />;
  }

  return (
    <View style={globalStyles.containerWithHeader}>
      <Modal
        visible={calendarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackground}
            activeOpacity={1}
            onPress={() => setCalendarVisible(false)}
          />
          <View style={styles.modalContent}>
            <Calendar
              current={startDate.format('YYYY-MM-DD')}
              onDayPress={handleCalendarDayPress}
              minDate={moment().format('YYYY-MM-DD')}
            />
          </View>
        </View>
      </Modal>

      {/* -- Extracted into WeekNavButtons -- */}
      <WeekNavButtons
        onPrevWeek={goPrevWeek}
        onNextWeek={goNextWeek}
        canGoPrevWeek={canGoPrevWeek}
        showNextWeekButton={showNextWeekButton}
        startDate={startDate}
        onTitlePress={() => setCalendarVisible(true)}
      />

      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekScrollContainer}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        snapToInterval={TOTAL_CARD_WIDTH}
        snapToAlignment="start"
        decelerationRate="fast"
      >
        {weekDates.map((day) => {
          const userIsUp = isUserUpForDay(day);
          const upForItMembers = members.filter(
            (member) => statusesForWeek[day]?.[member.uid],
          );
          const totalUp = upForItMembers.length;
          const totalMembers = members.length;

          return (
            <View key={day} style={styles.dayContainer}>
              <DayContainer
                day={day}
                userIsUp={userIsUp}
                upForItMembers={upForItMembers}
                totalUp={totalUp}
                totalMembers={totalMembers}
                getCrewActivity={getCrewActivity}
                toggleDayStatus={toggleDayStatus}
                navigateToDayChat={navigateToDayChat}
                handlePokeCrew={handlePokeCrew}
                navigateToUserProfile={navigateToUserProfile}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default CrewScreen;

const styles = StyleSheet.create({
  weekScrollContainer: {
    paddingVertical: 10,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
  },
  dayContainer: {
    width: CARD_WIDTH,
    marginRight: CARD_MARGIN,
  },
});
