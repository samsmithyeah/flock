// screens/CrewScreen.tsx

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
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
} from '@react-navigation/native';
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import moment, { Moment } from 'moment';
import { db, pokeCrew } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { User } from '@/types/User';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { NavParamList } from '@/navigation/AppNavigator';
import MemberList from '@/components/MemberList';
import { Crew } from '@/types/Crew';
import CustomButton from '@/components/CustomButton';
import CrewHeader from '@/components/CrewHeader';
import { useCrews } from '@/context/CrewsContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import { useCrewDateChat } from '@/context/CrewDateChatContext';
import useglobalStyles from '@/styles/globalStyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFormattedDate } from '@/utils/dateHelpers';
import { Calendar } from 'react-native-calendars';

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

  const [crew, setCrew] = useState<Crew | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState<Moment>(moment().startOf('day'));
  const [weekDates, setWeekDates] = useState<string[]>([]);
  const [statusesForWeek, setStatusesForWeek] = useState<{
    [date: string]: { [userId: string]: boolean };
  }>({});

  const globalStyles = useglobalStyles();
  const insets = useSafeAreaInsets();
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [scrolledToStart, setScrolledToStart] = useState<boolean | undefined>(
    undefined,
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (date) {
      setSelectedDate(date);
    }
  }, [date]);

  // Generate the 7-day window from startDate
  useEffect(() => {
    const days: string[] = [];
    const numberOfDays = 7;
    for (let i = 0; i < numberOfDays; i++) {
      days.push(moment(startDate).add(i, 'days').format('YYYY-MM-DD'));
    }
    setWeekDates(days);
    console.log('startDate:', startDate.format('YYYY-MM-DD'));
    console.log('weekDates:', days);
  }, [startDate]);

  // 2) Fetch crew data
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

  // 3) Fetch members of the crew
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

  // 4) Firestore listeners for each day in "weekDates"
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

  // Handle a `date` param passed in route.params
  useEffect(() => {
    // console.log('date:', date);
    // console.log('weekDates:', weekDates);
    // console.log('startDate:', startDate.format('YYYY-MM-DD'));
    if (selectedDate && weekDates.length > 0) {
      const dateIndex = weekDates.indexOf(selectedDate);
      console.log('selectedDate:', selectedDate);
      console.log('weekDates:', weekDates);
      console.log('dateIndex:', dateIndex);
      if (dateIndex === -1) {
        const newStartDate = moment(selectedDate).startOf('week');
        console.log(
          'Setting new start date:',
          newStartDate.format('YYYY-MM-DD'),
        );
        setStartDate(newStartDate);
        return;
      }
      scrollToDate(dateIndex);
    }
  }, [selectedDate, weekDates, startDate]);

  useEffect(() => {
    if (scrollViewRef.current) {
      console.log('ScrollView ref mounted');
    }
  }, [scrollViewRef.current]);

  // Utilities
  const scrollToDate = (dateIndex: number) => {
    console.log('scrollToDate called with index:', dateIndex);

    // Add timeout to ensure layout is complete
    setTimeout(() => {
      if (!scrollViewRef.current) {
        console.warn('ScrollView ref not available');
        return;
      }

      if (dateIndex < 0) {
        console.warn('Invalid date index:', dateIndex);
        return;
      }

      const scrollAmount = dateIndex * TOTAL_CARD_WIDTH;
      console.log('Scrolling to:', scrollAmount);

      scrollViewRef.current.scrollTo({
        x: scrollAmount,
        animated: true,
      });
    }, 100);
  };

  const getMarkedDates = () => {
    const markedDates: {
      [date: string]: { marked?: boolean; selected?: boolean };
    } = {};

    // Mark dates where at least one person is up for it
    Object.entries(statusesForWeek).forEach(([date, statuses]) => {
      if (Object.values(statuses).some((status) => status)) {
        markedDates[date] = { marked: true };
      }
    });

    // Mark the selected date if there is one
    if (selectedDate) {
      markedDates[selectedDate] = {
        ...markedDates[selectedDate],
        selected: true,
      };
    }

    return markedDates;
  };

  const getCrewActivity = () =>
    crew?.activity ? crew.activity.toLowerCase() : 'meeting up';

  const isUserUpForDay = (day: string) => {
    if (!user) return false;
    return statusesForWeek[day]?.[user.uid] || false;
  };

  const getUpForItMembers = (day: string) => {
    return members.filter((member) => statusesForWeek[day]?.[member.uid]);
  };

  // Toggling user status
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

  // Show/hide the "Prev 7 Days" button if moving earlier would go before today
  const canGoPrevWeek =
    startDate.isAfter(moment().startOf('day'), 'day') && scrolledToStart;

  // Move forward/back
  const goNextWeek = () => {
    setSelectedDate(null);
    setStartDate((prev) => moment(prev).add(7, 'days'));
  };
  const goPrevWeek = () => {
    // Only allow if we won't cross "today"
    if (!canGoPrevWeek) return;
    setSelectedDate(null);
    setStartDate((prev) => moment(prev).subtract(7, 'days'));
  };

  // Listen to scroll events and see if user is near the right edge
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const x = contentOffset.x;
    const visibleWidth = layoutMeasurement.width;
    const totalWidth = contentSize.width;

    // The threshold can be a few pixels to allow for floating point offsets
    const nearEndThreshold = 20;
    const isNearEnd = x + visibleWidth >= totalWidth - nearEndThreshold;

    const isNearStart = x <= nearEndThreshold;

    setScrolledToEnd(isNearEnd);
    setScrolledToStart(isNearStart);
  };

  // Only render Next 7 Days if user has scrolled to the end
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
      {/* Calendar as a Modal Overlay */}
      <Modal
        visible={calendarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.modalOverlay}>
          {/* A background that closes modal when tapped */}
          <TouchableOpacity
            style={styles.modalBackground}
            activeOpacity={1}
            onPress={() => setCalendarVisible(false)}
          />
          {/* The calendar card itself */}
          <View style={styles.modalContent}>
            <Calendar
              current={startDate.format('YYYY-MM-DD')}
              onDayPress={handleCalendarDayPress}
              minDate={moment().format('YYYY-MM-DD')}
              markedDates={getMarkedDates()}
            />
          </View>
        </View>
      </Modal>

      {/* Header with prev arrow, title, next arrow */}
      <View style={styles.navButtonsContainer}>
        <TouchableOpacity
          onPress={goPrevWeek}
          disabled={!canGoPrevWeek}
          style={!canGoPrevWeek ? { opacity: 0 } : {}}
        >
          <Ionicons name="arrow-back" size={24} color="#1e90ff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.weekTitleContainer}
          onPress={() => setCalendarVisible(true)}
        >
          <Text style={styles.weekTitle}>
            {moment(startDate).format('MMM Do')} →{' '}
            {moment(startDate).add(6, 'days').format('MMM Do')}
          </Text>
          <Ionicons
            name="calendar-outline"
            size={24}
            color="#1e90ff"
            style={styles.calendarIcon}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goNextWeek}
          disabled={!showNextWeekButton}
          style={!showNextWeekButton ? { opacity: 0 } : {}}
        >
          <Ionicons name="arrow-forward" size={24} color="#1e90ff" />
        </TouchableOpacity>
      </View>

      {/* Horizontal scroll of the 7 days */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekScrollContainer}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {weekDates.map((day) => {
          const userIsUp = isUserUpForDay(day);
          const upForItMembers = getUpForItMembers(day);
          const totalUp = upForItMembers.length;
          const totalMembers = members.length;

          return (
            <View key={day} style={styles.dayContainer}>
              <Text style={styles.dayHeader}>{getFormattedDate(day)}</Text>

              <CustomButton
                title={userIsUp ? "You're in" : 'Count me in'}
                variant={userIsUp ? 'secondary' : 'primary'}
                onPress={() => toggleDayStatus(day)}
                icon={{
                  name: userIsUp ? 'star' : 'star-outline',
                  size: 18,
                }}
              />

              {userIsUp ? (
                <>
                  <Text style={styles.countText}>
                    {totalUp} of {totalMembers} up for {getCrewActivity()}
                  </Text>
                  <View style={styles.memberListContainer}>
                    <MemberList
                      members={upForItMembers}
                      currentUserId={user?.uid || ''}
                      emptyMessage="No one's up yet"
                      onMemberPress={navigateToUserProfile}
                      scrollEnabled
                    />
                  </View>

                  {totalUp > 1 && (
                    <CustomButton
                      title="Group chat"
                      variant="secondary"
                      onPress={() => navigateToDayChat(day)}
                      icon={{
                        name: 'chatbubble-ellipses-outline',
                        size: 18,
                      }}
                    />
                  )}

                  {totalUp < totalMembers && (
                    <View style={styles.actionButton}>
                      <CustomButton
                        title="Poke the others"
                        variant="secondary"
                        onPress={() => handlePokeCrew(day)}
                        icon={{
                          name: 'notifications-outline',
                          size: 18,
                        }}
                      />
                    </View>
                  )}

                  {totalUp === totalMembers && (
                    <Text style={styles.everyoneInText}>
                      Everyone is up for it!
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.joinPrompt}>
                  Join to see who’s up for {getCrewActivity()}.
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default CrewScreen;

const styles = StyleSheet.create({
  navButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  calendarIcon: {
    marginLeft: 8,
  },
  weekScrollContainer: {
    paddingVertical: 10,
  },
  dayContainer: {
    width: CARD_WIDTH,
    marginRight: CARD_MARGIN,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    justifyContent: 'flex-start',
    height: '100%',
    flex: 1,
  },
  dayHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  countText: {
    marginVertical: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  joinPrompt: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  everyoneInText: {
    marginTop: 8,
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
    textAlign: 'center',
  },
  actionButton: {
    marginTop: 8,
  },
  memberListContainer: {
    flex: 1,
    marginVertical: 8,
  },

  // -- MODAL OVERLAY STYLES --
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // The child can be pressed, so we also have a background for closing the modal
  },
  modalBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)', // dark overlay
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
  },
});
