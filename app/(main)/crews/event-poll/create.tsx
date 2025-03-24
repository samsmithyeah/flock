import React, { useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useUser } from '@/context/UserContext';
import { Calendar } from 'react-native-calendars';
import moment from 'moment';
import Toast from 'react-native-toast-message';
import { createEventPoll } from '@/utils/eventPollHelpers';
import useGlobalStyles from '@/styles/globalStyles';
import CustomTextInput from '@/components/CustomTextInput';
import { Ionicons } from '@expo/vector-icons';

const CreateEventPollScreen: React.FC = () => {
  const { crewId, initialDate } = useLocalSearchParams<{
    crewId: string;
    initialDate?: string;
  }>();
  const { user } = useUser();
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDates, setSelectedDates] = useState<string[]>(
    initialDate ? [initialDate] : [],
  );
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [duration, setDuration] = useState(1); // Default to 1 day
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectDate = (day: { dateString: string }) => {
    const date = day.dateString;

    // If date is already selected, remove it
    if (selectedDates.includes(date)) {
      setSelectedDates(selectedDates.filter((d) => d !== date));
    } else {
      // Add the date
      setSelectedDates([...selectedDates, date]);
    }
  };

  const getMarkedDates = () => {
    const markedDates: { [date: string]: any } = {};

    selectedDates.forEach((date) => {
      markedDates[date] = {
        selected: true,
        selectedColor: '#5f9ea0',
      };
    });

    return markedDates;
  };

  const toggleMultiDay = (value: boolean) => {
    setIsMultiDay(value);
    // Reset duration when toggling - set to 1 if off, 2 if on
    setDuration(value ? 2 : 1);
  };

  const validateForm = () => {
    if (!title.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please enter a title for the event poll',
      });
      return false;
    }

    if (selectedDates.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please select at least one date',
      });
      return false;
    }

    return true;
  };

  const handleCreatePoll = async () => {
    if (!validateForm() || !user || !crewId) return;

    try {
      setIsSubmitting(true);

      await createEventPoll(crewId, user.uid, {
        title,
        description,
        location,
        dates: selectedDates.sort(),
        duration: isMultiDay ? duration : 1, // Always use 1 if multi-day is disabled
      });

      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Event poll created successfully',
      });

      router.replace({
        pathname: '/crews/event-poll',
        params: { crewId },
      });
    } catch (error) {
      console.error('Error creating poll:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to create the poll',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (title || description || location || selectedDates.length > 0) {
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => router.back(),
          },
        ],
      );
    } else {
      router.back();
    }
  };

  // Set header buttons
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.headerCancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={handleCreatePoll}
          disabled={isSubmitting || !title.trim() || selectedDates.length < 2}
        >
          <Text
            style={[
              styles.headerButtonText,
              (isSubmitting || !title.trim() || selectedDates.length < 2) &&
                styles.disabledHeaderButton,
            ]}
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, title, selectedDates.length, isSubmitting]);

  return (
    <ScrollView
      style={globalStyles.containerWithHeader}
      contentContainerStyle={styles.scrollContent}
    >
      <CustomTextInput
        labelText="Event name"
        placeholder="Enter a title for your event"
        value={title}
        onChangeText={setTitle}
        autoCapitalize="sentences"
        returnKeyType="done"
        hasBorder
      />

      <CustomTextInput
        labelText="Description (optional)"
        placeholder="Describe the event"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        autoCapitalize="sentences"
        hasBorder
      />

      <CustomTextInput
        labelText="Location (optional)"
        placeholder="Event location"
        value={location}
        onChangeText={setLocation}
        autoCapitalize="sentences"
        returnKeyType="done"
        enablesReturnKeyAutomatically
        hasBorder
      />

      {/* Multi-day toggle */}
      <View style={styles.optionRow}>
        <Text style={styles.optionLabel}>Multi-day event?</Text>
        <Switch
          value={isMultiDay}
          onValueChange={toggleMultiDay}
          trackColor={{ false: '#D1D1D1', true: '#a0d0d0' }}
          thumbColor={isMultiDay ? '#5f9ea0' : '#f4f3f4'}
        />
      </View>

      {/* Duration selector - only shown if multi-day is toggled on */}
      {isMultiDay && (
        <View>
          <Text style={styles.sectionTitle}>Event duration</Text>
          <Text style={styles.sectionDescription}>
            How many days will this event last?
          </Text>

          <View style={styles.durationSelector}>
            <TouchableOpacity
              onPress={() => setDuration((prev) => Math.max(2, prev - 1))} // Min 2 days for multi-day
              style={styles.durationButton}
              disabled={duration <= 2}
            >
              <Ionicons
                name="remove-circle"
                size={32}
                color={duration <= 2 ? '#CCCCCC' : '#5f9ea0'}
              />
            </TouchableOpacity>

            <View style={styles.durationDisplay}>
              <Text style={styles.durationNumber}>{duration}</Text>
              <Text style={styles.durationLabel}>days</Text>
            </View>

            <TouchableOpacity
              onPress={() => setDuration((prev) => Math.min(14, prev + 1))}
              style={styles.durationButton}
              disabled={duration >= 14}
            >
              <Ionicons
                name="add-circle"
                size={32}
                color={duration >= 14 ? '#CCCCCC' : '#5f9ea0'}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Select potential dates</Text>
      <Text style={styles.sectionDescription}>
        Tap on dates to select multiple options for your poll
      </Text>

      <View style={styles.calendarContainer}>
        <Calendar
          minDate={moment().format('YYYY-MM-DD')}
          markedDates={getMarkedDates()}
          onDayPress={handleSelectDate}
          theme={{
            selectedDayBackgroundColor: '#5f9ea0',
            todayTextColor: '#5f9ea0',
            arrowColor: '#5f9ea0',
            textDayFontSize: 16,
            textMonthFontSize: 16,
            textDayHeaderFontSize: 14,
          }}
        />
      </View>
      <Text style={styles.sectionDescription}>
        {selectedDates.length} date{selectedDates.length !== 1 && 's'} selected
      </Text>

      {isMultiDay && (
        <Text style={styles.multiDayNote}>
          Note: Each selected date represents a potential start date for your{' '}
          {duration}-day event.
        </Text>
      )}
    </ScrollView>
  );
};

export default CreateEventPollScreen;

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 30,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 6,
    color: '#333',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  calendarContainer: {
    backgroundColor: '#FFF',
    padding: 8,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  headerButtonText: {
    fontSize: 16,
    color: '#1e90ff',
    fontWeight: 'bold',
  },
  headerCancelButtonText: {
    fontSize: 16,
    color: '#1e90ff',
  },
  disabledHeaderButton: {
    opacity: 0.5,
    color: '#999',
  },
  durationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    marginVertical: 10,
  },
  durationButton: {
    padding: 8,
  },
  durationDisplay: {
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  durationNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  durationLabel: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  multiDayNote: {
    fontSize: 14,
    color: '#e67e22',
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  optionLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginLeft: 8,
  },
});
