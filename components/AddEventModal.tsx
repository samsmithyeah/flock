import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  Alert,
} from 'react-native';
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
  onSubmit: (
    title: string,
    date: string,
    unconfirmed: boolean,
    location: string,
  ) => void;
  onDelete: () => void;
  defaultDate?: string;
  defaultTitle?: string;
  isEditing?: boolean;
  loading?: boolean;
  defaultUnconfirmed?: boolean;
  defaultLocation?: string;
  onAddToCalendar?: () => void;
};

const AddEventModal: React.FC<AddEventModalProps> = ({
  isVisible,
  onClose,
  onSubmit,
  onDelete,
  defaultDate,
  defaultTitle = '',
  isEditing = false,
  loading = false,
  defaultUnconfirmed = true,
  defaultLocation = '',
  onAddToCalendar,
}) => {
  const initialDate = defaultDate || moment().format('YYYY-MM-DD');

  const [title, setTitle] = useState(defaultTitle);
  const [titleError, setTitleError] = useState(false);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [tempSelectedDate, setTempSelectedDate] = useState(initialDate);
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [isUnconfirmed, setIsUnconfirmed] = useState(defaultUnconfirmed);
  const [location, setLocation] = useState(defaultLocation);

  useEffect(() => {
    setTitle(defaultTitle);
    setTitleError(false);
    setSelectedDate(defaultDate || moment().format('YYYY-MM-DD'));
    setTempSelectedDate(defaultDate || moment().format('YYYY-MM-DD'));
    setIsCalendarVisible(false);
    setIsUnconfirmed(defaultUnconfirmed);
    setLocation(defaultLocation);
  }, [defaultTitle, defaultDate, defaultUnconfirmed, defaultLocation]);

  const handleSave = () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setTitleError(false);
    onSubmit(title, selectedDate, isUnconfirmed, location);
  };

  const handleDelete = () => {
    if (onDelete) onDelete();
    onClose();
  };

  const openCalendar = () => {
    setTempSelectedDate(selectedDate);
    setIsCalendarVisible(true);
  };

  const discardCalendar = () => {
    setTempSelectedDate(selectedDate);
    setIsCalendarVisible(false);
  };

  const saveCalendar = () => {
    setSelectedDate(tempSelectedDate);
    setIsCalendarVisible(false);
  };

  const handleDayPress = (day: { dateString: string }) => {
    setTempSelectedDate(day.dateString);
  };

  const getMarkedDates = () => {
    const marked: Record<string, any> = {};

    if (tempSelectedDate) {
      marked[tempSelectedDate] = {
        selected: true,
        selectedColor: '#5f9ea0',
      };
    }

    return marked;
  };

  const handleClose = () => {
    onClose();
  };

  const confirmAddToCalendar = () => {
    Alert.alert(
      'Add to calendar',
      'Do you want to add this event to your calendar?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () => {
            if (onAddToCalendar) onAddToCalendar();
          },
        },
      ],
    );
  };

  const buttons = [
    {
      label: 'Cancel',
      onPress: handleClose,
      variant: 'secondary' as const,
    },
    {
      label: isEditing ? 'Save' : 'Add event',
      onPress: handleSave,
      variant: 'primary' as const,
      disabled: loading || !title.trim(),
    },
  ];

  return (
    <>
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
              current={tempSelectedDate}
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
      <CustomModal
        isVisible={isVisible && !isCalendarVisible}
        onClose={handleClose}
        title={isEditing ? 'Edit event' : 'Add a new event'}
        buttons={buttons}
        loading={loading}
        animationType="none"
      >
        <View style={styles.content}>
          <CustomTextInput
            labelText="Event name"
            placeholder="Enter a name for the event"
            placeholderTextColor="#666"
            value={title}
            onChangeText={(txt) => {
              setTitleError(false);
              setTitle(txt);
            }}
            autoCapitalize="sentences"
            hasBorder
          />
          {titleError && (
            <Text style={{ color: 'red', marginTop: 4 }}>
              Please enter an event name
            </Text>
          )}
          <Text style={styles.label}>Event date</Text>
          <View style={styles.dateContainer}>
            <Text style={styles.dateText}>
              {getFormattedDate(selectedDate)}
            </Text>
            <TouchableOpacity style={styles.iconWrapper} onPress={openCalendar}>
              <Ionicons name="calendar-outline" size={20} color="#1e90ff" />
            </TouchableOpacity>
          </View>
          <CustomTextInput
            labelText="Location"
            placeholder="Enter a location"
            placeholderTextColor="#666"
            value={location}
            onChangeText={setLocation}
            autoCapitalize="sentences"
            hasBorder
          />
          <View style={styles.switchContainer}>
            <Text style={styles.label}>Is this event confirmed?</Text>
            <Switch
              onValueChange={() => setIsUnconfirmed(!isUnconfirmed)}
              value={!isUnconfirmed}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={!isUnconfirmed ? '#f5dd4b' : '#f4f3f4'}
            />
          </View>
          {isEditing && (
            <>
              {onAddToCalendar && (
                <CustomButton
                  title="Add to calendar"
                  onPress={confirmAddToCalendar}
                  variant="secondary"
                  accessibilityLabel="Add to Calendar"
                  accessibilityHint="Add the current event to your calendar"
                  icon={{ name: 'calendar-outline' }}
                />
              )}
              <CustomButton
                title="Delete event"
                onPress={handleDelete}
                variant="secondaryDanger"
                accessibilityLabel="Delete Event"
                accessibilityHint="Delete the current event"
                icon={{ name: 'trash-outline' }}
                style={{ marginTop: 5 }}
              />
            </>
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
    fontWeight: '500',
    color: '#333',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
    fontStyle: 'italic',
    fontWeight: '300',
  },
  iconWrapper: {
    marginLeft: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    justifyContent: 'space-between',
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
