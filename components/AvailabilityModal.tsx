// components/AvailabilityModal.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import moment from 'moment';
import { Ionicons } from '@expo/vector-icons';

interface AvailabilityModalProps {
  visible: boolean;
  onClose: () => void;
  date: string;
  isFullyUp: boolean;
  isNotUp: boolean;
  isLoading: boolean;
  onToggle: (toggleTo: boolean) => void;
}

const AvailabilityModal: React.FC<AvailabilityModalProps> = ({
  visible,
  onClose,
  date,
  isFullyUp,
  isNotUp,
  isLoading,
  onToggle,
}) => {
  const handleToggle = (toggleTo: boolean) => {
    Alert.alert(
      'Confirm update',
      `Are you sure you want to mark yourself ${
        toggleTo ? 'available' : 'unavailable'
      } across all your crews on ${moment(date).format('MMMM Do, YYYY')}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'OK',
          onPress: () => {
            onToggle(toggleTo);
            onClose(); // Close the modal after action
          },
        },
      ],
      { cancelable: false },
    );
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContainer}>
              {/* Close Icon */}
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                accessibilityLabel="Close options"
                accessibilityHint="Closes the options menu"
              >
                <Ionicons name="close" size={24} color="#D3D3D3" />
              </TouchableOpacity>

              {/* Modal Title */}
              <Text style={styles.modalTitle}>{getFormattedDate(date)}</Text>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Option: Mark as Available */}
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => handleToggle(true)}
                disabled={isFullyUp || isLoading}
                accessibilityLabel={`Mark as available for ${getFormattedDate(date)}`}
                accessibilityHint={
                  isFullyUp
                    ? `You are already marked as available for all crews on ${moment(
                        date,
                      ).format('MMMM Do, YYYY')}.`
                    : `Tap to mark yourself as available for all crews on ${moment(
                        date,
                      ).format('MMMM Do, YYYY')}.`
                }
              >
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={isFullyUp ? '#A9A9A9' : '#32CD32'}
                  style={styles.modalIcon}
                />
                <Text
                  style={[
                    styles.modalText,
                    (isFullyUp || isLoading) && styles.disabledText,
                  ]}
                >
                  Mark as available for all crews
                </Text>
              </TouchableOpacity>

              {/* Option: Mark as Unavailable */}
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => handleToggle(false)}
                disabled={isNotUp || isLoading}
                accessibilityLabel={`Mark as unavailable for ${getFormattedDate(date)}`}
                accessibilityHint={
                  isNotUp
                    ? `You are already marked as unavailable for any crews on ${moment(
                        date,
                      ).format('MMMM Do, YYYY')}.`
                    : `Tap to mark yourself as unavailable for any crews on ${moment(
                        date,
                      ).format('MMMM Do, YYYY')}.`
                }
              >
                <Ionicons
                  name="close-circle"
                  size={24}
                  color={isNotUp ? '#A9A9A9' : '#FF6347'}
                  style={styles.modalIcon}
                />
                <Text
                  style={[
                    styles.modalText,
                    (isNotUp || isLoading) && styles.disabledText,
                  ]}
                >
                  Mark as unavailable for all crews
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    elevation: 5,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
    color: '#333333',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginBottom: 12,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalIcon: {
    marginRight: 12,
  },
  modalText: {
    fontSize: 16,
    color: '#333333',
  },
  disabledText: {
    color: '#A9A9A9',
  },
});

export default AvailabilityModal;
