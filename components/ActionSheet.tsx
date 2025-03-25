import React, { ReactNode } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';

export interface ActionSheetOption {
  icon?: ReactNode;
  label: string;
  onPress: () => void;
  color?: string;
  destructive?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: ActionSheetOption[];
  cancelButtonLabel?: string;
}

const ActionSheet: React.FC<ActionSheetProps> = ({
  visible,
  onClose,
  title,
  options,
  cancelButtonLabel = 'Cancel',
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <BlurView intensity={30} style={StyleSheet.absoluteFill} />
        <View style={styles.optionsContainer}>
          <View style={styles.optionsContent}>
            {title && <Text style={styles.optionsTitle}>{title}</Text>}

            {options.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.optionButton,
                  index > 0 && styles.optionSeparator,
                ]}
                onPress={() => {
                  onClose();
                  option.onPress();
                }}
              >
                {option.icon && (
                  <View style={styles.optionIcon}>{option.icon}</View>
                )}
                <Text
                  style={[
                    styles.optionText,
                    option.color ? { color: option.color } : null,
                    option.destructive ? styles.destructiveText : null,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.cancelButtonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>{cancelButtonLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  optionsContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 30 : 10,
  },
  optionsContent: {
    width: '92%',
    backgroundColor: 'white',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
  },
  optionsTitle: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    color: '#8E8E93',
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  optionSeparator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C8C7CC',
  },
  optionIcon: {
    marginRight: 12,
  },
  optionText: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '400',
  },
  destructiveText: {
    color: '#FF3B30',
  },
  cancelButtonContainer: {
    width: '92%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  cancelButton: {
    backgroundColor: 'white',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  cancelButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
  },
});

export default ActionSheet;
