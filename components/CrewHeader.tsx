// components/CrewHeader.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Crew } from '@/types/Crew';
import ProfilePicturePicker from '@/components/ProfilePicturePicker'; // Reuse existing component

interface CrewHeaderProps {
  crew: Crew;
  customCrewName?: string;
  customMemberCount?: number;
  onPress?: () => void;
}

const CrewHeader: React.FC<CrewHeaderProps> = ({
  crew,
  customCrewName,
  customMemberCount,
  onPress,
}) => {
  const crewName = customCrewName || crew.name;
  const memberCount = customMemberCount || crew.memberIds.length;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onPress} style={styles.container}>
        <ProfilePicturePicker
          imageUrl={crew.iconUrl || null}
          iconName="people-outline"
          onImageUpdate={() => {}}
          editable={false}
          size={35}
        />
        <View style={styles.textContainer}>
          <Text style={styles.crewName}>{crewName}</Text>
          <Text style={styles.memberCount}>
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

export default CrewHeader;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  textContainer: {
    marginLeft: 10,
  },
  crewName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  memberCount: {
    fontSize: 14,
    color: '#666',
  },
});
