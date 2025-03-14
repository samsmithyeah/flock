import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventPoll } from '@/types/EventPoll';
import Badge from '@/components/Badge';

type EventInfoCardProps = {
  poll: EventPoll | null;
  showExtendedInfo?: boolean;
  children?: React.ReactNode;
  onEdit?: () => void;
  canEdit?: boolean;
};

const EventInfoCard: React.FC<EventInfoCardProps> = ({
  poll,
  showExtendedInfo = true,
  children,
  onEdit,
  canEdit = false,
}) => {
  if (!poll) return null;

  return (
    <View style={styles.container}>
      <View style={styles.pollHeader}>
        <Text style={styles.pollTitle}>{poll.title}</Text>

        {poll.finalized ? (
          <Badge text="Finalised" variant="success" />
        ) : (
          <Badge text="Poll in progress" variant="warning" />
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

      {/* Edit button - moved to bottom of card info but before children */}
      {canEdit && !poll.finalized && onEdit && (
        <TouchableOpacity
          onPress={onEdit}
          style={styles.editButton}
          activeOpacity={0.6}
        >
          <Ionicons name="pencil" size={16} color="#1e90ff" />
          <Text style={styles.editButtonText}>Edit poll details</Text>
        </TouchableOpacity>
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
  pollHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pollTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    flex: 1,
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
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#f0f8ff',
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e1f0ff',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e90ff',
    marginLeft: 6,
  },
});

export default EventInfoCard;
