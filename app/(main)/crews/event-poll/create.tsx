import React, { useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useUser } from '@/context/UserContext';
import { Calendar } from 'react-native-calendars';
import moment from 'moment';
import Toast from 'react-native-toast-message';
import { createEventPoll } from '@/utils/eventPollHelpers';
import useGlobalStyles from '@/styles/globalStyles';
import CustomTextInput from '@/components/CustomTextInput';

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
          <Text style={styles.headerButtonText}>Cancel</Text>
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
    marginVertical: 12,
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
  },
  disabledHeaderButton: {
    opacity: 0.5,
  },
});
