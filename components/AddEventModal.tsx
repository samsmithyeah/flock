import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import moment from 'moment';
import { Calendar } from 'react-native-calendars';
import Ionicons from 'react-native-vector-icons/Ionicons';
import CustomModal from '@/components/CustomModal';
import CustomTextInput from './CustomTextInput';
import { getFormattedDate } from '@/utils/dateHelpers';

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
  const initialDate = defaultStart || moment().format('YYYY-MM-DD');
  const initialEndDate = defaultEnd || initialDate;

  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState(false);

  const [selectedDates, setSelectedDates] = useState<{
    start: string;
    end: string;
  }>({
    start: initialDate,
    end: initialEndDate,
  });

  // Temporary selection used only while calendar is open
  const [tempSelectedDates, setTempSelectedDates] = useState<{
    start: string;
    end: string;
  }>({
    start: initialDate,
    end: initialEndDate,
  });

  const [isCalendarVisible, setIsCalendarVisible] = useState(false);

  useEffect(() => {
    if (defaultStart) {
      setSelectedDates({
        start: defaultStart,
        end: defaultEnd || defaultStart,
      });
    }
  }, [defaultStart, defaultEnd]);

  function handleAddEvent() {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setTitleError(false);
    onSubmit(title, selectedDates.start, selectedDates.end);
    setTitle('');
    setSelectedDates({ start: initialDate, end: initialEndDate });
    setIsCalendarVisible(false);
    onClose();
  }

  // When the calendar opens, copy current selection into tempSelectedDates
  const openCalendar = () => {
    setTempSelectedDates(selectedDates);
    setIsCalendarVisible(true);
  };

  // Discard changes and close
  const discardCalendar = () => {
    setTempSelectedDates(selectedDates);
    setIsCalendarVisible(false);
  };

  // Save changes from temp to actual selection and close
  const saveCalendar = () => {
    setSelectedDates(tempSelectedDates);
    setIsCalendarVisible(false);
  };

  // Called when a day on the calendar is pressed; modifies temp selections
  const handleDayPress = (day: { dateString: string }) => {
    const { start, end } = tempSelectedDates;
    if (!start || end) {
      setTempSelectedDates({ start: day.dateString, end: '' });
    } else {
      const isEndValid = moment(day.dateString).isSameOrAfter(start);
      setTempSelectedDates({
        start,
        end: isEndValid ? day.dateString : start,
      });
    }
  };

  // Use tempSelectedDates for highlighting while the calendar is open
  const getMarkedDates = () => {
    const { start, end } = tempSelectedDates;
    const marked: Record<string, any> = {};

    if (start) {
      if (end && start !== end) {
        marked[start] = {
          startingDay: true,
          color: '#5f9ea0',
          textColor: 'white',
        };

        marked[end] = {
          endingDay: true,
          color: '#5f9ea0',
          textColor: 'white',
        };

        let current = moment(start).add(1, 'day');
        while (current.isBefore(end)) {
          const dateString = current.format('YYYY-MM-DD');
          marked[dateString] = { color: '#b2d8d8', textColor: 'black' };
          current = current.add(1, 'day');
        }
      } else {
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
    setTitleError(false);
    setSelectedDates({ start: initialDate, end: initialEndDate });
    setIsCalendarVisible(false);
    onClose();
  };

  const buttons = [
    { label: 'Cancel', onPress: handleClose, variant: 'secondary' as const },
    {
      label: 'Add Event',
      onPress: handleAddEvent,
      variant: 'primary' as const,
      disabled: loading || !title.trim(),
    },
  ];

  return (
    <>
      {/* Calendar Modal */}
      <Modal
        visible={isCalendarVisible}
        animationType="none"
        transparent
        onRequestClose={discardCalendar}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackground}
            activeOpacity={1}
            onPress={discardCalendar}
          />
          <View style={styles.calendarContainer}>
            <TouchableOpacity
              style={styles.discardButton}
              onPress={discardCalendar}
            >
              <Ionicons name="close" size={24} color="red" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveButton} onPress={saveCalendar}>
              <Ionicons name="checkmark" size={24} color="green" />
            </TouchableOpacity>

            <Calendar
              minDate={moment().format('YYYY-MM-DD')}
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
        </View>
      </Modal>

      {/* Add Event Modal */}
      <CustomModal
        isVisible={isVisible && !isCalendarVisible}
        onClose={handleClose}
        title="Add an event"
        buttons={buttons}
        loading={loading}
        animationType="none"
      >
        <View style={styles.content}>
          <CustomTextInput
            placeholder="Event name"
            placeholderTextColor="#666"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
            hasBorder={true}
          />

          <Text style={styles.label}>Event date:</Text>
          <View style={styles.dateContainer}>
            <Text style={styles.dateText}>
              {moment(selectedDates.start).format('MMM DD, YYYY')}
            </Text>
            {selectedDates.start !== selectedDates.end && (
              <Text style={styles.dateText}>
                {' '}
                - {moment(selectedDates.end).format('MMM DD, YYYY')}
              </Text>
            )}

            {/* Pencil icon next to the dates */}
            <TouchableOpacity style={styles.iconWrapper} onPress={openCalendar}>
              <Ionicons name="calendar" size={20} color="#5f9ea0" />
            </TouchableOpacity>
          </View>
        </View>
      </CustomModal>
    </>
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
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
  },
  iconWrapper: {
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  calendarContainer: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    position: 'relative',
  },
  discardButton: {
    position: 'absolute',
    top: -12,
    left: -12,
    zIndex: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowColor: '#000',
    shadowOpacity: 0.2,
  },
  saveButton: {
    position: 'absolute',
    top: -12,
    right: -12,
    zIndex: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowColor: '#000',
    shadowOpacity: 0.2,
  },
});
