// components/CrewSelectorModal.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Crew } from '@/types/Crew';
import CustomModal from '@/components/CustomModal';
import CrewSelector from '@/components/CrewSelector';

interface CrewSelectorModalProps {
  isVisible: boolean;
  onClose: () => void;
  crews: Crew[];
  selectedCrewIds: string[];
  onToggleCrew: (crewId: string) => void;
  onConfirm: () => void;
}

const CrewSelectorModal: React.FC<CrewSelectorModalProps> = ({
  isVisible,
  onClose,
  crews,
  selectedCrewIds,
  onToggleCrew,
  onConfirm,
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const selectedCount = selectedCrewIds.length;
  const hasSelection = selectedCount > 0;

  return (
    <CustomModal
      isVisible={isVisible}
      onClose={onClose}
      title="Select crews"
      buttons={[
        {
          label: 'Cancel',
          onPress: handleCancel,
          variant: 'secondary',
        },
        {
          label: 'Confirm',
          onPress: handleConfirm,
          variant: 'primary',
          disabled: !hasSelection,
        },
      ]}
    >
      <View style={styles.container}>
        <Text style={styles.description}>
          Choose which crews should receive your signal
        </Text>

        <CrewSelector 
          crews={crews}
          selectedCrewIds={selectedCrewIds}
          onToggleCrew={onToggleCrew}
          maxHeight={300}
        />

        {selectedCount > 0 && (
          <View style={styles.selectionSummary}>
            <Text style={styles.selectionText}>
              {selectedCount} crew{selectedCount !== 1 ? 's' : ''} selected
            </Text>
          </View>
        )}
      </View>
    </CustomModal>
  );
};

const styles = StyleSheet.create({
  container: {
    maxHeight: 400,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  selectionSummary: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    alignItems: 'center',
  },
  selectionText: {
    fontSize: 14,
    color: '#1e90ff',
    fontWeight: '600',
  },
});

export default CrewSelectorModal;
