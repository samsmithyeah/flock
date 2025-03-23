// components/MemberList.tsx

import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import SkeletonUserItem from '@/components/SkeletonUserItem';
import { User } from '@/types/User';
import { Ionicons } from '@expo/vector-icons';

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
  selectedMemberIds?: string[];
  onSelectMember?: (member: User) => void;
  scrollEnabled?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
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
  refreshing = false,
  onRefresh,
}) => {
  const sortedMembers = useMemo(() => {
    const membersCopy = [...members];
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
    const memberWithStatus = item as MemberWithStatus;
    const status = memberWithStatus.status;
    const isSelected = selectedMemberIds.includes(item.uid);
    const isDisabled = status === 'member' || status === 'invited';

    return (
      <TouchableOpacity
        style={styles.memberItem}
        onPress={() => {
          if (isDisabled) return;
          if (onMemberPress) {
            onMemberPress(item);
          }
        }}
        activeOpacity={isDisabled ? 1 : onMemberPress ? 0.7 : 1}
        disabled={isDisabled}
      >
        <ProfilePicturePicker
          imageUrl={item.photoURL || null}
          onImageUpdate={() => {}}
          editable={false}
          storagePath={`users/${item.uid}/profile.jpg`}
          size={40}
          isOnline={item.isOnline}
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
          {isDisabled && status === 'member' && (
            <Text style={styles.statusText}>Already a member of the crew</Text>
          )}
          {isDisabled && status === 'invited' && (
            <Text style={styles.statusText}>Already invited to the crew</Text>
          )}
        </View>
        {onSelectMember && !isDisabled && (
          <TouchableOpacity
            onPress={() => onSelectMember(item)}
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
    return (
      <View style={styles.container}>
        {[...Array(6)].map((_, index) => (
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
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />
    </View>
  );
};

export default MemberList;

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
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
    color: '#999',
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
    textAlign: 'left',
    marginLeft: 16,
    marginTop: 16,
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginLeft: 85,
  },
});
