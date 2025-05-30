import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ActionButton from './ActionButton';
import Badge from './Badge';
import { Signal } from '@/types/Signal';
import { useCrews } from '@/context/CrewsContext';

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
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const { crews } = useCrews();

  // Filter crew names to only show crews the user is a member of
  const getFilteredCrewNames = (): string[] => {
    if (!signal.targetCrewNames || signal.targetType !== 'crews') {
      return [];
    }

    const userCrewNames = crews.map((crew) => crew.name);
    return signal.targetCrewNames.filter((crewName) =>
      userCrewNames.includes(crewName),
    );
  };

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

  const getTimeRemaining = (expiresAt: any): string => {
    if (!expiresAt) return 'No expiration';

    const now = new Date();
    let expiry: Date;

    // Handle different timestamp formats
    if (expiresAt.toDate && typeof expiresAt.toDate === 'function') {
      expiry = expiresAt.toDate();
    } else if (expiresAt instanceof Date) {
      expiry = expiresAt;
    } else {
      expiry = new Date(expiresAt);
    }

    const diff = expiry.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const totalMinutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    } else if (minutes > 0) {
      return `${minutes}m left`;
    } else {
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      return `${seconds}s left`;
    }
  };

  // Update time remaining every second
  useEffect(() => {
    const updateTimeRemaining = () => {
      const time = getTimeRemaining(signal.expiresAt);
      setTimeRemaining(time);
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [signal.expiresAt]);

  // Confirmation dialog handlers
  const handleAcceptPress = () => {
    Alert.alert(
      'Accept signal',
      `Accept ${signal.senderName ? `${signal.senderName}'s` : 'this'} signal? This will share your location.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Accept',
          style: 'default',
          onPress: onAccept,
        },
      ],
    );
  };

  const handleIgnorePress = () => {
    Alert.alert(
      'Decline signal',
      `Decline ${signal.senderName ? `${signal.senderName}'s` : 'this'} signal?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: onIgnore,
        },
      ],
    );
  };

  const handleSendMessagePress = () => {
    if (!onSendMessage) return;

    Alert.alert(
      'Send message',
      `Send a direct message to ${signal.senderName || 'this person'}? This will navigate you to the chat screen.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Send message',
          style: 'default',
          onPress: onSendMessage,
        },
      ],
    );
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
        <View style={styles.timeContainer}>
          <Text style={styles.timeAgo}>
            {getTimeAgo(signal.createdAt.toDate())}
          </Text>
          <Text style={styles.timeRemaining}>{timeRemaining}</Text>
        </View>
      </View>

      {/* Crew context for crew-specific signals */}
      {signal.targetType === 'crews' &&
        (() => {
          const filteredCrewNames = getFilteredCrewNames();
          return (
            filteredCrewNames.length > 0 && (
              <View style={styles.crewContainer}>
                <View style={styles.crewBadgesContainer}>
                  {filteredCrewNames.map((crewName, index) => (
                    <Badge
                      key={index}
                      text={crewName}
                      variant="info"
                      icon={{
                        name: 'people',
                        size: 12,
                      }}
                      style={styles.crewBadge}
                    />
                  ))}
                </View>
              </View>
            )
          );
        })()}

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
          onPress={handleAcceptPress}
          variant="success"
          loading={isLoading}
          disabled={isLoading}
          accessibilityLabel="Accept signal"
          accessibilityHint="Tap to accept this meet up signal"
        />

        <ActionButton
          icon={{ name: 'close', size: 20 }}
          onPress={handleIgnorePress}
          variant="secondaryDanger"
          loading={isLoading}
          disabled={isLoading}
          accessibilityLabel="Ignore signal"
          accessibilityHint="Tap to ignore this meet up signal"
        />
        {onSendMessage && (
          <ActionButton
            icon={{ name: 'chatbubble-ellipses-outline', size: 20 }}
            onPress={handleSendMessagePress}
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
  timeContainer: {
    alignItems: 'flex-end',
  },
  timeAgo: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  timeRemaining: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '600',
    marginTop: 2,
  },
  crewContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  crewBadgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  crewBadge: {
    marginBottom: 4,
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
