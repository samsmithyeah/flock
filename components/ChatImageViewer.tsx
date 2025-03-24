import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MessageImageProps, IMessage } from 'react-native-gifted-chat';

// Get screen dimensions for full-screen display
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface ChatImageViewerProps extends MessageImageProps<IMessage> {
  // You can add additional props here if needed
  imageStyle?: any;
}

const ChatImageViewer: React.FC<ChatImageViewerProps> = (props) => {
  const { currentMessage, imageStyle } = props;
  const [isModalVisible, setIsModalVisible] = useState(false);

  // If there's no image URL, don't render anything
  if (!currentMessage?.image) return null;

  return (
    <View>
      {/* Thumbnail image (in chat bubble) */}
      <TouchableOpacity
        onPress={() => setIsModalVisible(true)}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: currentMessage.image }}
          style={[styles.messageImage, imageStyle]}
          resizeMode="cover"
        />
      </TouchableOpacity>

      {/* Full-screen modal */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <StatusBar backgroundColor="black" barStyle="light-content" />
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setIsModalVisible(false)}
          >
            <Ionicons name="close" size={30} color="white" />
          </TouchableOpacity>

          <Image
            source={{ uri: currentMessage.image }}
            style={styles.fullScreenImage}
            resizeMode="contain"
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 13,
    margin: 3,
    resizeMode: 'cover',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: screenWidth,
    height: screenHeight * 0.8,
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
});

export default ChatImageViewer;
