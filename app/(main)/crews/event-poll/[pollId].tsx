import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { useCrews } from '@/context/CrewsContext';
import { Ionicons } from '@expo/vector-icons';
import { EventPoll, PollOptionResponse } from '@/types/EventPoll';
import {
  findBestDate,
  createEventFromPoll,
  finalizePoll,
} from '@/utils/eventPollHelpers';
import { getFormattedDate } from '@/utils/dateHelpers';
import Toast from 'react-native-toast-message';
import useGlobalStyles from '@/styles/globalStyles';
import LoadingOverlay from '@/components/LoadingOverlay';
import CustomButton from '@/components/CustomButton';

const PollDetailsScreen: React.FC = () => {
  const { pollId, crewId } = useLocalSearchParams<{
    pollId: string;
    crewId: string;
  }>();
  const { user } = useUser();
  const { usersCache, fetchCrew } = useCrews();
  const globalStyles = useGlobalStyles();

  const [poll, setPoll] = useState<EventPoll | null>(null);
  const [crewName, setCrewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);

  // Fetch crew name for display
  useEffect(() => {
    const fetchCrewName = async () => {
      try {
        if (crewId) {
          const crew = await fetchCrew(crewId);
          if (crew) {
            setCrewName(crew.name);
          }
        }
      } catch (error) {
        console.error('Error fetching crew name:', error);
      }
    };

    if (crewId) {
      fetchCrewName();
    }
  }, [crewId, fetchCrew]);

  // Subscribe to poll updates
  useEffect(() => {
    if (!pollId) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Poll ID not found',
      });
      router.back();
      return;
    }

    const pollRef = doc(db, 'event-polls', pollId);
    const unsubscribe = onSnapshot(
      pollRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const pollData = {
            id: docSnap.id,
            ...(docSnap.data() as Omit<EventPoll, 'id'>),
          } as EventPoll;
          setPoll(pollData);

          // Check if the current user has responded to any date option
          if (user) {
            const userHasVoted = pollData.options.some(
              (option) => option.responses && option.responses[user.uid],
            );
            setHasResponded(userHasVoted);
          }

          setLoading(false);
        } else {
          Toast.show({
            type: 'error',
            text1: 'Error',
            text2: 'Poll not found',
          });
          router.back();
        }
      },
      (error) => {
        console.error('Error fetching poll:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not fetch poll details',
        });
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [pollId, router, user]);

  const goToRespondScreen = () => {
    router.push({
      pathname: '/crews/event-poll/respond',
      params: { pollId, crewId },
    });
  };

  const getResponseCountsByType = (optionIndex: number) => {
    if (!poll)
      return { yesCount: 0, maybeCount: 0, noCount: 0, totalResponses: 0 };

    const responses = poll.options[optionIndex].responses || {};
    let yesCount = 0;
    let maybeCount = 0;
    let noCount = 0;

    Object.values(responses).forEach((response) => {
      if (response === 'yes') yesCount++;
      else if (response === 'maybe') maybeCount++;
      else if (response === 'no') noCount++;
    });

    return {
      yesCount,
      maybeCount,
      noCount,
      totalResponses: yesCount + maybeCount + noCount,
    };
  };

  const handleCreateEvent = async () => {
    if (!poll || !user || !crewId) return;

    if (!poll.finalized) {
      Alert.alert(
        'Finalize Poll',
        'Do you want to finalize this poll and create an event with the selected date?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes',
            onPress: async () => {
              try {
                setSubmitting(true);
                // Find best date based on responses
                const bestDate = findBestDate(poll);

                if (!bestDate) {
                  Toast.show({
                    type: 'error',
                    text1: 'Error',
                    text2: 'Could not determine the best date',
                  });
                  return;
                }

                // Finalize the poll
                await finalizePoll(pollId, bestDate);

                // Create an event based on poll results
                await createEventFromPoll(crewId, pollId, user.uid);

                Toast.show({
                  type: 'success',
                  text1: 'Success',
                  text2: 'Event created successfully',
                });

                // Navigate to crew calendar
                router.push({
                  pathname: '/crews/[crewId]/calendar',
                  params: { crewId, date: bestDate },
                });
              } catch (error) {
                console.error('Error finalizing poll:', error);
                Toast.show({
                  type: 'error',
                  text1: 'Error',
                  text2: 'Failed to create event',
                });
              } finally {
                setSubmitting(false);
              }
            },
          },
        ],
      );
    } else if (poll.selectedDate) {
      // If already finalized, just navigate to the calendar
      router.push({
        pathname: '/crews/[crewId]/calendar',
        params: { crewId, date: poll.selectedDate },
      });
    }
  };

  const getResponseIcon = (response: PollOptionResponse) => {
    switch (response) {
      case 'yes':
        return <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />;
      case 'maybe':
        return <Ionicons name="help-circle" size={18} color="#FFA000" />;
      case 'no':
        return <Ionicons name="close-circle" size={18} color="#F44336" />;
      default:
        return <Ionicons name="ellipse-outline" size={18} color="#CCCCCC" />;
    }
  };

  const getUserResponse = (optionIndex: number, userId: string) => {
    if (!poll) return null;
    return poll.options[optionIndex].responses?.[userId] || null;
  };

  const renderOptionsWithResponses = () => {
    if (!poll) return null;

    return (
      <View style={styles.optionsContainer}>
        <Text style={styles.sectionTitle}>Date Options</Text>

        {poll.options.map((option, index) => {
          const { yesCount, maybeCount, noCount, totalResponses } =
            getResponseCountsByType(index);
          const isSelectedDate =
            poll.finalized && poll.selectedDate === option.date;

          return (
            <View
              key={option.date}
              style={[
                styles.optionCard,
                isSelectedDate && styles.selectedDateCard,
              ]}
            >
              <View style={styles.dateHeader}>
                <Text style={styles.dateText}>
                  {getFormattedDate(option.date)}
                </Text>
                {isSelectedDate && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>Selected</Text>
                  </View>
                )}
              </View>

              <View style={styles.responseStats}>
                <View style={styles.statItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                  <Text style={styles.statText}>{yesCount}</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="help-circle" size={16} color="#FFA000" />
                  <Text style={styles.statText}>{maybeCount}</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="close-circle" size={16} color="#F44336" />
                  <Text style={styles.statText}>{noCount}</Text>
                </View>
              </View>

              {totalResponses > 0 && (
                <View style={styles.respondentsList}>
                  {Object.entries(option.responses || {}).map(
                    ([userId, response]) => {
                      const respondent = usersCache[userId];
                      if (!respondent) return null;

                      return (
                        <View key={userId} style={styles.respondentItem}>
                          {getResponseIcon(response)}
                          <Text style={styles.respondentName}>
                            {respondent.displayName || 'Unknown User'}
                          </Text>
                        </View>
                      );
                    },
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  if (loading) {
    return <LoadingOverlay />;
  }

  return (
    <ScrollView
      style={globalStyles.containerWithHeader}
      contentContainerStyle={styles.scrollContent}
    >
      <Text style={styles.headerText}>Poll for {crewName}</Text>

      <View style={styles.pollHeader}>
        <Text style={styles.pollTitle}>{poll?.title}</Text>

        {poll?.finalized ? (
          <View style={styles.finalizedBadge}>
            <Text style={styles.finalizedText}>Finalised</Text>
          </View>
        ) : (
          <Text style={styles.pollStatus}>Poll in progress</Text>
        )}
      </View>

      {poll?.description && (
        <Text style={styles.pollDescription}>{poll.description}</Text>
      )}

      {poll?.location && (
        <View style={styles.locationContainer}>
          <Ionicons name="location-outline" size={18} color="#666" />
          <Text style={styles.locationText}>{poll.location}</Text>
        </View>
      )}

      <View style={styles.pollInfo}>
        <View style={styles.infoItem}>
          <Ionicons name="calendar-outline" size={18} color="#666" />
          <Text style={styles.infoText}>
            {poll?.options.length}{' '}
            {poll?.options.length === 1 ? 'date' : 'dates'} proposed
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="person-outline" size={18} color="#666" />
          <Text style={styles.infoText}>
            {poll && Object.keys(poll.options[0]?.responses || {}).length}{' '}
            responses
          </Text>
        </View>
      </View>

      {(!user || !hasResponded) && !poll?.finalized && (
        <View style={styles.responsePrompt}>
          <Text style={styles.promptText}>
            You haven't responded to this poll yet
          </Text>
          <CustomButton
            title="Respond to Poll"
            onPress={goToRespondScreen}
            variant="primary"
            icon={{ name: 'create-outline' }}
            style={styles.respondButton}
          />
        </View>
      )}

      {hasResponded && (
        <View>
          <CustomButton
            title={poll?.finalized ? 'Change Response' : 'Edit Response'}
            onPress={goToRespondScreen}
            variant="secondary"
            icon={{ name: 'create-outline' }}
            style={styles.button}
          />

          {user?.uid === poll?.createdBy && !poll?.finalized && (
            <CustomButton
              title="Finalise poll and create event"
              onPress={handleCreateEvent}
              variant="primary"
              loading={submitting}
              icon={{ name: 'calendar-outline' }}
              style={styles.button}
            />
          )}

          {poll?.finalized && poll?.selectedDate && (
            <CustomButton
              title="View in Calendar"
              onPress={handleCreateEvent}
              variant="primary"
              icon={{ name: 'calendar-outline' }}
              style={styles.button}
            />
          )}
        </View>
      )}

      {/* Only show responses if user has responded or poll is finalized */}
      {(hasResponded || poll?.finalized) && renderOptionsWithResponses()}
    </ScrollView>
  );
};

export default PollDetailsScreen;

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
  pollHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pollTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    flex: 1,
  },
  finalizedBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  finalizedText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  pollStatus: {
    fontSize: 14,
    color: '#FFA000',
    fontWeight: '500',
  },
  pollDescription: {
    fontSize: 16,
    color: '#555',
    marginBottom: 12,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
  },
  pollInfo: {
    flexDirection: 'row',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
  },
  responsePrompt: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 8,
    marginVertical: 12,
    alignItems: 'center',
  },
  promptText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1E88E5',
    marginBottom: 12,
    textAlign: 'center',
  },
  respondButton: {
    marginTop: 8,
  },
  button: {
    flex: 1,
    marginHorizontal: 8,
    marginBottom: 12,
  },
  optionsContainer: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  optionCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedDateCard: {
    borderColor: '#4CAF50',
    borderWidth: 1,
    backgroundColor: '#F1F8E9',
  },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  selectedBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selectedBadgeText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
  },
  responseStats: {
    flexDirection: 'row',
    marginVertical: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  statText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
    fontWeight: '500',
  },
  respondentsList: {
    marginTop: 8,
  },
  respondentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  respondentName: {
    fontSize: 14,
    color: '#555',
    marginLeft: 8,
  },
});
