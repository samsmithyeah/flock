import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import ActionSheet from './ActionSheet';
import { ActionSheetOption } from './ActionSheet';

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
  // Define the options for the ActionSheet
  const options: ActionSheetOption[] = [
    {
      icon: <Ionicons name="images-outline" size={24} color="#007AFF" />,
      label: 'Photo library',
      onPress: onGalleryPress,
    },
    {
      icon: <Ionicons name="camera-outline" size={24} color="#007AFF" />,
      label: 'Camera',
      onPress: onCameraPress,
    },
  ];

  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="Choose image source"
      options={options}
    />
  );
};

export default ImageOptionsMenu;
