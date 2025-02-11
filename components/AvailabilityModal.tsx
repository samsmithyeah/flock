import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import moment from 'moment';
import { Ionicons } from '@expo/vector-icons';
import { getFormattedDate } from '@/utils/dateHelpers';

const { width } = Dimensions.get('window');
const BASE_WIDTH = 393;
const vs = (size: number) => (width / BASE_WIDTH) * size;

interface AvailabilityModalProps {
  visible: boolean;
  onClose: () => void;
  date: string;
  availableCount: number;
  unavailableCount: number;
  uniformAvailable?: boolean | null;
  uniformUnavailable?: boolean | null;
  isLoading: boolean;
  onToggle: (toggleTo: boolean | null) => void;
}

const AvailabilityModal: React.FC<AvailabilityModalProps> = ({
  visible,
  onClose,
  date,
  uniformAvailable,
  uniformUnavailable,
  isLoading,
  onToggle,
  availableCount,
  unavailableCount,
}) => {
  const canClear = availableCount + unavailableCount > 0;

  const handleToggle = (toggleTo: boolean | null) => {
    let actionText = '';
    if (toggleTo === true) {
      actionText = 'mark yourself available';
    } else if (toggleTo === false) {
      actionText = 'mark yourself unavailable';
    } else {
      actionText = 'clear your status';
    }
    Alert.alert(
      'Confirm update',
      `Are you sure you want to ${actionText} across all your crews on ${moment(date).format('MMMM Do, YYYY')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: () => {
            onToggle(toggleTo);
            onClose();
          },
        },
      ],
      { cancelable: false },
    );
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
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={() => onClose()}
                  accessibilityLabel="Close options"
                  accessibilityHint="Closes the options menu"
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color="#D3D3D3" />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{getFormattedDate(date)}</Text>
              </View>
              <View style={styles.divider} />

              {!uniformAvailable && (
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => handleToggle(true)}
                  disabled={uniformAvailable || isLoading}
                  accessibilityLabel={`Mark as available for ${getFormattedDate(date)}`}
                  accessibilityHint={`Tap to mark yourself as available for all crews on ${moment(
                    date,
                  ).format('MMMM Do, YYYY')}.`}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={uniformAvailable ? '#A9A9A9' : '#32CD32'}
                    style={styles.modalIcon}
                  />
                  <Text
                    style={[
                      styles.modalText,
                      (uniformAvailable || isLoading) && styles.disabledText,
                    ]}
                  >
                    Mark as available for all crews
                  </Text>
                </TouchableOpacity>
              )}

              {!uniformUnavailable && (
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => handleToggle(false)}
                  disabled={uniformUnavailable || isLoading}
                  accessibilityLabel={`Mark as unavailable for ${getFormattedDate(date)}`}
                  accessibilityHint={`Tap to mark yourself as unavailable for all crews on ${moment(
                    date,
                  ).format('MMMM Do, YYYY')}.`}
                >
                  <Ionicons
                    name="close-circle"
                    size={24}
                    color={uniformUnavailable ? '#A9A9A9' : '#FF6347'}
                    style={styles.modalIcon}
                  />
                  <Text
                    style={[
                      styles.modalText,
                      (uniformUnavailable || isLoading) && styles.disabledText,
                    ]}
                  >
                    Mark as unavailable for all crews
                  </Text>
                </TouchableOpacity>
              )}

              {canClear && (
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => handleToggle(null)}
                  disabled={isLoading}
                  accessibilityLabel={`Clear your status for ${getFormattedDate(date)}`}
                  accessibilityHint={`Tap to clear your current status for all crews on ${moment(
                    date,
                  ).format('MMMM Do, YYYY')}.`}
                >
                  <Ionicons
                    name="remove-circle"
                    size={24}
                    color="#808080"
                    style={styles.modalIcon}
                  />
                  <Text
                    style={[styles.modalText, isLoading && styles.disabledText]}
                  >
                    Clear your status for all crews
                  </Text>
                </TouchableOpacity>
              )}
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
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
    color: '#333333',
    marginRight: 40, // to offset the closeButton width
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
    fontSize: vs(16),
    color: '#333333',
  },
  disabledText: {
    color: '#A9A9A9',
  },
});

export default AvailabilityModal;
