import React from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ImageOptionsMenuProps {
  visible: boolean;
  onClose: () => void;
  onGalleryPress: () => void;
  onCameraPress: () => void;
}

const ImageOptionsMenu: React.FC<ImageOptionsMenuProps> = ({
  visible,
  onClose,
  onGalleryPress,
  onCameraPress,
}) => {
  if (!visible) return null;

  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <Text style={styles.title}>Send Photo</Text>

              <TouchableOpacity style={styles.option} onPress={onGalleryPress}>
                <Ionicons name="images-outline" size={24} color="#1E90FF" />
                <Text style={styles.optionText}>Choose from gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.option} onPress={onCameraPress}>
                <Ionicons name="camera-outline" size={24} color="#1E90FF" />
                <Text style={styles.optionText}>Take photo</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  optionText: {
    fontSize: 16,
    marginLeft: 16,
    color: '#333',
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
});

export default ImageOptionsMenu;
