import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import { EventPoll } from '@/types/EventPoll';
import { getFormattedDate } from '@/utils/dateHelpers';
import moment from 'moment';
import { useCrews } from '@/context/CrewsContext';
import Toast from 'react-native-toast-message';
import useGlobalStyles from '@/styles/globalStyles';
import LoadingOverlay from '@/components/LoadingOverlay';

const EventPollsScreen: React.FC = () => {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const { user } = useUser();
  const { fetchCrew } = useCrews();
  const globalStyles = useGlobalStyles();

  const [polls, setPolls] = useState<EventPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [crewName, setCrewName] = useState('');

  useEffect(() => {
    const fetchCrewName = async () => {
      try {
        const crew = await fetchCrew(crewId as string);
        if (crew) {
          setCrewName(crew.name);
        }
      } catch (error) {
        console.error('Error fetching crew name:', error);
      }
    };

    if (crewId) {
      fetchCrewName();
    }
  }, [crewId, fetchCrew]);

  // Fetch polls for this crew
  useEffect(() => {
    if (!crewId || !user) return;

    setLoading(true);

    const pollsRef = collection(db, 'event-polls');
    const q = query(pollsRef, where('crewId', '==', crewId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const pollsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as EventPoll[];

        // Sort polls: active first (non-finalized), then by creation date (newest first)
        pollsData.sort((a, b) => {
          // First sort by finalized status
          if (a.finalized !== b.finalized) {
            return a.finalized ? 1 : -1;
          }

          // Then sort by creation date (newest first)
          const dateA = a.createdAt?.toDate() || new Date(0);
          const dateB = b.createdAt?.toDate() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });

        setPolls(pollsData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching polls:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not fetch polls',
        });
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [crewId, user]);

  const renderPollItem = ({ item }: { item: EventPoll }) => {
    // Find how many dates have been proposed
    const dateCount = item.options.length;

    // Calculate response statistics
    let totalResponses = 0;
    let memberCount = 0;

    if (dateCount > 0) {
      // Use the first option to get a count of unique members who responded
      const firstOptionResponses = item.options[0].responses || {};
      memberCount = Object.keys(firstOptionResponses).length;

      // Sum up all responses across all options
      item.options.forEach((option) => {
        const responses = option.responses || {};
        totalResponses += Object.keys(responses).length;
      });
    }

    // Format the creation date
    const creationDate = item.createdAt?.toDate();
    const formattedDate = creationDate
      ? moment(creationDate).format('MMM D, YYYY')
      : '';

    return (
      <TouchableOpacity
        style={[styles.pollItem, item.finalized && styles.finalizedPoll]}
        onPress={() =>
          router.push({
            pathname: item.finalized
              ? '/crews/event-poll/[pollId]'
              : user && item.options.some((opt) => opt.responses?.[user.uid])
                ? '/crews/event-poll/[pollId]'
                : '/crews/event-poll/respond',
            params: { pollId: item.id, crewId },
          })
        }
      >
        <View style={styles.pollMain}>
          <View style={styles.pollHeader}>
            <Text style={styles.pollTitle}>{item.title}</Text>
            {item.finalized && (
              <View style={styles.finalizedBadge}>
                <Text style={styles.finalizedText}>Finalised</Text>
              </View>
            )}
          </View>

          <Text style={styles.pollDetails}>
            {dateCount} {dateCount === 1 ? 'date' : 'dates'} proposed •{' '}
            {memberCount} {memberCount === 1 ? 'response' : 'responses'}
          </Text>

          {item.finalized && item.selectedDate && (
            <View style={styles.selectedDateContainer}>
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
              <Text style={styles.selectedDateText}>
                {getFormattedDate(item.selectedDate)}
              </Text>
            </View>
          )}

          <Text style={styles.pollDate}>Created {formattedDate}</Text>
        </View>

        <Ionicons name="chevron-forward" size={20} color="#888" />
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="calendar-outline" size={64} color="#CCCCCC" />
      <Text style={styles.emptyText}>No polls created yet</Text>
      <Text style={styles.emptySubText}>
        Create a new poll to help find the best date for your next event
      </Text>
      <TouchableOpacity
        style={styles.createButton}
        onPress={() =>
          router.push({
            pathname: '/crews/event-poll/create',
            params: { crewId },
          })
        }
      >
        <Text style={styles.createButtonText}>Create a Poll</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return <LoadingOverlay />;
  }

  return (
    <View style={globalStyles.containerWithHeader}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Event Polls for {crewName}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() =>
            router.push({
              pathname: '/crews/event-poll/create',
              params: { crewId },
            })
          }
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={polls}
        renderItem={renderPollItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          polls.length === 0 ? styles.emptyList : styles.list
        }
        ListEmptyComponent={renderEmptyState()}
      />
    </View>
  );
};

export default EventPollsScreen;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#1e90ff',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  list: {
    paddingVertical: 8,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  pollItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  finalizedPoll: {
    backgroundColor: '#F9F9F9',
    borderColor: '#E0E0E0',
    borderWidth: 1,
  },
  pollMain: {
    flex: 1,
  },
  pollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pollTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  finalizedBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  finalizedText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
  },
  pollDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  selectedDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  selectedDateText: {
    fontSize: 14,
    color: '#4CAF50',
    marginLeft: 4,
    fontWeight: '500',
  },
  pollDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 20,
  },
  createButton: {
    backgroundColor: '#1e90ff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
