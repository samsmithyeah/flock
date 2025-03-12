import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useUser } from '@/context/UserContext';
import { useCrews } from '@/context/CrewsContext';
import { Calendar } from 'react-native-calendars';
import moment from 'moment';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { createEventPoll } from '@/utils/eventPollHelpers';
import useGlobalStyles from '@/styles/globalStyles';
import CustomTextInput from '@/components/CustomTextInput';
import CustomButton from '@/components/CustomButton';

const CreateEventPollScreen: React.FC = () => {
  const { crewId, initialDate } = useLocalSearchParams<{
    crewId: string;
    initialDate?: string;
  }>();
  const { user } = useUser();
  const { fetchCrew } = useCrews();
  const globalStyles = useGlobalStyles();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDates, setSelectedDates] = useState<string[]>(
    initialDate ? [initialDate] : [],
  );
  const [crewName, setCrewName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch crew name
  useEffect(() => {
    const getCrewName = async () => {
      try {
        if (crewId) {
          const crew = await fetchCrew(crewId);
          if (crew) {
            setCrewName(crew.name);
          }
        }
      } catch (error) {
        console.error('Error fetching crew details:', error);
      }
    };

    getCrewName();
  }, [crewId, fetchCrew]);

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
      });

      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Event poll created successfully',
      });

      router.push({
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

  return (
    <ScrollView
      style={globalStyles.containerWithHeader}
      contentContainerStyle={styles.scrollContent}
    >
      <Text style={styles.headerText}>Create Event Poll for {crewName}</Text>

      <CustomTextInput
        labelText="Event name"
        placeholder="Enter a title for your event"
        value={title}
        onChangeText={setTitle}
        autoCapitalize="sentences"
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
        hasBorder
      />

      <Text style={styles.sectionTitle}>Select Potential Dates</Text>
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

      <View style={styles.selectedDatesContainer}>
        <Text style={styles.selectedDatesTitle}>
          Selected Dates ({selectedDates.length})
        </Text>
        {selectedDates.length > 0 ? (
          selectedDates.sort().map((date) => (
            <View key={date} style={styles.selectedDateItem}>
              <Text style={styles.selectedDateText}>
                {moment(date).format('ddd, MMM D, YYYY')}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setSelectedDates(selectedDates.filter((d) => d !== date))
                }
                style={styles.removeButton}
              >
                <Ionicons name="close-circle" size={20} color="#FF6B6B" />
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={styles.noDateText}>No dates selected</Text>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <CustomButton
          title="Cancel"
          onPress={handleCancel}
          variant="secondary"
          style={styles.buttonSpace}
        />
        <CustomButton
          title="Create Poll"
          onPress={handleCreatePoll}
          variant="primary"
          disabled={isSubmitting || !title.trim() || selectedDates.length === 0}
          loading={isSubmitting}
        />
      </View>
    </ScrollView>
  );
};

export default CreateEventPollScreen;

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 30,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
    color: '#333',
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
    marginBottom: 12,
  },
  calendarContainer: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedDatesContainer: {
    marginTop: 20,
    backgroundColor: '#F7F7F7',
    borderRadius: 8,
    padding: 12,
  },
  selectedDatesTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 10,
    color: '#333',
  },
  selectedDateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginVertical: 4,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  selectedDateText: {
    fontSize: 14,
    color: '#333',
  },
  removeButton: {
    padding: 4,
  },
  noDateText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  buttonSpace: {
    marginRight: 8,
  },
});
