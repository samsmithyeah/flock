// components/SignalCard.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ActionButton from './ActionButton';
import { Signal } from '@/types/Signal';

interface SignalCardProps {
  signal: Signal;
  onAccept: () => void;
  onIgnore: () => void;
  onSendMessage?: () => void;
  isLoading?: boolean;
}

const SignalCard: React.FC<SignalCardProps> = ({
  signal,
  onAccept,
  onIgnore,
  onSendMessage,
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
          <Text style={styles.title}>
            {signal.senderName
              ? `${signal.senderName} wants to meet!`
              : 'Someone wants to meet!'}
          </Text>
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
        <Text style={styles.distance}>Within {signal.radius}m</Text>
      </View>

      {/* Action buttons */}
      <View style={styles.buttonContainer}>
        <ActionButton
          icon={{ name: 'checkmark', size: 20 }}
          onPress={onAccept}
          variant="success"
          loading={isLoading}
          disabled={isLoading}
          accessibilityLabel="Accept signal"
          accessibilityHint="Tap to accept this meet up signal"
        />

        <ActionButton
          icon={{ name: 'close', size: 20 }}
          onPress={onIgnore}
          variant="secondaryDanger"
          loading={isLoading}
          disabled={isLoading}
          accessibilityLabel="Ignore signal"
          accessibilityHint="Tap to ignore this meet up signal"
        />
        {onSendMessage && (
          <ActionButton
            icon={{ name: 'chatbubble-ellipses-outline', size: 20 }}
            onPress={onSendMessage}
            variant="secondary"
            loading={isLoading}
            disabled={isLoading}
            accessibilityLabel="Send direct message"
            accessibilityHint="Tap to send a direct message to this person"
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
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
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
});

export default SignalCard;
