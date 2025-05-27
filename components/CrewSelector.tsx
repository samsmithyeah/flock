// components/CrewSelector.tsx

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Crew } from '@/types/Crew';

interface CrewSelectorProps {
  crews: Crew[];
  selectedCrewIds: string[];
  onToggleCrew: (crewId: string) => void;
}

const CrewSelector: React.FC<CrewSelectorProps> = ({
  crews,
  selectedCrewIds,
  onToggleCrew,
}) => {
  if (crews.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="people-outline" size={32} color="#999" />
        <Text style={styles.emptyText}>No crews available</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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
              <Image source={{ uri: crew.iconUrl }} style={styles.crewImage} />
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
              style={[styles.checkbox, isSelected && styles.checkboxSelected]}
            >
              {isSelected && (
                <Ionicons name="checkmark" size={16} color="#fff" />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    maxHeight: 200,
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
});

export default CrewSelector;
