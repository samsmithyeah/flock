// components/MemberList.tsx

import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import SkeletonUserItem from '@/components/SkeletonUserItem';
import { User } from '@/types/User';
import { Ionicons } from '@expo/vector-icons';

// Define the extended interface with optional status
interface MemberWithStatus extends User {
  status?: 'member' | 'invited' | 'available';
}

interface MemberListProps {
  members: (User | MemberWithStatus)[];
  currentUserId: string | null;
  onMemberPress?: (member: User) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  adminIds?: string[];
  selectedMemberIds?: string[]; // For selection
  onSelectMember?: (memberId: string) => void; // For selection handler
  scrollEnabled?: boolean;
}

const MemberList: React.FC<MemberListProps> = ({
  members,
  currentUserId,
  onMemberPress,
  isLoading = false,
  emptyMessage = 'No members found.',
  adminIds = [],
  selectedMemberIds = [],
  onSelectMember,
  scrollEnabled = false,
}) => {
  // Memoize the sorted members to avoid unnecessary re-sorting on each render
  const sortedMembers = useMemo(() => {
    // Create a shallow copy to avoid mutating the original array
    const membersCopy = [...members];

    // Sort the members by displayName (case-insensitive)
    membersCopy.sort((a, b) => {
      const nameA = a.displayName ? a.displayName.toLowerCase() : '';
      const nameB = b.displayName ? b.displayName.toLowerCase() : '';

      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });

    return membersCopy;
  }, [members]);

  const renderItem = ({ item }: { item: User | MemberWithStatus }) => {
    // Determine if the member has a status
    const memberWithStatus = item as MemberWithStatus;
    const status = memberWithStatus.status;

    const isSelected = selectedMemberIds.includes(item.uid);
    const isDisabled = status === 'member' || status === 'invited';

    return (
      <TouchableOpacity
        style={styles.memberItem}
        onPress={() => {
          if (isDisabled) return; // Prevent interaction
          if (onMemberPress) {
            onMemberPress(item);
          }
        }}
        activeOpacity={isDisabled ? 1 : onMemberPress ? 0.7 : 1}
        disabled={isDisabled} // Visually disable the touchable
      >
        {/* Display Profile Picture */}
        <ProfilePicturePicker
          imageUrl={item.photoURL || null}
          onImageUpdate={() => {}}
          editable={false}
          storagePath={`users/${item.uid}/profile.jpg`}
          size={40}
        />
        <View style={styles.memberInfo}>
          <Text style={[styles.memberText, isDisabled && styles.disabledText]}>
            {item.displayName || 'Unnamed Member'}{' '}
            {item.uid === currentUserId && (
              <Text style={styles.youText}>(You)</Text>
            )}
          </Text>
          {adminIds.includes(item.uid) && (
            <View style={styles.adminIndicator}>
              <Text style={styles.adminText}>Admin</Text>
            </View>
          )}
          {/* Display Status Text if Disabled */}
          {isDisabled && status === 'member' && (
            <Text style={styles.statusText}>Already a member of the crew</Text>
          )}
          {isDisabled && status === 'invited' && (
            <Text style={styles.statusText}>Already invited to the crew</Text>
          )}
        </View>
        {/* Only show selection icon if member is available */}
        {onSelectMember && !isDisabled && (
          <TouchableOpacity
            onPress={() => onSelectMember(item.uid)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color="#1e90ff"
            />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    // Display Skeletons or Loading Indicators
    return (
      <View style={styles.container}>
        {[...Array(6)].map((_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
          <SkeletonUserItem key={index} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sortedMembers}
        keyExtractor={(item) => item.uid}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        }
        scrollEnabled={scrollEnabled}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
};

export default MemberList;

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 10,
  },
  memberText: {
    fontSize: 16,
    color: '#333',
  },
  disabledText: {
    color: '#999', // Darker gray text for disabled members
  },
  youText: {
    color: 'gray',
  },
  adminIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  adminText: {
    fontSize: 12,
    color: 'green',
    fontWeight: '600',
  },
  statusText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginLeft: 85,
  },
});
