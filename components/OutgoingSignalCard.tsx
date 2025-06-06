import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import CustomButton from './CustomButton';
import ActionButton from './ActionButton';
import Badge from './Badge';
import { Signal } from '@/types/Signal';
import { getTimeAgo, getTimeRemaining } from '@/utils/timeUtils';

interface OutgoingSignalCardProps {
  signal: Signal;
  signalAddress?: string;
  onCancel: (signalId: string) => void;
  onLocationShare: (signalId: string) => void;
  formatDistance: (meters: number) => string;
}

const OutgoingSignalCard: React.FC<OutgoingSignalCardProps> = ({
  signal,
  signalAddress,
  onCancel,
  onLocationShare,
  formatDistance,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every 5 seconds to trigger re-renders for the timeout check
  // but only until we've shown the "no notifications" message or there are responses
  useEffect(() => {
    const createdAt = signal.createdAt?.toDate
      ? signal.createdAt.toDate()
      : signal.createdAt instanceof Date
        ? signal.createdAt
        : signal.createdAt
          ? new Date(signal.createdAt as any)
          : new Date();

    const notificationCount = (signal as any).notificationsSent || 0;
    const hasResponses = signal.responses.length > 0;
    const timeElapsed = currentTime.getTime() - createdAt.getTime();
    const alreadyShowingNoNotifications =
      timeElapsed > 10000 && notificationCount === 0;

    // Stop the timer if we already have responses, notifications, or are showing the warning
    if (
      hasResponses ||
      notificationCount > 0 ||
      alreadyShowingNoNotifications
    ) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 5000);

    return () => clearInterval(interval);
  }, [signal.responses.length, (signal as any).notificationsSent, currentTime]);

  // Don't render expired signals
  const now = currentTime;
  const expiresAt = signal.expiresAt.toDate
    ? signal.expiresAt.toDate()
    : signal.expiresAt instanceof Date
      ? signal.expiresAt
      : new Date(signal.expiresAt as any);

  if (expiresAt <= now) {
    return null;
  }

  // Get notification count (defaults to 0 if not available)
  const notificationCount = (signal as any).notificationsSent || 0;

  // Check if signal is old enough to show "no notifications" message
  const createdAt = signal.createdAt?.toDate
    ? signal.createdAt.toDate()
    : signal.createdAt instanceof Date
      ? signal.createdAt
      : signal.createdAt
        ? new Date(signal.createdAt as any)
        : now; // fallback to current time if createdAt is null/undefined

  const timeElapsed = now.getTime() - createdAt.getTime();
  const showNoNotificationsMessage =
    timeElapsed > 10000 && notificationCount === 0; // 10 seconds

  return (
    <View style={styles.signalCard}>
      <View style={styles.signalHeader}>
        <View style={styles.signalMainInfo}>
          <Icon
            name="radio-button-on"
            size={20}
            color="#4CAF50"
            style={styles.signalIcon}
          />
          <View style={styles.signalDetails}>
            <Text style={styles.signalTitle}>
              {signalAddress || 'Loading location...'}
            </Text>
            <Text style={styles.signalSubtext}>
              {getTimeAgo(signal.createdAt)} •{' '}
              {getTimeRemaining(signal.expiresAt)}
            </Text>
            <Text style={styles.signalRadius}>
              {formatDistance(signal.radius)} radius
            </Text>
            {notificationCount > 0 && (
              <Text style={styles.notificationCount}>
                {notificationCount}{' '}
                {notificationCount === 1 ? 'contact' : 'contacts'} notified
              </Text>
            )}
          </View>
          <View style={styles.signalStatus}>
            <Text style={styles.statusText}>Live</Text>
          </View>
        </View>
      </View>

      {/* Message if present */}
      {signal.message && (
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>"{signal.message}"</Text>
        </View>
      )}

      {/* Target crews display */}
      {signal.targetType === 'crews' &&
        signal.targetCrewNames &&
        signal.targetCrewNames.length > 0 && (
          <View style={styles.crewTargetContainer}>
            <View style={styles.crewBadgesContainer}>
              {signal.targetCrewNames.map((crewName, index) => (
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
        )}

      {/* Responses List */}
      {signal.responses.length > 0 ? (
        <View style={styles.responsesList}>
          {signal.responses.map((response, index) => (
            <View key={index} style={styles.responseItem}>
              <View style={styles.responderInfo}>
                <View
                  style={[
                    styles.responseIndicator,
                    response.response === 'accept'
                      ? styles.acceptedIndicator
                      : styles.declinedIndicator,
                  ]}
                >
                  <Icon
                    name={response.response === 'accept' ? 'check' : 'close'}
                    size={12}
                    color="#fff"
                  />
                </View>
                <View style={styles.responderDetails}>
                  <Text style={styles.responderName}>
                    {response.responderName || `User ${index + 1}`}
                  </Text>
                  <Text style={styles.responseStatus}>
                    {response.response === 'accept' ? 'Accepted' : 'Declined'}
                  </Text>
                </View>
              </View>
              {response.response === 'accept' && (
                <View style={styles.responseActions}>
                  <ActionButton
                    onPress={() => onLocationShare(signal.id)}
                    variant="secondary"
                    icon={{
                      name: 'location',
                      size: 16,
                    }}
                    style={styles.actionButton}
                    accessibilityLabel="Share location"
                    accessibilityHint="Share your location with this user"
                  />
                  <ActionButton
                    onPress={() =>
                      router.push({
                        pathname: '/chats/dm-chat',
                        params: {
                          otherUserId: response.responderId,
                        },
                      })
                    }
                    variant="secondary"
                    icon={{
                      name: 'chatbubble-ellipses-outline',
                      size: 16,
                    }}
                    style={styles.actionButton}
                    accessibilityLabel="Send message"
                    accessibilityHint="Send a direct message to this user"
                  />
                </View>
              )}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyResponsesContainer}>
          <Icon
            name={showNoNotificationsMessage ? 'error-outline' : 'schedule'}
            size={24}
            color={showNoNotificationsMessage ? '#ff9800' : '#ccc'}
          />
          <Text style={styles.noResponsesText}>
            {showNoNotificationsMessage
              ? 'Nobody was notified - try increasing the radius or adding more crews'
              : 'Waiting for responses...'}
          </Text>
        </View>
      )}

      {/* Cancel Signal Button */}
      <CustomButton
        title="Cancel signal"
        onPress={() => onCancel(signal.id)}
        variant="secondaryDanger"
        icon={{ name: 'close' }}
        style={styles.cancelButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  signalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  signalMainInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  signalIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  signalDetails: {
    flex: 1,
  },
  signalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  signalSubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  signalRadius: {
    fontSize: 12,
    color: '#999',
  },
  notificationCount: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
    marginTop: 2,
  },
  signalStatus: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  messageContainer: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  messageText: {
    fontSize: 14,
    color: '#495057',
    fontStyle: 'italic',
  },
  crewTargetContainer: {
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
  responsesList: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
    marginBottom: 12,
  },
  responseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  responderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  responseIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  acceptedIndicator: {
    backgroundColor: '#4CAF50',
  },
  declinedIndicator: {
    backgroundColor: '#f44336',
  },
  responderDetails: {
    flex: 1,
  },
  responderName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  responseStatus: {
    fontSize: 12,
    color: '#666',
  },
  responseActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    minWidth: 36,
    height: 36,
  },
  emptyResponsesContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginBottom: 12,
  },
  noResponsesText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  cancelButton: {
    marginTop: 8,
  },
});

export default OutgoingSignalCard;
