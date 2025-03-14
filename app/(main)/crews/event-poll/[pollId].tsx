import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { useCrews } from '@/context/CrewsContext';
import { Ionicons } from '@expo/vector-icons';
import { EventPoll, PollOptionResponse } from '@/types/EventPoll';
import {
  findBestDate,
  createEventFromPoll,
  finalizePoll,
  removeResponseFromPoll,
} from '@/utils/eventPollHelpers';
import { getFormattedDate } from '@/utils/dateHelpers';
import Toast from 'react-native-toast-message';
import useGlobalStyles from '@/styles/globalStyles';
import LoadingOverlay from '@/components/LoadingOverlay';
import CustomButton from '@/components/CustomButton';
import EventInfoCard from '@/components/EventInfoCard';
import Badge from '@/components/Badge';

const PollDetailsScreen: React.FC = () => {
  const { pollId, crewId } = useLocalSearchParams<{
    pollId: string;
    crewId: string;
  }>();
  const { user } = useUser();
  const { usersCache, fetchCrew } = useCrews();
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation();

  const [poll, setPoll] = useState<EventPoll | null>(null);
  const [crewName, setCrewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);
  const [selectedDateForEvent, setSelectedDateForEvent] = useState<
    string | null
  >(null);
  const [removingResponse, setRemovingResponse] = useState(false);

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

  // Set the screen title
  useLayoutEffect(() => {
    if (crewName) {
      navigation.setOptions({
        title: `Poll for ${crewName}`,
      });
    }
  }, [crewName, navigation]);

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

    const pollRef = doc(db, 'event_polls', pollId);
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

  // Set the best date as the default selected date when poll data loads
  useEffect(() => {
    if (poll && !selectedDateForEvent && !poll.finalized) {
      const bestDate = findBestDate(poll);
      if (bestDate) {
        setSelectedDateForEvent(bestDate);
      }
    }
  }, [poll]);

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

  const handleNavigateToEvent = () => {
    if (!poll || !crewId || !poll.selectedDate) return;

    router.push({
      pathname: '/crews/[crewId]/calendar',
      params: { crewId, date: poll.selectedDate },
    });
  };

  const handleCreateEvent = async () => {
    if (!poll || !user || !crewId || !selectedDateForEvent) return;

    if (!poll.finalized) {
      Alert.alert(
        'Finalise poll',
        `Do you want to finalise this poll and create an event for ${getFormattedDate(selectedDateForEvent)}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes',
            onPress: async () => {
              try {
                setSubmitting(true);

                // Finalize the poll with the selected date
                await finalizePoll(pollId, selectedDateForEvent);

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
                  params: { crewId, date: selectedDateForEvent },
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
      console.log('Navigating to crew calendar');
      await handleNavigateToEvent();
    }
  };

  const handleDeletePoll = () => {
    Alert.alert(
      'Delete Poll',
      'Are you sure you want to delete this poll? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await deleteDoc(doc(db, 'event_polls', pollId));
              Toast.show({
                type: 'success',
                text1: 'Success',
                text2: 'Poll deleted successfully',
              });
              router.back();
            } catch (error) {
              console.error('Error deleting poll:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to delete poll',
              });
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleRemoveResponse = async () => {
    if (!user || !pollId) return;

    Alert.alert(
      'Remove Response',
      'Are you sure you want to remove your response from this poll?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setRemovingResponse(true);
              await removeResponseFromPoll(pollId, user.uid);
              setHasResponded(false);
              Toast.show({
                type: 'success',
                text1: 'Success',
                text2: 'Your response has been removed',
              });
            } catch (error) {
              console.error('Error removing response:', error);
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to remove your response',
              });
            } finally {
              setRemovingResponse(false);
            }
          },
        },
      ],
    );
  };

  const handleEditPoll = () => {
    router.push({
      pathname: '/crews/event-poll/edit',
      params: { pollId, crewId },
    });
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

  // Find option with highest vote count
  const findBestOption = () => {
    if (!poll || !poll.options.length) return null;

    // Calculate scores for each option
    const optionScores = poll.options.map((option, index) => {
      const { yesCount, maybeCount } = getResponseCountsByType(index);
      // Score formula: yes = 1 point, maybe = 0.5 points
      const score = yesCount + maybeCount * 0.5;
      return { date: option.date, score, index };
    });

    // Sort by score (highest first)
    optionScores.sort((a, b) => b.score - a.score);

    // Return the option with highest score if it's greater than 0
    return optionScores[0].score > 0 ? optionScores[0] : null;
  };

  const handleDateSelection = (date: string) => {
    if (!poll?.finalized && user?.uid === poll?.createdBy) {
      setSelectedDateForEvent(date);
    }
  };

  const renderOptionsWithResponses = () => {
    if (!poll) return null;

    const bestOption = findBestOption();

    return (
      <View style={styles.optionsContainer}>
        <Text style={styles.sectionTitle}>Date options:</Text>

        {!poll.finalized && user?.uid === poll?.createdBy && (
          <Text style={styles.selectionInstructions}>
            Tap on a date to select it for the event. The recommended date is
            highlighted.
          </Text>
        )}

        {poll.options.map((option, index) => {
          const { yesCount, maybeCount, noCount, totalResponses } =
            getResponseCountsByType(index);
          const isSelectedDate =
            poll.finalized && poll.selectedDate === option.date;
          const isBestOption =
            bestOption && bestOption.date === option.date && !poll.finalized;
          const isUserSelected =
            selectedDateForEvent === option.date && !poll.finalized;

          return (
            <TouchableOpacity
              key={option.date}
              onPress={() => handleDateSelection(option.date)}
              disabled={poll.finalized || user?.uid !== poll?.createdBy}
              activeOpacity={poll.finalized ? 1 : 0.7}
            >
              <View
                style={[
                  styles.optionCard,
                  isSelectedDate && styles.selectedDateCard,
                  isBestOption && styles.bestOptionCard,
                  isUserSelected && styles.userSelectedCard,
                ]}
              >
                <View style={styles.dateHeader}>
                  <View style={styles.dateHeaderLeft}>
                    <Text style={styles.dateText}>
                      {getFormattedDate(option.date)}
                    </Text>
                    {isBestOption && (
                      <Badge
                        text="Most votes"
                        variant="highlight"
                        icon={{ name: 'star' }}
                        style={styles.badge}
                      />
                    )}
                    {isUserSelected && poll.createdBy === user?.uid && (
                      <Badge
                        text="Selected for event"
                        variant="success"
                        icon={{ name: 'checkmark-circle' }}
                        style={styles.badge}
                      />
                    )}
                  </View>

                  {isSelectedDate && (
                    <Badge text="Selected" variant="success" />
                  )}
                </View>

                <View style={styles.responseStats}>
                  <View style={styles.statItem}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#4CAF50"
                    />
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

                  {/* Show weighted score for non-finalized polls */}
                  {!poll.finalized && (
                    <View style={styles.scoreItem}>
                      <Text style={styles.scoreText}>
                        Score: {(yesCount + maybeCount * 0.5).toFixed(1)}
                      </Text>
                    </View>
                  )}
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
            </TouchableOpacity>
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
      <EventInfoCard
        poll={poll}
        showExtendedInfo={true}
        onEdit={handleEditPoll}
        canEdit={user?.uid === poll?.createdBy}
      >
        {(!user || !hasResponded) && !poll?.finalized && (
          <View style={styles.responsePrompt}>
            <Text style={styles.promptText}>
              You haven't responded to this poll yet
            </Text>
            <CustomButton
              title="Respond to poll"
              onPress={goToRespondScreen}
              variant="primary"
              icon={{ name: 'create-outline' }}
              style={styles.respondButton}
            />
          </View>
        )}
      </EventInfoCard>

      {hasResponded && (
        <View>
          {!poll?.finalized && (
            <>
              <CustomButton
                title="Edit response"
                onPress={goToRespondScreen}
                variant="secondary"
                icon={{ name: 'create-outline' }}
                style={styles.button}
              />
              <CustomButton
                title="Remove response"
                onPress={handleRemoveResponse}
                variant="secondaryDanger"
                icon={{ name: 'trash-outline' }}
                style={styles.button}
                loading={removingResponse}
              />
            </>
          )}

          {user?.uid === poll?.createdBy && !poll?.finalized && (
            <CustomButton
              title="Finalise poll and create event"
              onPress={handleCreateEvent}
              variant="primary"
              loading={submitting}
              icon={{ name: 'calendar-outline' }}
              style={styles.button}
              disabled={!selectedDateForEvent}
            />
          )}

          {poll?.finalized && poll?.selectedDate && (
            <CustomButton
              title="View in crew calendar"
              onPress={handleNavigateToEvent}
              variant="primary"
              icon={{ name: 'calendar-outline' }}
              style={styles.button}
            />
          )}

          {/* Delete button for poll creator */}
          {user?.uid === poll?.createdBy && (
            <CustomButton
              title="Delete poll"
              onPress={handleDeletePoll}
              variant="danger"
              icon={{ name: 'trash-outline' }}
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
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  optionCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    padding: 16,
    marginBottom: 12,
  },
  selectedDateCard: {
    borderColor: '#4CAF50',
    borderWidth: 2,
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
  dateHeaderLeft: {
    flex: 1,
  },
  bestOptionCard: {
    borderColor: '#FFD700',
    borderWidth: 2,
    backgroundColor: '#FFFEF0',
  },
  scoreItem: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  scoreText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
  },
  userSelectedCard: {
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  selectionInstructions: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  badge: {
    marginTop: 4,
  },
});
