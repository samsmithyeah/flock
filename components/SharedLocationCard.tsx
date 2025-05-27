import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import CustomButton from '@/components/CustomButton';
import { SharedLocation } from '@/types/Signal';

interface SharedLocationCardProps {
  sharedLocation: SharedLocation;
  onCancel: (sharedLocationId: string) => void;
  onViewLocation: (signalId: string) => void;
  onSendMessage: (otherUserId: string) => void;
}

const SharedLocationCard: React.FC<SharedLocationCardProps> = ({
  sharedLocation,
  onCancel,
  onViewLocation,
  onSendMessage,
}) => {
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    const updateTimeRemaining = () => {
      const time = getTimeRemaining(sharedLocation.expiresAt);
      setTimeRemaining(time);
    };

    // Update immediately
    updateTimeRemaining();

    // Update every second
    const interval = setInterval(updateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [sharedLocation.expiresAt]);

  const getTimeRemaining = (expiresAt: any): string => {
    if (!expiresAt) return 'No expiration';

    const now = new Date();
    const expiry = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const totalMinutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else if (minutes > 0) {
      return `${minutes}m remaining`;
    } else {
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      return `${seconds}s remaining`;
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.info}>
          <Text style={styles.userName}>📍 {sharedLocation.otherUserName}</Text>
          <Text style={styles.timeRemaining}>{timeRemaining}</Text>
        </View>
        <View style={styles.status}>
          <Icon name="my-location" size={16} color="#2196F3" />
          <Text style={styles.statusText}>Sharing</Text>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <CustomButton
          title="View location"
          onPress={() => onViewLocation(sharedLocation.signalId)}
          variant="secondary"
          icon={{ name: 'location', size: 16, color: '#2196F3' }}
          style={styles.actionButton}
        />

        <CustomButton
          title="Send message"
          onPress={() => onSendMessage(sharedLocation.otherUserId)}
          variant="secondary"
          icon={{
            name: 'chatbubble-ellipses-outline',
            size: 16,
          }}
          style={styles.actionButton}
        />
      </View>

      <View style={styles.buttonRow}>
        <CustomButton
          title="Stop sharing"
          onPress={() => onCancel(sharedLocation.id)}
          variant="danger"
          icon={{ name: 'stop', size: 16, color: '#fff' }}
          style={styles.fullWidthButton}
        />
      </View>
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
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  fullWidthButton: {
    backgroundColor: '#ff4757',
    width: '100%',
  },
});

export default SharedLocationCard;
