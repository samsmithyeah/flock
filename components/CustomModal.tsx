// components/CustomModal.tsx

import React, { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import CustomButton from './CustomButton';
import Colors from '@/styles/colors';
import SpinLoader from './SpinLoader';
import Toast from 'react-native-toast-message';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary' | 'danger' | 'success' | 'secondaryDanger';
  disabled?: boolean;
};

type CustomModalProps = {
  isVisible: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  buttons: ButtonProps[];
  loading?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
};

const CustomModal: React.FC<CustomModalProps> = ({
  isVisible,
  onClose,
  title,
  children,
  buttons,
  loading = false,
  animationType = 'fade',
}) => {
  return (
    <Modal visible={isVisible} animationType={animationType} transparent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalBackdrop}>
              <View style={{ opacity: loading ? 0 : 1 }}>
                <Text style={styles.modalTitle}>{title}</Text>
                <View style={styles.modalContent}>{children}</View>
                <View
                  style={
                    buttons.length > 1
                      ? styles.buttonContainer
                      : styles.singleButtonContainer
                  }
                >
                  {buttons.map((button, index) => (
                    <CustomButton
                      key={index}
                      title={button.label}
                      onPress={button.onPress}
                      variant={button.variant}
                      disabled={button.disabled}
                      loading={false}
                    />
                  ))}
                </View>
              </View>

              {loading && (
                <View style={styles.loadingOverlay}>
                  <SpinLoader text="Processing..." />
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
      <Toast />
    </Modal>
  );
};

export default CustomModal;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalBackdrop: {
    position: 'relative',
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 25,
    width: '85%',
    shadowColor: '#000',
    elevation: 5,
  },
  modalContent: {
    alignContent: 'flex-start',
  },
  modalTitle: {
    fontSize: 20,
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: '600',
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  singleButtonContainer: {
    width: '100%',
    marginTop: 10,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
});
