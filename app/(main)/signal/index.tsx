import React, { useState, useEffect } from 'react';
import { View, ScrollView, Text, StyleSheet, Alert } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useSignal } from '@/context/SignalContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import ScreenTitle from '@/components/ScreenTitle';
import LocationSharingModal from '@/components/LocationSharingModal';
import BackgroundLocationCard from '@/components/BackgroundLocationCard';
import LocationStatusBadge from '@/components/LocationStatusBadge';
import CustomButton from '@/components/CustomButton';
import SignalCard from '@/components/SignalCard';
import EmptyState from '@/components/EmptyState';
import SharedLocationCard from '@/components/SharedLocationCard';
import useGlobalStyles from '@/styles/globalStyles';

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
      "Are you sure you want to cancel this signal? People won't be able to respond to it anymore.",
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
              Toast.show({
                type: 'success',
                text1: 'Signal Cancelled',
                text2: 'Your signal has been cancelled',
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
      <ScrollView style={globalStyles.container}>
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
                title="Location Required"
                description="Enable location access to send signals to nearby friends"
                size="medium"
              />

              <CustomButton
                title={
                  locationLoading ? 'Getting Location...' : 'Enable Location'
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
                title="Send Signal"
                onPress={() => router.push('/signal/send')}
                variant="primary"
                icon={{ name: 'send', size: 20, color: '#fff' }}
                style={styles.sendButton}
              />
            </View>
          )}
        </View>

        {/* Active Signals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Active Signals</Text>
          {activeSignals.length > 0 ? (
            activeSignals.map((signal) => (
              <View key={signal.id} style={styles.signalCard}>
                <View style={styles.signalHeader}>
                  <Text style={styles.signalInfo}>
                    Sent {formatDistance(signal.radius)} radius
                  </Text>
                  <View style={styles.signalStatus}>
                    <Icon name="radio-button-on" size={16} color="#4CAF50" />
                    <Text style={styles.statusText}>Active</Text>
                  </View>
                </View>
                <Text style={styles.responseCount}>
                  {signal.responses.length} response
                  {signal.responses.length !== 1 ? 's' : ''}
                </Text>
                {signal.responses.map((response, index) => (
                  <View key={index} style={styles.responseRow}>
                    <Text style={styles.responseText}>
                      {response.response === 'accept' ? '✅' : '❌'}{' '}
                      {response.responderName || `Response ${index + 1}`}
                    </Text>
                    {response.response === 'accept' && (
                      <CustomButton
                        title="View Location"
                        onPress={() => setSelectedSignalForSharing(signal.id)}
                        variant="secondary"
                      />
                    )}
                  </View>
                ))}
                {signal.responses.length === 0 && (
                  <Text style={styles.noResponsesText}>
                    No responses yet...
                  </Text>
                )}

                {/* Cancel Signal Button */}
                <CustomButton
                  title="Cancel Signal"
                  onPress={() => handleCancelSignal(signal.id)}
                  variant="danger"
                  icon={{ name: 'close', size: 16, color: '#fff' }}
                  style={styles.cancelButton}
                />
              </View>
            ))
          ) : (
            <EmptyState
              icon="cellular-outline"
              title="No Active Signals"
              description="Send a signal to let nearby friends know you want to meet up!"
              size="small"
            />
          )}
        </View>

        {/* Received Signals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signals Near You</Text>
          {validReceivedSignals.length > 0 ? (
            <>
              <Text style={styles.description}>
                Friends nearby want to meet up right now!
              </Text>
              {validReceivedSignals.map((signal) => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  onAccept={() => handleRespondToSignal(signal.id, 'accept')}
                  onIgnore={() => handleRespondToSignal(signal.id, 'ignore')}
                  isLoading={isLoading}
                />
              ))}
            </>
          ) : (
            <EmptyState
              icon="location-outline"
              title="No Signals Nearby"
              description="When friends send signals near your location, they'll appear here"
              size="small"
            />
          )}
        </View>

        {/* Shared Locations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shared Locations</Text>
          {sharedLocations.length > 0 ? (
            <>
              <Text style={styles.description}>
                Active location sharing sessions - monitor or cancel anytime
              </Text>
              {sharedLocations.map((sharedLocation) => (
                <SharedLocationCard
                  key={sharedLocation.id}
                  sharedLocation={sharedLocation}
                  onCancel={handleCancelSharedLocation}
                />
              ))}
            </>
          ) : (
            <EmptyState
              icon="location-outline"
              title="No Active Location Sharing"
              description="When you accept signals, location sharing sessions will appear here"
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
    </>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingVertical: 16,
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
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  signalInfo: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  signalStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#4CAF50',
    marginLeft: 4,
    fontWeight: '600',
  },
  responseCount: {
    fontSize: 13,
    color: '#888',
    marginBottom: 8,
  },
  noResponsesText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  responseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  responseText: {
    fontSize: 12,
    color: '#888',
    flex: 1,
  },
  cancelButton: {
    marginTop: 12,
    backgroundColor: '#ff4757',
  },
});

export default SignalScreen;
