import React, { useState, useEffect, useRef } from 'react';
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
import { Crew } from '@/types/Crew';
import { useCrews } from '@/context/CrewsContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import { useCrewDateChat } from '@/context/CrewDateChatContext';
import useglobalStyles from '@/styles/globalStyles';
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
import { useLocalSearchParams, router } from 'expo-router';
import * as ExpoCalendar from 'expo-calendar';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.75;
const CARD_MARGIN = 16;
const TOTAL_CARD_WIDTH = CARD_WIDTH + CARD_MARGIN;

const CrewCalendarScreen: React.FC = () => {
  const { crewId, date } = useLocalSearchParams<{
    crewId: string;
    date?: string;
  }>();

  const { user } = useUser();
  const { setStatusForCrew, usersCache, subscribeToUsers, fetchCrew } =
    useCrews();
  const { addMemberToChat, removeMemberFromChat } = useCrewDateChat();
  const globalStyles = useglobalStyles();

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

  const [addEventVisible, setAddEventVisible] = useState(false);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CrewEvent | null>(null);

  // Controls for event viewing
  const [viewingEvent, setViewingEvent] = useState<CrewEvent | null>(null);
  const [viewEventModalVisible, setViewEventModalVisible] = useState(false);

  const [eventsForWeek, setEventsForWeek] = useState<{
    [day: string]: CrewEvent[];
  }>({});

  // Set selected date if provided as a route param
  useEffect(() => {
    if (date) {
      setSelectedDate(date);
    }
  }, [date]);

  // Calculate weekDates from startDate
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

    const fetchCrewData = async () => {
      try {
        const crewData = await fetchCrew(crewId);
        if (crewData) {
          setCrew(crewData);
          if (crewData.memberIds) {
            subscribeToUsers(crewData.memberIds);
          }
        } else {
          router.push('/crews/');
        }
      } catch (error) {
        console.error('Error fetching crew:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not fetch crew data',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchCrewData();

    // Also listen for real-time updates
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
        } else {
          router.push('/crews/');
        }
      },
      (error) => {
        if (error.code === 'permission-denied') return;
        console.error('Error in crew snapshot:', error);
      },
    );

    return () => unsubscribeCrew();
  }, [crewId, user, fetchCrew, subscribeToUsers]);

  // Update members from cached users
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
    const q = query(eventsRef, orderBy('date'));

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

        // Group events by their date
        for (const event of allEvents) {
          const eventDate = event.date;
          if (weekDates.includes(eventDate)) {
            groupedByDay[eventDate].push(event);
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
        },
      );

      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((fn) => fn());
  }, [crewId, user, weekDates]);

  // Scroll to selected date if in current week
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
    return statusesForWeek[day]?.[user.uid];
  };

  const getCrewActivity = () =>
    crew?.activity ? crew.activity.toLowerCase() : 'meeting up';

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
              await deleteEventFromCrew(crewId, eventId);
              Toast.show({
                type: 'success',
                text1: 'Deleted',
                text2: 'Event was removed successfully.',
              });

              // Check if user is available on the event date
              const eventDate = editingEvent.date;
              const userIsAvailable = isUserUpForDay(eventDate);

              if (userIsAvailable) {
                Alert.alert(
                  'Clear availability',
                  'Do you want to clear your availability on the deleted event date?',
                  [
                    { text: 'No', style: 'cancel' },
                    {
                      text: 'Yes',
                      onPress: () => {
                        if (!user) return;
                        setStatusForCrew(crewId, eventDate, null);
                        removeMemberFromChat(
                          `${crewId}_${eventDate}`,
                          user.uid,
                        );
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
    date: string,
    unconfirmed?: boolean,
    location?: string,
  ) => {
    if (!crewId || !user?.uid) return;
    setIsAddingEvent(true);
    try {
      if (editingEvent) {
        // Handle updating an existing event
        await updateEventInCrew(crewId, editingEvent.id, user.uid, {
          title,
          date,
          unconfirmed,
          location,
        });

        // Set user status for the event date
        setStatusForCrew(crewId, date, true);
        addMemberToChat(`${crewId}_${date}`, user.uid);

        // If the date changed, handle availability for the old date
        if (editingEvent.date !== date && isUserUpForDay(editingEvent.date)) {
          Alert.alert(
            'Update availability',
            'The event date has changed. Do you want to mark yourself as not available on the previous date?',
            [
              { text: 'No', style: 'cancel' },
              {
                text: 'Yes',
                onPress: () => {
                  if (!user) return;
                  setStatusForCrew(crewId, editingEvent.date, false);
                  removeMemberFromChat(
                    `${crewId}_${editingEvent.date}`,
                    user.uid,
                  );
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
        // Create a new event
        await addEventToCrew(
          crewId,
          { title, date, unconfirmed, location },
          user.uid,
        );

        // Set user status for the event date
        setStatusForCrew(crewId, date, true);
        addMemberToChat(`${crewId}_${date}`, user.uid);

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

  const handleAddToCalendar = async (event: CrewEvent) => {
    const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({
        text1: 'Cannot add event to calendar',
        text2: 'Calendar permission not granted',
        type: 'error',
      });
      return;
    }

    const calendars = await ExpoCalendar.getCalendarsAsync(
      ExpoCalendar.EntityTypes.EVENT,
    );
    const modifiableCalendars = calendars.filter(
      (cal) => cal.allowsModifications,
    );

    if (!modifiableCalendars.length) {
      Toast.show({
        text1: 'Cannot add event to calendar',
        text2: 'No modifiable calendar available',
        type: 'error',
      });
      return;
    }

    let calendarIdToUse: string | null = null;

    try {
      const osDefaultCalendar = await ExpoCalendar.getDefaultCalendarAsync();
      if (osDefaultCalendar && osDefaultCalendar.allowsModifications) {
        calendarIdToUse = osDefaultCalendar.id;
      }
    } catch (error) {
      console.error('Error getting OS default calendar:', error);
    }

    if (!calendarIdToUse) {
      calendarIdToUse = modifiableCalendars[0].id;
    }

    try {
      const eventCreatorName = members.find(
        (m) => m.uid === event.createdBy,
      )?.displayName;
      const eventDetails = {
        title: `${event.title} with ${crew?.name || 'your crew'}`,
        startDate: new Date(event.date),
        endDate: new Date(event.date),
        location: event.location,
        notes: `Event created in Flock by ${eventCreatorName}`,
        allDay: true,
        alarms: [{ relativeOffset: -60 * 30 }],
      };
      await ExpoCalendar.createEventAsync(calendarIdToUse, eventDetails);
      Toast.show({
        text1: 'Success',
        text2: 'Event added to your calendar',
        type: 'success',
      });
    } catch (error) {
      console.error('Error adding event to calendar:', error);
      Toast.show({
        text1: 'Error',
        text2: 'An error occurred while adding the event to your calendar',
        type: 'error',
      });
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
      "Send a poke to members who haven't responded on this day yet?",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Poke',
          onPress: async () => {
            try {
              interface PokeResponse {
                success: boolean;
                message: string;
              }
              const poke = await pokeCrew(crewId, day, user.uid);
              if ((poke.data as PokeResponse).success) {
                Toast.show({
                  type: 'success',
                  text1: 'Poke sent',
                  text2: (poke.data as PokeResponse).message,
                });
              } else {
                Toast.show({
                  type: 'info',
                  text1: 'No pokes sent',
                  text2: (poke.data as PokeResponse).message,
                });
              }
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
    router.push(
      {
        pathname: '/chats/crew-date-chat',
        params: { crewId, date: day },
      },
      { withAnchor: true },
    );
  };

  const navigateToUserProfile = (selectedUser: User) => {
    if (!user) return;
    if (selectedUser.uid === user.uid) {
      router.push(
        {
          pathname: '/profile',
          params: { userId: user.uid },
        },
        { withAnchor: true },
      );
    } else {
      router.push(
        {
          pathname: '/contacts/other-user-profile',
          params: { userId: selectedUser.uid },
        },
        { withAnchor: true },
      );
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
    setSelectedDate(dayObj.dateString);
  };

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
        defaultDate={editingEvent?.date || selectedDate || undefined}
        defaultUnconfirmed={editingEvent?.unconfirmed}
        defaultLocation={editingEvent?.location}
        isEditing={!!editingEvent}
        onDelete={() => editingEvent?.id && handleDeleteEvent(editingEvent.id)}
        onAddToCalendar={
          editingEvent ? () => handleAddToCalendar(editingEvent) : undefined
        }
        crewId={crewId}
      />

      {viewingEvent && (
        <EventInfoModal
          isVisible={viewEventModalVisible}
          onClose={() => setViewEventModalVisible(false)}
          event={viewingEvent}
          onAddToCalendar={() => handleAddToCalendar(viewingEvent)}
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

export default CrewCalendarScreen;

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
