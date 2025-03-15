import React, { useState, useLayoutEffect, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useUser } from '@/context/UserContext';
import { Calendar } from 'react-native-calendars';
import moment from 'moment';
import Toast from 'react-native-toast-message';
import { getPollById, updateEventPoll } from '@/utils/eventPollHelpers';
import useGlobalStyles from '@/styles/globalStyles';
import CustomTextInput from '@/components/CustomTextInput';
import LoadingOverlay from '@/components/LoadingOverlay';

const EditEventPollScreen: React.FC = () => {
  const { pollId, crewId } = useLocalSearchParams<{
    pollId: string;
    crewId: string;
  }>();
  const { user } = useUser();
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [originalDateOptions, setOriginalDateOptions] = useState<string[]>([]);
  const [hasResponses, setHasResponses] = useState(false);

  // Fetch poll data
  useEffect(() => {
    const fetchPollData = async () => {
      if (!pollId) return;

      try {
        const pollData = await getPollById(pollId);
        if (pollData) {
          // Check if user is the creator
          if (pollData.createdBy !== user?.uid) {
            Toast.show({
              type: 'error',
              text1: 'Error',
              text2: 'You are not authorized to edit this poll',
            });
            router.back();
            return;
          }

          // Check if poll is already finalized
          if (pollData.finalized) {
            Toast.show({
              type: 'error',
              text1: 'Error',
              text2:
                'This poll has already been finalized and cannot be edited',
            });
            router.back();
            return;
          }

          // Populate form fields
          setTitle(pollData.title);
          setDescription(pollData.description || '');
          setLocation(pollData.location || '');

          // Get dates from options
          const dates = pollData.options.map((option) => option.date);
          setSelectedDates(dates);
          setOriginalDateOptions(dates);

          // Check if there are any responses
          const hasAnyResponses = pollData.options.some(
            (option) =>
              option.responses && Object.keys(option.responses).length > 0,
          );
          setHasResponses(hasAnyResponses);
        } else {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Poll not found',
          });
          router.back();
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching poll:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Failed to load poll data',
        });
        router.back();
      }
    };

    fetchPollData();
  }, [pollId, user, router]);

  const handleSelectDate = (day: { dateString: string }) => {
    const date = day.dateString;

    // If there are responses, only allow adding new dates, not removing existing ones
    if (hasResponses && originalDateOptions.includes(date)) {
      Toast.show({
        type: 'info',
        text1: 'Info',
        text2: 'Cannot remove dates that have responses',
      });
      return;
    }

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

  const handleUpdatePoll = async () => {
    if (!validateForm() || !user || !crewId || !pollId) return;

    try {
      setIsSubmitting(true);

      // Prepare updates - ensure we're using the latest state
      const updates: any = {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
      };

      // Handle date options - only add new dates if there are responses
      if (hasResponses) {
        // Get existing poll to preserve responses
        const existingPoll = await getPollById(pollId);
        if (!existingPoll) throw new Error('Poll not found');

        // Keep existing options
        let updatedOptions = [...existingPoll.options];

        // Add new dates that weren't in the original options
        const newDates = selectedDates.filter(
          (date) => !originalDateOptions.includes(date),
        );

        newDates.forEach((date) => {
          updatedOptions.push({
            date,
            responses: {},
          });
        });

        // Sort options by date
        updatedOptions.sort((a, b) => a.date.localeCompare(b.date));
        updates.options = updatedOptions;
      } else {
        // No responses yet, we can completely replace options
        updates.options = selectedDates.sort().map((date) => ({
          date,
          responses: {},
        }));
      }

      // Use our new helper function to ensure all fields are updated
      await updateEventPoll(pollId, updates);

      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Poll updated successfully',
      });

      // Navigate back to poll detail screen
      router.replace({
        pathname: '/crews/event-poll/[pollId]',
        params: { pollId, crewId },
      });
    } catch (error) {
      console.error('Error updating poll:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to update the poll',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  // Set header buttons
  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Edit poll',
      headerLeft: () => (
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.headerButtonText}>Cancel</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={handleUpdatePoll}
          disabled={isSubmitting || !title.trim() || selectedDates.length === 0}
        >
          <Text
            style={[
              styles.headerButtonText,
              (isSubmitting || !title.trim() || selectedDates.length === 0) &&
                styles.disabledHeaderButton,
            ]}
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [
    navigation,
    title,
    selectedDates.length,
    isSubmitting,
    description,
    location,
  ]);

  if (loading) {
    return <LoadingOverlay />;
  }

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

      <Text style={styles.sectionTitle}>Edit date options</Text>
      {hasResponses && (
        <Text style={styles.warningText}>
          Some users have already responded to this poll. You can add new dates
          but cannot remove dates that have responses.
        </Text>
      )}
      <Text style={styles.sectionDescription}>
        Tap on dates to select options for your poll
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

export default EditEventPollScreen;

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
  warningText: {
    fontSize: 14,
    color: '#FF6B6B',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
