import React, { useState } from 'react';
import {
  TouchableOpacity,
  Modal,
  View,
  StyleSheet,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MessageImageProps } from 'react-native-gifted-chat';
import { Ionicons } from '@expo/vector-icons';
import ImageViewer from 'react-native-image-zoom-viewer';
import { saveImageToGallery } from '@/utils/saveImageToGallery';
import ActionSheet from '@/components/ActionSheet';

const ChatImageViewer: React.FC<MessageImageProps<any>> = (props) => {
  const { currentMessage, containerStyle, imageStyle } = props;
  const [modalVisible, setModalVisible] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [loading, setSaving] = useState(false);

  // Extract image URL from message
  const imageUrl = currentMessage?.image;

  if (!imageUrl) {
    return null;
  }

  // Handle long press on image
  const handleLongPress = () => {
    setOptionsVisible(true);
  };

  // Handle modal close
  const handleModalClose = () => {
    setModalVisible(false);
  };

  // Handle image save option
  const handleSaveImage = async () => {
    try {
      setSaving(true);
      await saveImageToGallery(imageUrl);
    } finally {
      setSaving(false);
    }
  };

  const actionSheetOptions = [
    {
      icon: <Ionicons name="download-outline" size={22} color="#007AFF" />,
      label: 'Save to device',
      onPress: handleSaveImage,
    },
  ];

  return (
    <View style={containerStyle}>
      {/* Regular image with long press handler */}
      <TouchableOpacity
        activeOpacity={0.8}
        style={{ borderRadius: 13, overflow: 'hidden' }}
        onPress={() => setModalVisible(true)}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        <Image source={{ uri: imageUrl }} style={[styles.image, imageStyle]} />
      </TouchableOpacity>

      {/* Fullscreen image modal */}
      <Modal
        visible={modalVisible}
        transparent
        onRequestClose={handleModalClose}
      >
        <ImageViewer
          imageUrls={[{ url: imageUrl }]}
          enableSwipeDown
          onSwipeDown={handleModalClose}
          loadingRender={() => <ActivityIndicator color="#fff" />}
          saveToLocalByLongPress={false}
          renderHeader={() => (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleModalClose}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          )}
          onClick={handleModalClose}
          onLongPress={handleLongPress}
        />
      </Modal>

      {/* Use our new reusable ActionSheet component */}
      <ActionSheet
        visible={optionsVisible}
        onClose={() => setOptionsVisible(false)}
        title="Image options"
        options={actionSheetOptions}
      />

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    width: 200,
    height: 200,
    borderRadius: 13,
    margin: 3,
    resizeMode: 'cover',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ChatImageViewer;
