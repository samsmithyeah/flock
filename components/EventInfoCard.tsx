import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventPoll } from '@/types/EventPoll';

type EventInfoCardProps = {
  poll: EventPoll | null;
  showExtendedInfo?: boolean;
  children?: React.ReactNode;
};

const EventInfoCard: React.FC<EventInfoCardProps> = ({
  poll,
  showExtendedInfo = true,
  children,
}) => {
  if (!poll) return null;

  return (
    <View style={styles.container}>
      <View style={styles.infoIconContainer}>
        <Ionicons name="information-circle" size={24} color="#E0E0E0" />
      </View>

      <View style={styles.pollHeader}>
        <Text style={styles.pollTitle}>{poll.title}</Text>

        {poll.finalized ? (
          <View style={styles.finalizedBadge}>
            <Text style={styles.finalizedText}>Finalised</Text>
          </View>
        ) : (
          <Text style={styles.pollStatus}>Poll in progress</Text>
        )}
      </View>

      {poll.description && (
        <Text style={styles.pollDescription}>{poll.description}</Text>
      )}

      {poll.location && (
        <View style={styles.locationContainer}>
          <Ionicons name="location-outline" size={18} color="#666" />
          <Text style={styles.locationText}>{poll.location}</Text>
        </View>
      )}

      {showExtendedInfo && poll.options && (
        <View style={styles.pollInfo}>
          <View style={styles.infoItem}>
            <Ionicons name="calendar-outline" size={18} color="#666" />
            <Text style={styles.infoText}>
              {poll.options.length}{' '}
              {poll.options.length === 1 ? 'date' : 'dates'} proposed
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="person-outline" size={18} color="#666" />
            <Text style={styles.infoText}>
              {Object.keys(poll.options[0]?.responses || {}).length} responses
            </Text>
          </View>
        </View>
      )}

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    padding: 16,
    marginBottom: 20,
    position: 'relative',
  },
  infoIconContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
  pollHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginRight: 24, // Leave space for the info icon
  },
  pollTitle: {
    fontSize: 20,
    fontWeight: '600',
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
    marginBottom: 8,
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
});

export default EventInfoCard;
