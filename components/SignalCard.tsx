// components/SignalCard.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomButton from './CustomButton';
import { Signal } from '@/types/Signal';

interface SignalCardProps {
  signal: Signal;
  onAccept: () => void;
  onIgnore: () => void;
  isLoading?: boolean;
}

const SignalCard: React.FC<SignalCardProps> = ({
  signal,
  onAccept,
  onIgnore,
  isLoading = false,
}) => {
  const getTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <View style={styles.container}>
      {/* Header with pulse animation indicator */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <View style={styles.pulseContainer}>
            <View style={styles.pulse} />
            <Ionicons name="location" size={16} color="#FF6B6B" />
          </View>
          <Text style={styles.title}>Someone wants to meet!</Text>
        </View>
        <Text style={styles.timeAgo}>
          {getTimeAgo(signal.createdAt.toDate())}
        </Text>
      </View>

      {/* Message */}
      {signal.message && (
        <View style={styles.messageContainer}>
          <Ionicons name="chatbubble-outline" size={14} color="#6B7280" />
          <Text style={styles.message}>"{signal.message}"</Text>
        </View>
      )}

      {/* Distance indicator */}
      <View style={styles.distanceContainer}>
        <Ionicons name="walk-outline" size={14} color="#6B7280" />
        <Text style={styles.distance}>
          Within {signal.radius}m • Tap to respond
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.buttonContainer}>
        <CustomButton
          title="Meet Up"
          onPress={onAccept}
          variant="success"
          icon={{ name: 'checkmark', size: 16, color: '#fff' }}
          style={styles.actionButton}
          loading={isLoading}
          disabled={isLoading}
        />
        <CustomButton
          title="Not Now"
          onPress={onIgnore}
          variant="secondaryDanger"
          icon={{ name: 'close', size: 16, color: '#DC3545' }}
          style={styles.actionButton}
          loading={isLoading}
          disabled={isLoading}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pulseContainer: {
    position: 'relative',
    marginRight: 8,
  },
  pulse: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF6B6B',
    opacity: 0.3,
    // Note: Add animation in future iterations
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  timeAgo: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: '#374151',
    fontStyle: 'italic',
    marginLeft: 8,
    flex: 1,
    lineHeight: 20,
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  distance: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 6,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
});

export default SignalCard;
