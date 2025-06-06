import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import { EventPoll, PollOptionResponse } from '@/types/EventPoll';
import { respondToPollOption } from '@/utils/eventPollHelpers';
import { getFormattedDate } from '@/utils/dateHelpers';
import moment from 'moment';
import Toast from 'react-native-toast-message';
import useGlobalStyles from '@/styles/globalStyles';
import LoadingOverlay from '@/components/LoadingOverlay';
import EventInfoCard from '@/components/EventInfoCard';

type ResponseOption = {
  date: string;
  response: PollOptionResponse;
  originalResponse: PollOptionResponse;
};

const ResponseScreen: React.FC = () => {
  const { pollId, crewId } = useLocalSearchParams<{
    pollId: string;
    crewId: string;
  }>();
  const { user } = useUser();
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation();

  const [poll, setPoll] = useState<EventPoll | null>(null);
  const [responses, setResponses] = useState<ResponseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Fetch poll data and initialize response state
  useEffect(() => {
    const fetchPoll = async () => {
      if (!pollId) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Poll ID not found',
        });
        router.back();
        return;
      }

      try {
        const pollRef = doc(db, 'event_polls', pollId);
        const pollSnap = await getDoc(pollRef);

        if (pollSnap.exists()) {
          const pollData = {
            id: pollSnap.id,
            ...(pollSnap.data() as Omit<EventPoll, 'id'>),
          } as EventPoll;

          setPoll(pollData);

          // Initialize responses array
          const initialResponses = pollData.options.map((option) => {
            const currentResponse = user?.uid
              ? option.responses?.[user.uid] || null
              : null;
            return {
              date: option.date,
              response: currentResponse,
              originalResponse: currentResponse,
            };
          });

          setResponses(initialResponses);
        } else {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Poll not found',
          });
          router.back();
        }
      } catch (error) {
        console.error('Error fetching poll:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not fetch poll details',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPoll();
  }, [pollId, router, user]);

  const handleResponseChange = (
    dateIndex: number,
    newResponse: PollOptionResponse,
  ) => {
    setResponses((prev) => {
      const updated = [...prev];
      // If the same response is clicked again, clear it
      if (updated[dateIndex].response === newResponse) {
        updated[dateIndex] = {
          ...updated[dateIndex],
          response: null,
        };
      } else {
        updated[dateIndex] = {
          ...updated[dateIndex],
          response: newResponse,
        };
      }
      return updated;
    });
  };

  const handleSubmit = async () => {
    if (!user || !pollId) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'User not authenticated',
      });
      return;
    }

    // Check if all dates have been responded to
    const allDatesResponded = responses.every((r) => r.response !== null);
    if (!allDatesResponded) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please respond to all dates before submitting',
      });
      return;
    }

    try {
      setSubmitting(true);

      // Format responses for API
      const responseData: { [dateString: string]: PollOptionResponse } = {};
      responses.forEach((item) => {
        // Only include responses that have been set or changed
        if (item.response !== null || item.originalResponse !== null) {
          responseData[item.date] = item.response;
        }
      });

      await respondToPollOption(pollId, user.uid, responseData);

      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Your response has been recorded',
      });

      // Navigate to poll details
      router.replace({
        pathname: '/crews/event-poll/[pollId]',
        params: { pollId, crewId },
      });
    } catch (error) {
      console.error('Error submitting poll responses:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to submit your responses',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    // Check if any changes were made
    const hasChanges = responses.some(
      (response) => response.response !== response.originalResponse,
    );

    if (hasChanges) {
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes to your responses. Are you sure you want to discard them?',
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
          onPress={handleSubmit}
          disabled={submitting || !responses.every((r) => r.response !== null)}
        >
          <Text
            style={[
              styles.headerButtonText,
              (submitting || !responses.every((r) => r.response !== null)) &&
                styles.disabledHeaderButton,
            ]}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, responses, submitting]);

  const renderResponseOptions = () => {
    return responses.map((responseOption, index) => {
      const date = responseOption.date;
      const formattedDate = getFormattedDate(date);

      // Calculate end date for multi-day events
      let dateRangeText = '';
      if (poll && poll.duration && poll.duration > 1) {
        const endDate = moment(date)
          .add(poll.duration - 1, 'days')
          .format('YYYY-MM-DD');
        const formattedEndDate = getFormattedDate(endDate);
        dateRangeText = ` to ${formattedEndDate}`;
      }

      // Check if day is weekend
      const dayOfWeek = moment(date).day();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      return (
        <View key={date} style={styles.dateCard}>
          <View style={styles.dateHeader}>
            <View style={styles.dateHeaderLeft}>
              <Text style={styles.dateText}>
                {formattedDate}
                {dateRangeText}
              </Text>
              {poll?.duration && poll.duration > 1 && (
                <Text style={styles.durationLabel}>
                  {poll.duration}-day event
                </Text>
              )}
            </View>
            {isWeekend && <Text style={styles.weekendLabel}>Weekend</Text>}
          </View>

          <View style={styles.responseButtons}>
            <TouchableOpacity
              style={[
                styles.responseButton,
                responseOption.response === 'yes' && styles.selectedYes,
              ]}
              onPress={() => handleResponseChange(index, 'yes')}
            >
              <Ionicons
                name={
                  responseOption.response === 'yes'
                    ? 'checkmark-circle'
                    : 'checkmark-circle-outline'
                }
                size={24}
                color={responseOption.response === 'yes' ? '#FFF' : '#4CAF50'}
              />
              <Text
                style={[
                  styles.responseText,
                  responseOption.response === 'yes' &&
                    styles.selectedResponseText,
                ]}
              >
                Yes
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.responseButton,
                responseOption.response === 'maybe' && styles.selectedMaybe,
              ]}
              onPress={() => handleResponseChange(index, 'maybe')}
            >
              <Ionicons
                name={
                  responseOption.response === 'maybe'
                    ? 'help-circle'
                    : 'help-circle-outline'
                }
                size={24}
                color={responseOption.response === 'maybe' ? '#FFF' : '#FFA000'}
              />
              <Text
                style={[
                  styles.responseText,
                  responseOption.response === 'maybe' &&
                    styles.selectedResponseText,
                ]}
              >
                Maybe
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.responseButton,
                responseOption.response === 'no' && styles.selectedNo,
              ]}
              onPress={() => handleResponseChange(index, 'no')}
            >
              <Ionicons
                name={
                  responseOption.response === 'no'
                    ? 'close-circle'
                    : 'close-circle-outline'
                }
                size={24}
                color={responseOption.response === 'no' ? '#FFF' : '#F44336'}
              />
              <Text
                style={[
                  styles.responseText,
                  responseOption.response === 'no' &&
                    styles.selectedResponseText,
                ]}
              >
                No
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    });
  };

  if (loading) {
    return <LoadingOverlay />;
  }

  return (
    <ScrollView
      style={globalStyles.containerWithHeader}
      contentContainerStyle={styles.scrollContent}
    >
      <EventInfoCard poll={poll} />

      <Text style={styles.instructionsText}>
        Please indicate your availability for each proposed date:
      </Text>

      {renderResponseOptions()}
    </ScrollView>
  );
};

export default ResponseScreen;

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 30,
  },
  // Remove styles that are now in the EventInfoCard component:
  // pollInfo, pollTitle, pollDescription, locationContainer, locationText

  // ...existing code...
  instructionsText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#555',
    marginBottom: 16,
  },
  dateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    padding: 16,
    marginBottom: 10,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateHeaderLeft: {
    flex: 1,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  durationLabel: {
    fontSize: 13,
    color: '#00796B',
    marginTop: 4,
    fontStyle: 'italic',
  },
  weekendLabel: {
    fontSize: 12,
    color: '#855A00',
    fontWeight: '500',
    backgroundColor: '#FFECB3',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    marginLeft: 8,
  },
  responseButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  responseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
    flex: 1,
    marginHorizontal: 4,
  },
  selectedYes: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  selectedMaybe: {
    backgroundColor: '#FFA000',
    borderColor: '#FFA000',
  },
  selectedNo: {
    backgroundColor: '#F44336',
    borderColor: '#F44336',
  },
  responseText: {
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '500',
    color: '#555',
  },
  selectedResponseText: {
    color: '#FFFFFF',
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e90ff',
  },
  headerCancelButtonText: {
    fontSize: 16,
    color: '#1e90ff',
  },
  disabledHeaderButton: {
    opacity: 0.5,
  },
});
