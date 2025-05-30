// components/CrewSelectorModal.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Crew } from '@/types/Crew';
import CustomModal from '@/components/CustomModal';

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

        {crews.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={32} color="#999" />
            <Text style={styles.emptyText}>No crews available</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollContainer}>
            {crews.map((crew) => {
              const isSelected = selectedCrewIds.includes(crew.id);
              return (
                <TouchableOpacity
                  key={crew.id}
                  style={[styles.crewItem, isSelected && styles.selectedItem]}
                  onPress={() => onToggleCrew(crew.id)}
                  accessibilityLabel={`${isSelected ? 'Deselect' : 'Select'} ${crew.name} crew`}
                >
                  {/* Crew Image */}
                  {crew.iconUrl ? (
                    <Image
                      source={{ uri: crew.iconUrl }}
                      style={styles.crewImage}
                    />
                  ) : (
                    <View style={styles.placeholderImage}>
                      <Ionicons name="people-outline" size={24} color="#888" />
                    </View>
                  )}

                  {/* Crew Details */}
                  <View style={styles.crewDetails}>
                    <Text style={styles.crewName}>{crew.name}</Text>
                    <Text style={styles.memberCount}>
                      {crew.memberIds?.length || 0} member
                      {crew.memberIds?.length !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  {/* Selection Indicator */}
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxSelected,
                    ]}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

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
  scrollContainer: {
    maxHeight: 300,
  },
  crewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 8,
  },
  selectedItem: {
    borderColor: '#1e90ff',
    backgroundColor: '#F0F8FF',
  },
  crewImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  placeholderImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  crewDetails: {
    flex: 1,
  },
  crewName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  memberCount: {
    fontSize: 13,
    color: '#666',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#1e90ff',
    borderColor: '#1e90ff',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
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
