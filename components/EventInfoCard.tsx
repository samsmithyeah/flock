import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventPoll } from '@/types/EventPoll';
import Badge from '@/components/Badge';
import { getFormattedDate } from '@/utils/dateHelpers';

type ActionItem = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
};

type EventInfoCardProps = {
  poll: EventPoll | null;
  showExtendedInfo?: boolean;
  children?: React.ReactNode;
  onEdit?: () => void;
  canEdit?: boolean;
  actions?: ActionItem[];
};

const EventInfoCard: React.FC<EventInfoCardProps> = ({
  poll,
  showExtendedInfo = true,
  children,
  onEdit,
  canEdit = false,
  actions = [],
}) => {
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  if (!poll) return null;

  const handleOpenMenu = () => {
    setShowActionsMenu(true);
  };

  const handleCloseMenu = () => {
    setShowActionsMenu(false);
  };

  const renderActionItem = ({ item }: { item: ActionItem }) => (
    <TouchableOpacity
      style={[
        styles.actionItem,
        item.variant === 'danger' && styles.dangerActionItem,
      ]}
      onPress={() => {
        handleCloseMenu();
        item.onPress();
      }}
    >
      <Ionicons
        name={item.icon}
        size={20}
        color={item.variant === 'danger' ? '#F44336' : '#1e90ff'}
      />
      <Text
        style={[
          styles.actionText,
          item.variant === 'danger' && styles.dangerActionText,
        ]}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.pollHeader}>
        <Text style={styles.pollTitle}>{poll.title}</Text>

        <View style={styles.headerActions}>
          {poll.finalized ? (
            <Badge text="Finalised" variant="success" />
          ) : (
            <Badge text="Poll in progress" variant="warning" />
          )}

          {actions.length > 0 && (
            <TouchableOpacity
              style={styles.menuButton}
              onPress={handleOpenMenu}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name="ellipsis-vertical" size={20} color="#555" />
            </TouchableOpacity>
          )}
        </View>

        <Modal
          visible={showActionsMenu}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCloseMenu}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={handleCloseMenu}
          >
            <View style={styles.actionsMenuContainer}>
              <FlatList
                data={actions}
                renderItem={renderActionItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={actions.length > 6}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </View>

      {/* Display finalized date information */}
      {poll.finalized && poll.selectedDate && (
        <View style={styles.finalizedDateContainer}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#4CAF50" />
          <View style={styles.finalizedDateTextContainer}>
            <Text style={styles.finalizedDateLabel}>Chosen date:</Text>
            <Text style={styles.finalizedDateText}>
              {getFormattedDate(
                poll.selectedDate,
                poll.duration && poll.duration > 1 ? 'medium' : 'long',
              )}
              {poll.duration && poll.duration > 1 && poll.selectedEndDate ? (
                <Text>
                  {' - '}
                  {getFormattedDate(poll.selectedEndDate, 'medium')}{' '}
                </Text>
              ) : null}
            </Text>
          </View>
        </View>
      )}

      {poll.description && (
        <Text style={styles.pollDescription}>{poll.description}</Text>
      )}

      {poll.location && (
        <View style={styles.locationContainer}>
          <Ionicons name="location-outline" size={18} color="#666" />
          <Text style={styles.locationText}>{poll.location}</Text>
        </View>
      )}

      {/* Show duration information if greater than 1 day */}
      {poll.duration && poll.duration > 1 && (
        <View style={styles.durationContainer}>
          <Ionicons name="time-outline" size={18} color="#666" />
          <Text style={styles.durationText}>{poll.duration} day event</Text>
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

      {/* We'll hide the edit button as it's now in the dropdown menu */}
      {canEdit && !poll.finalized && onEdit && actions.length === 0 && (
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    marginLeft: 10,
    padding: 3,
  },
  pollDescription: {
    fontSize: 16,
    color: '#555',
    marginBottom: 12,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  durationText: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsMenuContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    width: '80%',
    maxWidth: 300,
    padding: 0,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dangerActionItem: {
    borderBottomColor: '#FFEBEE',
  },
  actionText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  dangerActionText: {
    color: '#F44336',
  },
  finalizedDateContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BCDEBE',
  },
  finalizedDateTextContainer: {
    marginLeft: 10,
    flex: 1,
  },
  finalizedDateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 2,
  },
  finalizedDateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B5E20',
  },
});

export default EventInfoCard;
