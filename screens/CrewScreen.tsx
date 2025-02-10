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
} from '@react-navigation/native';
import {
  doc,
  collection,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
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
import AddEventModal from '@/components/AddEventModal';
import EventInfoModal from '@/components/EventInfoModal';
import {
  addEventToCrew,
  deleteEventFromCrew,
  updateEventInCrew,
} from '@/utils/addEventToCrew';
import { CrewEvent } from '@/types/CrewEvent';

type CrewScreenRouteProp = RouteProp<NavParamList, 'Crew'>;

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.75;
const CARD_MARGIN = 16;
const TOTAL_CARD_WIDTH = CARD_WIDTH + CARD_MARGIN;

// Helper to get all dates between two dates (inclusive)
const getDatesBetween = (start: string, end: string): string[] => {
  const dates: string[] = [];
  let current = moment(start, 'YYYY-MM-DD');
  const last = moment(end, 'YYYY-MM-DD');
  while (current.isSameOrBefore(last, 'day')) {
    dates.push(current.format('YYYY-MM-DD'));
    current.add(1, 'day');
  }
  return dates;
};

const CrewScreen: React.FC = () => {
  const route = useRoute<CrewScreenRouteProp>();
  const { crewId, date } = route.params;
  const navigation = useNavigation<NavigationProp<NavParamList>>();
  const { user } = useUser();
  const { setStatusForCrew, usersCache, subscribeToUsers } = useCrews();
  const { addMemberToChat, removeMemberFromChat } = useCrewDateChat();
  const globalStyles = useglobalStyles();
  const insets = useSafeAreaInsets();

  const [crew, setCrew] = useState<Crew | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Moment>(moment().startOf('day'));
  const [weekDates, setWeekDates] = useState<string[]>([]);
  const [statusesForWeek, setStatusesForWeek] = useState<{
    [date: string]: { [userId: string]: boolean | null };
  }>({});
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [scrolledToStart, setScrolledToStart] = useState<boolean | undefined>(
    undefined,
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Controls for AddEventModal
  const [addEventVisible, setAddEventVisible] = useState(false);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CrewEvent | null>(null);
  const [viewingEvent, setViewingEvent] = useState<CrewEvent | null>(null);
  const [viewEventModalVisible, setViewEventModalVisible] = useState(false);

  const [eventsForWeek, setEventsForWeek] = useState<{
    [day: string]: CrewEvent[];
  }>({});

  useEffect(() => {
    if (date) {
      setSelectedDate(date);
    }
  }, [date]);

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

    return () => {
      unsubscribeCrew();
    };
  }, [crewId, user, navigation]);

  useEffect(() => {
    if (crew && crew.memberIds && crew.memberIds.length > 0) {
      subscribeToUsers(crew.memberIds);
    }
  }, [crew, subscribeToUsers]);

  useEffect(() => {
    if (crew && crew.memberIds && crew.memberIds.length > 0) {
      const updatedMembers = crew.memberIds
        .map((memberId) => usersCache[memberId])
        .filter(Boolean) as User[];
      setMembers(updatedMembers);
    } else {
      setMembers([]);
    }
  }, [crew, usersCache]);

  // Fetch events for the current week
  useEffect(() => {
    if (!crewId || !weekDates.length || !user) return;

    const eventsRef = collection(db, 'crews', crewId, 'events');
    const q = query(eventsRef, orderBy('startDate'));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const allEvents = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<CrewEvent, 'id'>;
          return { ...data, id: docSnap.id };
        });

        const groupedByDay: { [day: string]: CrewEvent[] } = {};
        weekDates.forEach((day) => {
          groupedByDay[day] = [];
        });

        const isDayWithinEvent = (day: string, event: CrewEvent) => {
          const d = moment(day, 'YYYY-MM-DD');
          const start = moment(event.startDate, 'YYYY-MM-DD');
          const end = moment(event.endDate, 'YYYY-MM-DD');
          return d.isBetween(start, end, 'day', '[]');
        };

        for (const event of allEvents) {
          for (const day of weekDates) {
            if (isDayWithinEvent(day, event)) {
              groupedByDay[day].push(event);
            }
          }
        }
        setEventsForWeek(groupedByDay);
      },
      (error) => {
        if (error.code === 'permission-denied') return;
        console.error('Error fetching events:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not fetch events.',
        });
      },
    );

    return () => unsub();
  }, [crewId, weekDates, user]);

  // Listen for user statuses for each day
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
            const newStatusesForDay: { [userId: string]: boolean | null } = {};
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              console.log(
                'User status for',
                docSnap.id,
                'on',
                day,
                data.upForGoingOutTonight,
              );
              newStatusesForDay[docSnap.id] =
                data.upForGoingOutTonight !== undefined
                  ? data.upForGoingOutTonight
                  : null;
            });
            return { ...prev, [day]: newStatusesForDay };
          });
        },
        (error) => {
          if (error.code === 'permission-denied') return;
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

  // Scroll to selected date if it's in the current week
  useEffect(() => {
    if (selectedDate && weekDates.length > 0) {
      const dateIndex = weekDates.indexOf(selectedDate);
      if (dateIndex === -1) {
        const newStartDate = moment(selectedDate).startOf('week');
        const today = moment().startOf('day');
        if (newStartDate.isBefore(today)) {
          setStartDate(today);
        } else {
          setStartDate(newStartDate);
        }
      } else {
        scrollToDate(dateIndex);
      }
    }
  }, [selectedDate, weekDates, startDate]);

  const scrollToDate = (dateIndex: number, animated: boolean = true) => {
    setTimeout(() => {
      if (!scrollViewRef.current) return;
      if (dateIndex < 0) return;
      const scrollAmount = dateIndex * TOTAL_CARD_WIDTH;
      scrollViewRef.current.scrollTo({ x: scrollAmount, animated });
    }, 150);
  };

  const isUserUpForDay = (day: string) => {
    if (!user) return undefined;
    // Returns true, false or undefined/null (if no status exists)
    console.log('Checking status for', day, user.uid);
    console.log('Status:', statusesForWeek[day]?.[user.uid]);
    return statusesForWeek[day]?.[user.uid];
  };

  const getCrewActivity = () =>
    crew?.activity ? crew.activity.toLowerCase() : 'meeting up';

  // Updated toggleDayStatus to accept a new status (true for available, false for not available)
  const toggleDayStatus = async (day: string, newStatus: boolean | null) => {
    if (!user?.uid || !crew) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'User or crew data not found',
      });
      return;
    }
    const chatId = `${crewId}_${day}`;

    console.log('Toggling status for', day, 'to', newStatus);
    await setStatusForCrew(crewId, day, newStatus);

    if (newStatus) {
      await addMemberToChat(chatId, user.uid);
    } else {
      await removeMemberFromChat(chatId, user.uid);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!crewId || !eventId || !editingEvent) return;
    Alert.alert(
      'Delete event?',
      'Are you sure you want to delete this event?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const eventDates = getDatesBetween(
                editingEvent.startDate,
                editingEvent.endDate,
              );
              await deleteEventFromCrew(crewId, eventId);
              Toast.show({
                type: 'success',
                text1: 'Deleted',
                text2: 'Event was removed successfully.',
              });
              const userIsAvailableOnAnyDate = eventDates.some((day) =>
                isUserUpForDay(day),
              );

              if (userIsAvailableOnAnyDate) {
                Alert.alert(
                  'Clear availability',
                  'Do you want to clear your availability on the deleted event date(s)?',
                  [
                    { text: 'No', style: 'cancel' },
                    {
                      text: 'Yes',
                      onPress: () => {
                        if (!user) return;
                        eventDates.forEach((day) => {
                          setStatusForCrew(crewId, day, null);
                          removeMemberFromChat(`${crewId}_${day}`, user.uid);
                        });
                      },
                    },
                  ],
                );
              }
            } catch (err) {
              console.error('Error deleting event:', err);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Could not delete event.',
              });
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const handleSaveEvent = async (
    title: string,
    start: string,
    end: string,
    unconfirmed?: boolean,
    location?: string,
  ) => {
    if (!crewId || !user?.uid) return;
    setIsAddingEvent(true);
    try {
      if (editingEvent) {
        const normalizedOldDates = getDatesBetween(
          moment(editingEvent.startDate).format('YYYY-MM-DD'),
          moment(editingEvent.endDate).format('YYYY-MM-DD'),
        );
        const normalizedNewDates = getDatesBetween(
          moment(start).format('YYYY-MM-DD'),
          moment(end).format('YYYY-MM-DD'),
        );

        await updateEventInCrew(crewId, editingEvent.id, user.uid, {
          title,
          startDate: start,
          endDate: end,
          unconfirmed,
          location,
        });

        normalizedNewDates.forEach((day) => {
          setStatusForCrew(crewId, day, true);
          addMemberToChat(`${crewId}_${day}`, user.uid);
        });

        const removedDates = normalizedOldDates.filter(
          (day) => !normalizedNewDates.includes(day) && isUserUpForDay(day),
        );
        if (removedDates.length > 0) {
          Alert.alert(
            'Update availability',
            'The event dates have changed. Do you want to mark yourself as not available on the removed date(s)?',
            [
              { text: 'No', style: 'cancel' },
              {
                text: 'Yes',
                onPress: () => {
                  removedDates.forEach((day) => {
                    setStatusForCrew(crewId, day, false);
                    removeMemberFromChat(`${crewId}_${day}`, user.uid);
                  });
                },
              },
            ],
          );
        }
        Toast.show({
          type: 'success',
          text1: 'Event Updated',
          text2: 'Event successfully updated.',
        });
      } else {
        await addEventToCrew(
          crewId,
          { title, startDate: start, endDate: end, unconfirmed, location },
          user.uid,
        );
        const eventDates = getDatesBetween(start, end);
        eventDates.forEach((day) => {
          setStatusForCrew(crewId, day, true);
          addMemberToChat(`${crewId}_${day}`, user.uid);
        });
        Toast.show({
          type: 'success',
          text1: 'Event Added',
          text2: 'Event successfully added.',
        });
      }
    } catch (error) {
      console.error('Error saving event:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to save event.',
      });
    } finally {
      setIsAddingEvent(false);
      setAddEventVisible(false);
      setEditingEvent(null);
    }
  };

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

  const handleAddEvent = (day: string) => {
    setSelectedDate(day);
    setEditingEvent(null);
    setAddEventVisible(true);
  };

  const handleEditEvent = (day: string, evt: CrewEvent) => {
    setSelectedDate(day);
    setEditingEvent(evt);
    setAddEventVisible(true);
  };

  const handleViewEvent = (evt: CrewEvent) => {
    setViewingEvent(evt);
    setViewEventModalVisible(true);
  };

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

  const handleCalendarDayPress = (dayObj: { dateString: string }) => {
    setCalendarVisible(false);
    const chosenDate = dayObj.dateString;
    setSelectedDate(chosenDate);
  };

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
  }, [navigation, crew, crewId, insets.top]);

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

      <AddEventModal
        isVisible={addEventVisible}
        onClose={() => {
          setAddEventVisible(false);
          setEditingEvent(null);
        }}
        onSubmit={handleSaveEvent}
        loading={isAddingEvent}
        defaultTitle={editingEvent?.title}
        defaultStart={editingEvent?.startDate || selectedDate || undefined}
        defaultEnd={editingEvent?.endDate || selectedDate || undefined}
        defaultUnconfirmed={editingEvent?.unconfirmed}
        defaultLocation={editingEvent?.location}
        isEditing={!!editingEvent}
        onDelete={() => editingEvent?.id && handleDeleteEvent(editingEvent.id)}
      />

      {viewingEvent && (
        <EventInfoModal
          isVisible={viewEventModalVisible}
          onClose={() => setViewEventModalVisible(false)}
          event={viewingEvent}
        />
      )}

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
          const userStatus = isUserUpForDay(day);
          const upForItMembers = members.filter(
            (member) => statusesForWeek[day]?.[member.uid] === true,
          );
          const unavailableMembers = members.filter(
            (member) =>
              statusesForWeek[day] &&
              statusesForWeek[day][member.uid] === false,
          );
          const totalUp = upForItMembers.length;
          const totalMembers = members.length;
          const dayEvents = eventsForWeek[day] || [];

          return (
            <View key={day} style={styles.dayContainer}>
              <DayContainer
                day={day}
                userStatus={userStatus}
                upForItMembers={upForItMembers}
                unavailableMembers={unavailableMembers}
                totalUp={totalUp}
                totalMembers={totalMembers}
                getCrewActivity={getCrewActivity}
                toggleDayStatus={toggleDayStatus}
                navigateToDayChat={navigateToDayChat}
                handlePokeCrew={handlePokeCrew}
                navigateToUserProfile={navigateToUserProfile}
                onAddEvent={handleAddEvent}
                onEditEvent={handleEditEvent}
                onViewEvent={handleViewEvent}
                events={dayEvents}
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
