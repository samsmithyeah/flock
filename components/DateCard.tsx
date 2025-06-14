import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getFormattedDate } from '@/utils/dateHelpers';
import AvailabilityModal from '@/components/AvailabilityModal';
import Badge from '@/components/Badge';

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
      return total === 1
        ? "You're up for seeing your 1 crew"
        : `You're up for seeing all ${total} of your crews`;
    }
    if (uniformUnavailable) {
      return total === 1
        ? "You're not up for seeing your 1 crew"
        : `You're not up for seeing any of your ${total} crews`;
    }
    if (uniformNeutral) {
      return total === 1
        ? "You haven't set your availability for your 1 crew"
        : `You haven't set your availability for any of your ${total} crews`;
    }
    if (!uniformAvailable && availableCount > 0 && !unavailableCount) {
      return `You're up for seeing ${availableCount} crew${availableCount !== 1 ? 's' : ''} but haven't set your availability for the others`;
    }
    if (!uniformUnavailable && unavailableCount > 0 && !availableCount) {
      return `You're not up for seeing ${unavailableCount} crew${unavailableCount !== 1 ? 's' : ''} and haven't set your availability for the others`;
    }
    if (
      !uniformAvailable &&
      !uniformUnavailable &&
      availableCount > 0 &&
      unavailableCount > 0 &&
      availableCount + unavailableCount < total
    ) {
      return `You're up for seeing ${availableCount} crew${availableCount !== 1 ? 's' : ''}, don't want to see ${unavailableCount} crew${unavailableCount !== 1 ? 's' : ''} and haven't set your availability for the others`;
    }
    if (
      !uniformAvailable &&
      !uniformUnavailable &&
      availableCount > 0 &&
      unavailableCount > 0 &&
      availableCount + unavailableCount === total
    ) {
      return `You're up for seeing ${availableCount} crew${availableCount !== 1 ? 's' : ''} but don't want to see the others`;
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
        {!isDisabled && (
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            style={styles.iconButton}
            accessibilityLabel={`Options for ${getFormattedDate(date)}`}
            accessibilityHint="Tap to open options for marking availability"
          >
            <Ionicons name="ellipsis-horizontal" size={24} color="#555" />
          </TouchableOpacity>
        )}
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
      </View>
      <View style={styles.actionsRow}>
        {matches > 0 && (
          <TouchableOpacity
            onPress={() => onPressMatches(date)}
            accessibilityLabel={`${matches} matches`}
            accessibilityHint={`Tap to view your matching crews on ${getFormattedDate(date)}`}
          >
            <Badge
              text={`🎉 ${matches} ${matches === 1 ? 'match' : 'matches'}`}
              variant="primary"
              style={styles.badgeContainer}
            />
          </TouchableOpacity>
        )}
        {events > 0 && (
          <TouchableOpacity
            onPress={() => onPressEvents(date)}
            accessibilityLabel={`${events} events`}
            accessibilityHint={`Tap to view events on ${getFormattedDate(date)}`}
          >
            <Badge
              text={`📅 ${events} ${events === 1 ? 'event' : 'events'}`}
              variant="info"
              style={styles.badgeContainer}
            />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    gap: 8, // Add gap between badges
  },
  badgeContainer: {
    marginVertical: 4,
  },
  iconButton: {
    marginLeft: 6,
  },
});

export default DateCard;
