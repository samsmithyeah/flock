// AddEventModal.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import moment from 'moment';
import { Calendar } from 'react-native-calendars';
import Ionicons from 'react-native-vector-icons/Ionicons';
import CustomModal from '@/components/CustomModal';
import CustomTextInput from './CustomTextInput';
import CustomButton from './CustomButton';
import { getFormattedDate } from '@/utils/dateHelpers';

type AddEventModalProps = {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (title: string, start: string, end: string) => void;
  onDelete?: () => void;
  defaultStart?: string;
  defaultEnd?: string;
  defaultTitle?: string;
  isEditing?: boolean;
  loading?: boolean;
};

const AddEventModal: React.FC<AddEventModalProps> = ({
  isVisible,
  onClose,
  onSubmit,
  onDelete,
  defaultStart,
  defaultEnd,
  defaultTitle = '',
  isEditing = false,
  loading = false,
}) => {
  const initialDate = defaultStart || moment().format('YYYY-MM-DD');
  const initialEndDate = defaultEnd || initialDate;

  const [title, setTitle] = useState(defaultTitle);
  const [titleError, setTitleError] = useState(false);

  const [selectedDates, setSelectedDates] = useState<{
    start: string;
    end: string;
  }>({
    start: initialDate,
    end: initialEndDate,
  });

  // Temporary selection while the calendar is open
  const [tempSelectedDates, setTempSelectedDates] = useState<{
    start: string;
    end: string;
  }>({
    start: initialDate,
    end: initialEndDate,
  });

  const [isCalendarVisible, setIsCalendarVisible] = useState(false);

  // Reset state whenever props change (e.g. new event defaults or editing a new event).
  useEffect(() => {
    setTitle(defaultTitle);
    setTitleError(false);
    setSelectedDates({ start: initialDate, end: initialEndDate });
    setTempSelectedDates({ start: initialDate, end: initialEndDate });
    setIsCalendarVisible(false);
  }, [defaultTitle, defaultStart, defaultEnd]);

  const handleSave = () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setTitleError(false);
    onSubmit(title, selectedDates.start, selectedDates.end);
  };

  // Handle the Delete tap
  const handleDelete = () => {
    if (onDelete) {
      onDelete();
    }
    onClose();
  };

  // Calendar logic
  const openCalendar = () => {
    setTempSelectedDates(selectedDates);
    setIsCalendarVisible(true);
  };

  const discardCalendar = () => {
    setTempSelectedDates(selectedDates);
    setIsCalendarVisible(false);
  };

  const saveCalendar = () => {
    setSelectedDates(tempSelectedDates);
    setIsCalendarVisible(false);
  };

  const handleDayPress = (day: { dateString: string }) => {
    const { start, end } = tempSelectedDates;
    if (!start || end) {
      // reset range
      setTempSelectedDates({ start: day.dateString, end: '' });
    } else {
      const isEndValid = moment(day.dateString).isSameOrAfter(start);
      setTempSelectedDates({
        start,
        end: isEndValid ? day.dateString : start,
      });
    }
  };

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
        // single-day selection
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
    onClose();
    // Not strictly necessary to reset state here if we're re-running useEffect on props changes
  };

  // Basic buttons: Cancel + Save/Add
  const buttons = [
    {
      label: 'Cancel',
      onPress: handleClose,
      variant: 'secondary' as const,
    },
    {
      label: isEditing ? 'Save Event' : 'Add Event',
      onPress: handleSave,
      variant: 'primary' as const,
      disabled: loading || !title.trim(),
    },
  ];

  return (
    <>
      {/* Full-screen calendar modal */}
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
              current={tempSelectedDates.start}
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

      {/* Main Add/Edit Event Modal */}
      <CustomModal
        isVisible={isVisible && !isCalendarVisible}
        onClose={handleClose}
        title={isEditing ? 'Edit event' : 'Add a new event'}
        buttons={buttons}
        loading={loading}
        animationType="none"
      >
        <View style={styles.content}>
          <Text style={styles.label}>Event name:</Text>
          <CustomTextInput
            placeholder="Your event name"
            placeholderTextColor="#666"
            value={title}
            onChangeText={(txt) => {
              setTitleError(false);
              setTitle(txt);
            }}
            autoCapitalize="sentences"
            hasBorder={true}
          />
          {titleError && (
            <Text style={{ color: 'red', marginTop: 4 }}>
              Please enter an event name
            </Text>
          )}

          <Text style={styles.label}>Event date:</Text>
          <View style={styles.dateContainer}>
            {selectedDates.start !== selectedDates.end ? (
              <>
                <Text style={styles.dateText}>
                  {getFormattedDate(selectedDates.start, true)}
                </Text>

                <Text style={styles.dateText}>
                  {' '}
                  - {getFormattedDate(selectedDates.end, true)}
                </Text>
              </>
            ) : (
              <Text style={styles.dateText}>
                {getFormattedDate(selectedDates.start)}
              </Text>
            )}

            <TouchableOpacity style={styles.iconWrapper} onPress={openCalendar}>
              <Ionicons name="calendar-outline" size={20} color="#1e90ff" />
            </TouchableOpacity>
          </View>

          {/* If editing, show delete button */}
          {isEditing && onDelete && (
            <CustomButton
              title="Delete Event"
              onPress={handleDelete}
              variant="secondaryDanger"
              accessibilityLabel="Delete Event"
              accessibilityHint="Delete the current event"
              icon={{ name: 'trash-outline' }}
            />
          )}
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
  },
});
