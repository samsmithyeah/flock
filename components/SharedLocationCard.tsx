import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import CustomButton from '@/components/CustomButton';
import { SharedLocation } from '@/types/Signal';

interface SharedLocationCardProps {
  sharedLocation: SharedLocation;
  onCancel: (sharedLocationId: string) => void;
}

const SharedLocationCard: React.FC<SharedLocationCardProps> = ({
  sharedLocation,
  onCancel,
}) => {
  const getTimeRemaining = (expiresAt: any): string => {
    if (!expiresAt) return 'No expiration';

    const now = new Date();
    const expiry = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m remaining`;
    }
    return `${minutes}m remaining`;
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.info}>
          <Text style={styles.userName}>📍 {sharedLocation.otherUserName}</Text>
          <Text style={styles.timeRemaining}>
            {getTimeRemaining(sharedLocation.expiresAt)}
          </Text>
        </View>
        <View style={styles.status}>
          <Icon name="my-location" size={16} color="#2196F3" />
          <Text style={styles.statusText}>Sharing</Text>
        </View>
      </View>

      <CustomButton
        title="Stop Sharing"
        onPress={() => onCancel(sharedLocation.id)}
        variant="danger"
        icon={{ name: 'stop', size: 16, color: '#fff' }}
        style={styles.stopButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  info: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  timeRemaining: {
    fontSize: 12,
    color: '#666',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#2196F3',
    marginLeft: 4,
    fontWeight: '600',
  },
  stopButton: {
    backgroundColor: '#ff4757',
  },
});

export default SharedLocationCard;
