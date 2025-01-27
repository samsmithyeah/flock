// components/AddEventModal.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import moment from 'moment';
import { Calendar } from 'react-native-calendars';
import CustomModal from '@/components/CustomModal';

type AddEventModalProps = {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (title: string, start: string, end: string) => void;
  defaultStart?: string;
  defaultEnd?: string;
  loading?: boolean;
};

const AddEventModal: React.FC<AddEventModalProps> = ({
  isVisible,
  onClose,
  onSubmit,
  defaultStart,
  defaultEnd,
  loading = false,
}) => {
  const [title, setTitle] = useState('');
  const [selectedDates, setSelectedDates] = useState<{
    start: string;
    end: string;
  }>({
    start: moment().format('YYYY-MM-DD'),
    end: moment().format('YYYY-MM-DD'),
  });

  useEffect(() => {
    if (defaultStart && defaultEnd) {
      setSelectedDates({ start: defaultStart, end: defaultEnd });
    }
  }, [defaultStart, defaultEnd]);

  function handleAddEvent() {
    onSubmit(title, selectedDates.start, selectedDates.end);
    setTitle('');
  }

  const handleDayPress = (day: { dateString: string }) => {
    if (!selectedDates.start || selectedDates.end) {
      setSelectedDates({ start: day.dateString, end: '' });
    } else {
      const isEndValid = moment(day.dateString).isSameOrAfter(
        selectedDates.start,
      );
      setSelectedDates({
        start: selectedDates.start,
        end: isEndValid ? day.dateString : selectedDates.start,
      });
    }
  };

  const getMarkedDates = () => {
    const { start, end } = selectedDates;
    const marked: Record<string, any> = {};

    if (start) {
      if (end && start !== end) {
        // Mark the start date
        marked[start] = {
          startingDay: true,
          color: '#5f9ea0',
          textColor: 'white',
        };

        // Mark the end date
        marked[end] = {
          endingDay: true,
          color: '#5f9ea0',
          textColor: 'white',
        };

        // Mark the dates in between
        let current = moment(start).add(1, 'day');
        while (current.isBefore(end)) {
          const dateString = current.format('YYYY-MM-DD');
          marked[dateString] = { color: '#b2d8d8', textColor: 'black' };
          current = current.add(1, 'day');
        }
      } else {
        // Only one date is selected, mark it as both start and end for a round blob
        marked[start] = {
          startingDay: true,
          endingDay: true,
          color: '#5f9ea0',
          textColor: 'white',
        };
      }
    }

    return marked;
  };

  const handleClose = () => {
    setTitle('');
    setSelectedDates({
      start: moment().format('YYYY-MM-DD'),
      end: moment().format('YYYY-MM-DD'),
    });
    onClose();
  };

  const buttons = [
    { label: 'Cancel', onPress: handleClose, variant: 'secondary' as const },
    {
      label: 'Add Event',
      onPress: handleAddEvent,
      variant: 'primary' as const,
      disabled: !title || !selectedDates.start || !selectedDates.end,
    },
  ];

  return (
    <CustomModal
      isVisible={isVisible}
      onClose={handleClose}
      title="Add an Event"
      buttons={buttons}
      loading={loading}
    >
      <View style={styles.content}>
        <Text style={styles.label}>Event Title</Text>
        <TextInput
          style={styles.input}
          placeholder="Party at Sam's..."
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Select Dates</Text>
        <Calendar
          style={styles.calendar}
          markedDates={getMarkedDates()}
          onDayPress={handleDayPress}
          markingType="period"
          theme={{
            selectedDayBackgroundColor: '#5f9ea0',
            selectedDayTextColor: '#ffffff',
            todayTextColor: '#5f9ea0',
            arrowColor: '#5f9ea0',
            textDayFontSize: 16,
            textMonthFontSize: 16,
            textDayHeaderFontSize: 14,
          }}
        />
      </View>
    </CustomModal>
  );
};

export default AddEventModal;

const styles = StyleSheet.create({
  content: {
    alignSelf: 'stretch',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    padding: 8,
    marginBottom: 16,
  },
  calendar: {
    borderRadius: 10,
    alignSelf: 'center',
    width: '100%',
  },
});
