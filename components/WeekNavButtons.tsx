import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import moment, { Moment } from 'moment';

interface WeekNavButtonsProps {
  onPrevWeek: () => void;
  onNextWeek: () => void;
  canGoPrevWeek: boolean | undefined;
  showNextWeekButton: boolean;
  startDate: Moment;
  onTitlePress: () => void;
}

const WeekNavButtons: React.FC<WeekNavButtonsProps> = ({
  onPrevWeek,
  onNextWeek,
  canGoPrevWeek,
  showNextWeekButton,
  startDate,
  onTitlePress,
}) => {
  return (
    <View style={styles.navButtonsContainer}>
      <TouchableOpacity
        onPress={onPrevWeek}
        disabled={!canGoPrevWeek}
        style={!canGoPrevWeek ? { opacity: 0 } : {}}
      >
        <Ionicons name="arrow-back" size={24} color="#1e90ff" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.weekTitleContainer}
        onPress={onTitlePress}
      >
        <Text style={styles.weekTitle}>
          {moment(startDate).format('MMM Do')} →{' '}
          {moment(startDate).add(6, 'days').format('MMM Do')}
        </Text>
        <Ionicons
          name="calendar-outline"
          size={24}
          color="#1e90ff"
          style={styles.calendarIcon}
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onNextWeek}
        disabled={!showNextWeekButton}
        style={!showNextWeekButton ? { opacity: 0 } : {}}
      >
        <Ionicons name="arrow-forward" size={24} color="#1e90ff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  navButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  calendarIcon: {
    marginLeft: 8,
  },
});

export default WeekNavButtons;
