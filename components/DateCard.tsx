import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getFormattedDate } from '@/utils/dateHelpers';
import AvailabilityModal from '@/components/AvailabilityModal';

interface DateCardProps {
  date: string;
  availableCount: number;
  unavailableCount: number;
  matches: number;
  events: number;
  total: number;
  isDisabled: boolean;
  isLoading: boolean;
  onToggle: (date: string, toggleTo: boolean | null) => void;
  onPressMatches: (date: string) => void;
  onPressEvents: (date: string) => void;
}

const DateCard: React.FC<DateCardProps> = ({
  date,
  availableCount,
  unavailableCount,
  matches,
  events,
  total,
  isDisabled,
  isLoading,
  onToggle,
  onPressMatches,
  onPressEvents,
}) => {
  const [isModalVisible, setModalVisible] = useState(false);

  const uniformAvailable = availableCount === total;
  const uniformUnavailable = unavailableCount === total;
  const uniformNeutral = availableCount === 0 && unavailableCount === 0;

  const getDotColor = (): string => {
    if (uniformAvailable) return '#32CD32'; // green
    if (uniformUnavailable) return '#F44336'; // red
    if (uniformNeutral) return '#D3D3D3'; // light grey
    return '#FFA500'; // orange
  };

  const getStatusText = () => {
    if (uniformAvailable) {
      return `You're up for seeing all ${total} of your crews`;
    }
    if (uniformUnavailable) {
      return `You're not up for seeing any of your ${total} crews`;
    }
    if (uniformNeutral) {
      return `You haven't responded to any of your ${total} crews`;
    }
    if (!uniformAvailable && availableCount > 0 && !unavailableCount) {
      return `You're up for seeing ${availableCount} crew${availableCount !== 1 ? 's' : ''} but haven't responded to the other ${total - availableCount}`;
    }
    if (!uniformUnavailable && unavailableCount > 0 && !availableCount) {
      return `You're not up for seeing ${unavailableCount} crew${unavailableCount !== 1 ? 's' : ''} and haven't responded to the others`;
    }
    if (
      !uniformAvailable &&
      !uniformUnavailable &&
      availableCount > 0 &&
      unavailableCount > 0 &&
      availableCount + unavailableCount < total
    ) {
      return `You're up for seeing ${availableCount} crew${availableCount !== 1 ? 's' : ''}, don't want to see ${unavailableCount} crew${unavailableCount !== 1 ? 's' : ''} and haven't responded to the other ${total - availableCount - unavailableCount}`;
    }
    if (
      !uniformAvailable &&
      !uniformUnavailable &&
      availableCount > 0 &&
      unavailableCount > 0 &&
      availableCount + unavailableCount === total
    ) {
      return `You're up for seeing ${availableCount} crew${availableCount !== 1 ? 's' : ''} but don't want to see the other ${unavailableCount}`;
    }

    return `You're up for seeing ${availableCount} of ${total} crew${total !== 1 ? 's' : ''}`;
  };

  const handleToggle = (toggleTo: boolean | null) => {
    onToggle(date, toggleTo);
  };

  return (
    <View
      style={[styles.dayContainer, isDisabled && styles.disabledDayContainer]}
    >
      <View style={styles.dayHeader}>
        <Text style={[styles.dayText, isDisabled && styles.disabledDayText]}>
          {getFormattedDate(date)}
        </Text>
      </View>
      <View style={styles.statusRow}>
        <View style={styles.statusInfo}>
          <View
            style={[styles.statusDot, { backgroundColor: getDotColor() }]}
          />
          <Text
            style={[styles.statusText, isDisabled && styles.disabledDayText]}
          >
            {getStatusText()}
          </Text>
        </View>
        {!isDisabled && (
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            style={styles.iconButton}
            accessibilityLabel={`Options for ${getFormattedDate(date)}`}
            accessibilityHint="Tap to open options for marking availability"
          >
            <Ionicons name="create-outline" size={24} color="#333333" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.actionsRow}>
        {matches > 0 && (
          <TouchableOpacity
            style={styles.matchesContainer}
            onPress={() => onPressMatches(date)}
            accessibilityLabel={`${matches} matches`}
            accessibilityHint={`Tap to view your matching crews on ${getFormattedDate(date)}`}
          >
            <Text style={styles.matchesText}>
              {matches === 1 ? '🎉 1 match' : `🎉 ${matches} matches`}
            </Text>
          </TouchableOpacity>
        )}
        {events > 0 && (
          <TouchableOpacity
            style={styles.eventsContainer}
            onPress={() => onPressEvents(date)}
            accessibilityLabel={`${events} events`}
            accessibilityHint={`Tap to view events on ${getFormattedDate(date)}`}
          >
            <Text style={styles.matchesText}>
              {events === 1 ? '📅 1 event' : `📅 ${events} events`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <AvailabilityModal
        visible={isModalVisible}
        onClose={() => setModalVisible(false)}
        date={date}
        uniformAvailable={uniformAvailable}
        uniformUnavailable={uniformUnavailable}
        isLoading={isLoading}
        onToggle={handleToggle}
        availableCount={availableCount}
        unavailableCount={unavailableCount}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  dayContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingRight: 16,
    paddingLeft: 26,
    borderRadius: 10,
    marginBottom: 12,
    borderColor: '#E0E0E0',
    borderWidth: 1,
  },
  disabledDayContainer: { backgroundColor: '#E0E0E0' },
  dayHeader: {
    marginBottom: 4,
  },
  dayText: { fontSize: 16, color: '#333333', fontWeight: '600' },
  disabledDayText: { color: '#A9A9A9' },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    paddingRight: 8,
    position: 'relative',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: 'absolute',
    left: -16,
  },
  statusText: { fontSize: 14, color: '#333333' },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchesContainer: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#1E90FF',
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginRight: 4,
  },
  eventsContainer: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#66c9de',
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  matchesText: { color: '#FFFFFF', fontSize: 12, fontWeight: '500' },
  iconButton: {
    marginLeft: 6,
  },
});

export default DateCard;
