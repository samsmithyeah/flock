import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { saveImageToGallery } from '@/utils/saveImageToGallery';
import ActionSheet from '@/components/ActionSheet';

// Define interface for the action sheet props
interface ImageSaveActionSheetProps {
  onSaveComplete?: () => void;
}

// Define interface for the ref methods
export interface ImageSaveActionSheetRef {
  showOptions: (imageUrl: string) => void;
}

const ImageSaveActionSheet = forwardRef<
  ImageSaveActionSheetRef,
  ImageSaveActionSheetProps
>(({ onSaveComplete }, ref) => {
  // State to manage visibility and current image URL
  const [isVisible, setIsVisible] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>('');

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    showOptions: (imageUrl: string) => {
      setCurrentImageUrl(imageUrl);
      setIsVisible(true);
    },
  }));

  // Handle save image
  const handleSaveImage = async () => {
    if (!currentImageUrl) return;

    await saveImageToGallery(currentImageUrl);
    onSaveComplete?.();
  };

  const actionSheetOptions = [
    {
      icon: <Ionicons name="download-outline" size={22} color="#007AFF" />,
      label: 'Save to device',
      onPress: handleSaveImage,
    },
  ];

  return (
    <ActionSheet
      visible={isVisible}
      onClose={() => setIsVisible(false)}
      title="Image options"
      options={actionSheetOptions}
    />
  );
});

// Add display name to fix the ESLint warning
ImageSaveActionSheet.displayName = 'ImageSaveActionSheet';

export default ImageSaveActionSheet;
