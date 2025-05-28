import React, { useState, useEffect } from 'react';
import { View, ScrollView, Text, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSignal } from '@/context/SignalContext';
import { useUser } from '@/context/UserContext';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';
import ScreenTitle from '@/components/ScreenTitle';
import LocationSharingModal from '@/components/LocationSharingModal';
import BackgroundLocationCard from '@/components/BackgroundLocationCard';
import CustomButton from '@/components/CustomButton';
import SignalCard from '@/components/SignalCard';
import OutgoingSignalCard from '@/components/OutgoingSignalCard';
import EmptyState from '@/components/EmptyState';
import SharedLocationCard from '@/components/SharedLocationCard';
import { useGlobalStyles } from '@/styles/globalStyles';
import * as ExpoLocation from 'expo-location';

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
    modifySignalResponse,
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
  const [signalAddresses, setSignalAddresses] = useState<{
    [key: string]: string;
  }>({});

  // Utility function to format location address
  const formatLocationAddress = async (location: any): Promise<string> => {
    try {
      const reverseGeocode = await ExpoLocation.reverseGeocodeAsync({
        latitude: location.latitude,
        longitude: location.longitude,
      });

      if (reverseGeocode && reverseGeocode.length > 0) {
        const address = reverseGeocode[0];
        const addressParts = [];

        // Use street number + street name combination if available
        if (address.streetNumber && address.street) {
          addressParts.push(`${address.streetNumber} ${address.street}`);
        } else if (address.street) {
          addressParts.push(address.street);
        } else if (address.name && !address.street) {
          // Only use name if street is not available to avoid duplication
          addressParts.push(address.name);
        }

        // Add city if different from street/name
        if (address.city) {
          addressParts.push(address.city);
        }

        return addressParts.length > 0
          ? addressParts.join(', ')
          : `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
      } else {
        return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
      }
    } catch (error) {
      console.log('Failed to geocode location:', error);
      return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
    }
  };

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

  // Cache signal addresses when signals change
  useEffect(() => {
    const cacheSignalAddresses = async () => {
      for (const signal of activeSignals) {
        if (signal.location && !signalAddresses[signal.id]) {
          try {
            const address = await formatLocationAddress(signal.location);
            setSignalAddresses((prev) => ({
              ...prev,
              [signal.id]: address,
            }));
          } catch (error) {
            console.error('Failed to geocode signal location:', error);
          }
        }
      }
    };

    if (activeSignals.length > 0) {
      cacheSignalAddresses();
    }
  }, [activeSignals]);

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

  // Filter expired signals from both received and active signals
  const validReceivedSignals = filterExpiredSignals(receivedSignals);
  const validActiveSignals = filterExpiredSignals(activeSignals);

  // Separate shared locations based on user role
  const incomingSharedLocations = sharedLocations.filter(
    (location) => user?.uid && location.responderId === user.uid,
  );

  const handleCancelSharedLocation = async (sharedLocationId: string) => {
    try {
      // Find the shared location to get the signalId
      const sharedLocation = sharedLocations.find(
        (sl) => sl.id === sharedLocationId,
      );
      if (sharedLocation) {
        // Use modifySignalResponse to cancel the response (revert to original signal state)
        await modifySignalResponse(sharedLocation.signalId, 'cancel');
      } else {
        // Fallback to just cancelling the shared location
        await cancelSharedLocation(sharedLocationId);
      }
    } catch (error) {
      console.error('Error cancelling shared location:', error);
    }
  };

  const handleDeclineSharedLocation = async (sharedLocationId: string) => {
    try {
      // Find the shared location to get the signalId
      const sharedLocation = sharedLocations.find(
        (sl) => sl.id === sharedLocationId,
      );
      if (sharedLocation) {
        // Use modifySignalResponse to decline the signal (mark as declined)
        await modifySignalResponse(sharedLocation.signalId, 'decline');
      } else {
        // Fallback to just cancelling the shared location
        await cancelSharedLocation(sharedLocationId);
        Toast.show({
          type: 'info',
          text1: 'Location Sharing Declined',
          text2: 'You have declined the location sharing request',
        });
      }
    } catch (error) {
      console.error('Error declining shared location:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to decline location sharing',
      });
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
            {validActiveSignals.length > 0 ? (
              <>
                <Text style={styles.description}>
                  Signals you've sent to nearby friends
                </Text>
                {validActiveSignals.map((signal) => (
                  <OutgoingSignalCard
                    key={signal.id}
                    signal={signal}
                    signalAddress={signalAddresses[signal.id]}
                    onCancel={handleCancelSignal}
                    onLocationShare={setSelectedSignalForSharing}
                    formatDistance={formatDistance}
                  />
                ))}
              </>
            ) : (
              <EmptyState
                icon="cellular-outline"
                title="No Outgoing Signals"
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
                    onSendMessage={() =>
                      router.push({
                        pathname: '/chats/dm-chat',
                        params: { otherUserId: signal.senderId },
                      })
                    }
                    isLoading={isLoading}
                  />
                ))}

                {/* Incoming Shared Locations */}
                {incomingSharedLocations.map((sharedLocation) => (
                  <SharedLocationCard
                    key={sharedLocation.id}
                    sharedLocation={sharedLocation}
                    onCancel={handleCancelSharedLocation}
                    onDecline={handleDeclineSharedLocation}
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
});

export default SignalScreen;
