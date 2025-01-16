// components/DateCard.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import moment from 'moment';
import AvailabilityModal from '@/components/AvailabilityModal';

interface DateCardProps {
  date: string;
  count: number;
  matches: number;
  total: number;
  isDisabled: boolean;
  statusColor: string;
  isLoading: boolean;
  onToggle: (date: string, toggleTo: boolean) => void;
  onPressMatches: (date: string) => void; // New Prop
}

const DateCard: React.FC<DateCardProps> = ({
  date,
  count,
  matches,
  total,
  isDisabled,
  statusColor,
  isLoading,
  onToggle,
  onPressMatches, // Destructure the new prop
}) => {
  const [isModalVisible, setModalVisible] = useState(false);

  const statusText = `You're up for seeing ${count} of ${total} crew${total !== 1 ? 's' : ''}`;
  const isFullyUp = count === total;
  const isNotUp = count === 0;

  const handleToggle = (toggleTo: boolean) => {
    onToggle(date, toggleTo);
    // No need to handle Alert here as it's now managed in AvailabilityModal
  };

  const getFormattedDate = (date: string) => {
    if (date === moment().format('YYYY-MM-DD')) {
      return 'Today';
    } else if (date === moment().add(1, 'days').format('YYYY-MM-DD')) {
      return 'Tomorrow';
    } else {
      return moment(date).format('dddd, MMMM Do');
    }
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
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text
            style={[styles.statusText, isDisabled && styles.disabledDayText]}
          >
            {statusText}
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
      {/* Display Matches */}
      {matches > 0 && (
        <TouchableOpacity
          style={styles.matchesContainer}
          onPress={() => onPressMatches(date)} // Handle press
          accessibilityLabel={`${matches} matches`}
          accessibilityHint={`Tap to view your matching crews on ${getFormattedDate(date)}`}
        >
          <Text style={styles.matchesText}>
            {matches === 1 ? '🎉 1 match' : `🎉 ${matches} matches`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Availability Modal */}
      <AvailabilityModal
        visible={isModalVisible}
        onClose={() => setModalVisible(false)}
        date={date}
        isFullyUp={isFullyUp}
        isNotUp={isNotUp}
        isLoading={isLoading}
        onToggle={handleToggle}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  dayContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
    borderColor: '#E0E0E0',
    borderWidth: 1,
  },
  disabledDayContainer: {
    backgroundColor: '#E0E0E0',
  },
  dayHeader: {},
  dayText: {
    fontSize: 16,
    color: '#333333',
    fontWeight: '600',
  },
  disabledDayText: {
    color: '#A9A9A9',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    color: '#333333',
  },
  matchesContainer: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#1E90FF',
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  matchesText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  iconButton: {
    padding: 8,
  },
});

export default DateCard;
