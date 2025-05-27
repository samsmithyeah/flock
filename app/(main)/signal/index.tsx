import React, { useState, useEffect } from 'react';
import { View, ScrollView, Text, StyleSheet, Alert } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useSignal } from '@/context/SignalContext';
import { useUser } from '@/context/UserContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import ScreenTitle from '@/components/ScreenTitle';
import LocationSharingModal from '@/components/LocationSharingModal';
import BackgroundLocationCard from '@/components/BackgroundLocationCard';
import CustomButton from '@/components/CustomButton';
import ActionButton from '@/components/ActionButton';
import SignalCard from '@/components/SignalCard';
import EmptyState from '@/components/EmptyState';
import SharedLocationCard from '@/components/SharedLocationCard';
import { useGlobalStyles } from '@/styles/globalStyles';

const SignalScreen: React.FC = () => {
  const {
    currentLocation,
    activeSignals,
    receivedSignals,
    sharedLocations,
    isLoading,
    locationPermissionGranted,
    backgroundLocationPermissionGranted,
    backgroundLocationTrackingActive,
    requestLocationPermission,
    requestBackgroundLocationPermission,
    getCurrentLocation,
    startBackgroundLocationTracking,
    stopBackgroundLocationTracking,
    respondToSignal: respondToSignalContext,
    cancelSignal,
    cancelSharedLocation,
  } = useSignal();
  const { user } = useUser();
  const globalStyles = useGlobalStyles();

  const [selectedSignalForSharing, setSelectedSignalForSharing] = useState<
    string | null
  >(null);
  const [locationLoading, setLocationLoading] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Auto-enable location when background location is already granted
  useEffect(() => {
    if (
      backgroundLocationPermissionGranted &&
      !currentLocation &&
      !locationLoading
    ) {
      handleLocationRequest();
    }
  }, [backgroundLocationPermissionGranted, currentLocation, locationLoading]);

  const handleLocationRequest = async () => {
    setLocationLoading(true);
    setLocationError(null);

    try {
      if (!locationPermissionGranted) {
        const granted = await requestLocationPermission();
        if (!granted) {
          setLocationError('Location permission is required to send signals');
          Alert.alert(
            'Permission Required',
            'Location permission is needed to send signals. Please enable it in Settings.',
          );
          return;
        }
      }

      const location = await getCurrentLocation();
      if (!location) {
        setLocationError(
          'Unable to get location. Try again or check simulator settings.',
        );
      }
    } catch (error) {
      console.error('Location request failed:', error);
      setLocationError('Failed to get location. Please try again.');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleRespondToSignal = async (
    signalId: string,
    response: 'accept' | 'ignore',
  ) => {
    try {
      await respondToSignalContext(signalId, response);

      if (response === 'accept') {
        Toast.show({
          type: 'success',
          text1: 'Signal Accepted! 🎉',
          text2: 'Your location has been shared',
        });
      }
    } catch (error) {
      console.error('Error responding to signal:', error);
      Toast.show({
        type: 'error',
        text1: 'Response Failed',
        text2: 'Please try again',
      });
    }
  };

  const handleCancelSignal = async (signalId: string) => {
    Alert.alert(
      'Cancel Signal',
      'Are you sure you want to cancel this signal? This will also stop any active location sharing.',
      [
        {
          text: 'Keep Signal',
          style: 'cancel',
        },
        {
          text: 'Cancel Signal',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelSignal(signalId);

              // Also cancel any related location sharing sessions
              const relatedSharedLocations = sharedLocations.filter(
                (location) => location.signalId === signalId,
              );

              for (const sharedLocation of relatedSharedLocations) {
                try {
                  await cancelSharedLocation(sharedLocation.id);
                } catch (error) {
                  console.error(
                    'Error cancelling related shared location:',
                    error,
                  );
                }
              }

              Toast.show({
                type: 'success',
                text1: 'Signal Cancelled',
                text2: 'Your signal and location sharing have been stopped',
              });
            } catch (error) {
              console.error('Error cancelling signal:', error);
              Toast.show({
                type: 'error',
                text1: 'Cancel Failed',
                text2: 'Please try again',
              });
            }
          },
        },
      ],
    );
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const filterExpiredSignals = (signals: any[]) => {
    const now = new Date();
    return signals.filter((signal) => {
      if (!signal.expiresAt) return true; // Keep signals without expiration
      const expiresAt = signal.expiresAt.toDate
        ? signal.expiresAt.toDate()
        : new Date(signal.expiresAt);
      return expiresAt > now;
    });
  };

  // Filter expired signals from received signals
  const validReceivedSignals = filterExpiredSignals(receivedSignals);

  // Separate shared locations based on user role
  const incomingSharedLocations = sharedLocations.filter(
    (location) => user?.uid && location.responderId === user.uid,
  );

  const handleCancelSharedLocation = async (sharedLocationId: string) => {
    try {
      await cancelSharedLocation(sharedLocationId);
    } catch (error) {
      console.error('Error cancelling shared location:', error);
    }
  };

  return (
    <>
      {isLoading && <LoadingOverlay />}
      <View style={globalStyles.container}>
        <ScrollView>
          <ScreenTitle title="Signal" />

          {/* Send Signal Section */}
          <View style={styles.section}>
            <Text style={styles.description}>
              Let nearby friends know you want to meet up right now!
            </Text>
          </View>

          {/* Background Location Card */}
          <BackgroundLocationCard
            isPermissionGranted={backgroundLocationPermissionGranted}
            isTrackingActive={backgroundLocationTrackingActive}
            onRequestPermission={async () => {
              await requestBackgroundLocationPermission();
            }}
            onToggleTracking={async (enabled: boolean) => {
              if (enabled) {
                await startBackgroundLocationTracking();
              } else {
                await stopBackgroundLocationTracking();
              }
            }}
            isLoading={isLoading}
          />

          <View style={styles.section}>
            {!currentLocation && (
              <View style={styles.locationSection}>
                <EmptyState
                  icon="location-outline"
                  title="Location required"
                  description="Enable location access to send signals to nearby friends"
                  size="medium"
                />

                <CustomButton
                  title={
                    locationLoading ? 'Getting location...' : 'Enable location'
                  }
                  onPress={handleLocationRequest}
                  variant="primary"
                  icon={{
                    name: 'navigate-circle-outline',
                    size: 20,
                    color: '#fff',
                  }}
                  loading={locationLoading}
                  disabled={locationLoading}
                  style={styles.locationButton}
                />

                {locationError && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{locationError}</Text>
                    <CustomButton
                      title="Retry"
                      onPress={handleLocationRequest}
                      variant="danger"
                      style={styles.retryButton}
                    />
                  </View>
                )}
              </View>
            )}

            {currentLocation && (
              <View style={styles.locationSection}>
                <CustomButton
                  title="Send signal"
                  onPress={() => router.push('/signal/send')}
                  variant="primary"
                  icon={{ name: 'send', size: 20, color: '#fff' }}
                  style={styles.sendButton}
                />
              </View>
            )}
          </View>

          {/* Outgoing Signals */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Outgoing signals</Text>
            {activeSignals.length > 0 ? (
              <>
                <Text style={styles.description}>
                  Signals you've sent to nearby friends
                </Text>
                {activeSignals.map((signal) => (
                  <View key={signal.id} style={styles.signalCard}>
                    <View style={styles.signalHeader}>
                      <View style={styles.signalMainInfo}>
                        <Icon
                          name="radio-button-on"
                          size={20}
                          color="#4CAF50"
                          style={styles.signalIcon}
                        />
                        <View style={styles.signalDetails}>
                          <Text style={styles.signalTitle}>Signal Active</Text>
                          <Text style={styles.signalRadius}>
                            {formatDistance(signal.radius)} radius
                          </Text>
                        </View>
                        <View style={styles.signalStatus}>
                          <Text style={styles.statusText}>Live</Text>
                        </View>
                      </View>
                    </View>

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
                                  name={
                                    response.response === 'accept'
                                      ? 'check'
                                      : 'close'
                                  }
                                  size={12}
                                  color="#fff"
                                />
                              </View>
                              <View style={styles.responderDetails}>
                                <Text style={styles.responderName}>
                                  {response.responderName ||
                                    `User ${index + 1}`}
                                </Text>
                                <Text style={styles.responseStatus}>
                                  {response.response === 'accept'
                                    ? 'Accepted'
                                    : 'Declined'}
                                </Text>
                              </View>
                            </View>
                            {response.response === 'accept' && (
                              <View style={styles.responseActions}>
                                <ActionButton
                                  onPress={() =>
                                    setSelectedSignalForSharing(signal.id)
                                  }
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
                        <Icon name="schedule" size={24} color="#ccc" />
                        <Text style={styles.noResponsesText}>
                          Waiting for responses...
                        </Text>
                      </View>
                    )}

                    {/* Cancel Signal Button */}
                    <CustomButton
                      title="Cancel signal"
                      onPress={() => handleCancelSignal(signal.id)}
                      variant="danger"
                      icon={{ name: 'close', size: 16, color: '#fff' }}
                      style={styles.cancelButton}
                    />
                  </View>
                ))}
              </>
            ) : (
              <EmptyState
                icon="cellular-outline"
                title="No outgoing signals"
                description="Send a signal to let nearby friends know you want to meet up!"
                size="small"
              />
            )}
          </View>

          {/* Incoming Signals */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Incoming signals</Text>
            {validReceivedSignals.length > 0 ||
            incomingSharedLocations.length > 0 ? (
              <>
                <Text style={styles.description}>
                  Signals from friends and active location sharing sessions
                </Text>

                {/* Received Signals */}
                {validReceivedSignals.map((signal) => (
                  <SignalCard
                    key={signal.id}
                    signal={signal}
                    onAccept={() => handleRespondToSignal(signal.id, 'accept')}
                    onIgnore={() => handleRespondToSignal(signal.id, 'ignore')}
                    isLoading={isLoading}
                  />
                ))}

                {/* Incoming Shared Locations */}
                {incomingSharedLocations.map((sharedLocation) => (
                  <SharedLocationCard
                    key={sharedLocation.id}
                    sharedLocation={sharedLocation}
                    onCancel={handleCancelSharedLocation}
                    onViewLocation={(signalId) =>
                      setSelectedSignalForSharing(signalId)
                    }
                    onSendMessage={(otherUserId) =>
                      router.push({
                        pathname: '/chats/dm-chat',
                        params: { otherUserId },
                      })
                    }
                  />
                ))}
              </>
            ) : (
              <EmptyState
                icon="location-outline"
                title="No Incoming Signals"
                description="When friends send signals near your location or you accept signals, they'll appear here"
                size="small"
              />
            )}
          </View>

          <LocationSharingModal
            visible={selectedSignalForSharing !== null}
            onClose={() => setSelectedSignalForSharing(null)}
            signalId={selectedSignalForSharing || ''}
            currentUserLocation={currentLocation || undefined}
          />
        </ScrollView>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  locationButton: {
    marginVertical: 8,
  },
  locationSection: {
    alignItems: 'center',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  retryButton: {
    marginTop: 0,
  },
  sendButton: {
    marginTop: 16,
  },
  signalCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  signalMainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signalIcon: {
    marginRight: 12,
  },
  signalDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  signalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  signalRadius: {
    fontSize: 13,
    color: '#666',
  },
  signalStatus: {
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 50,
  },
  statusText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  responsesList: {
    marginBottom: 16,
  },
  responseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FAFBFC',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F0F0F0',
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
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  acceptedIndicator: {
    backgroundColor: '#4CAF50',
  },
  declinedIndicator: {
    backgroundColor: '#FF5252',
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
  emptyResponsesContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 16,
  },
  noResponsesText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  responseActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    marginTop: 12,
    backgroundColor: '#ff4757',
  },
});

export default SignalScreen;
