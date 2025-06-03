import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Alert,
  Linking,
  TouchableOpacity,
} from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';
import { Location } from '@/types/Signal';
import * as ExpoLocation from 'expo-location';
import SpinLoader from './SpinLoader';
import CustomButton from './CustomButton';

interface LocationSharingModalProps {
  visible: boolean;
  onClose: () => void;
  signalId: string;
  currentUserLocation?: Location;
}

interface LocationSharingData {
  otherUserLocation: Location;
  otherUserId: string;
  otherUserName: string;
  expiresAt: Date;
}

const LocationSharingModal: React.FC<LocationSharingModalProps> = ({
  visible,
  onClose,
  signalId,
  currentUserLocation,
}) => {
  const [locationData, setLocationData] = useState<LocationSharingData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [locationAddress, setLocationAddress] = useState<string>('');

  useEffect(() => {
    if (visible && signalId) {
      fetchLocationData();
    } else if (!visible) {
      // Clear data when modal is closed
      setLocationData(null);
      setLocationAddress('');
    }
  }, [visible, signalId]);

  useEffect(() => {
    if (locationData?.expiresAt) {
      const interval = setInterval(updateTimeRemaining, 1000);
      return () => clearInterval(interval);
    }
  }, [locationData]);

  const fetchLocationAddress = async (location: Location) => {
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

        const formattedAddress =
          addressParts.length > 0
            ? addressParts.join(', ')
            : `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;

        setLocationAddress(formattedAddress);
      } else {
        setLocationAddress(
          `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
        );
      }
    } catch (error) {
      console.log('fetchLocationAddress: Failed to geocode location:', error);
      setLocationAddress(
        `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
      );
    }
  };

  const fetchLocationData = async () => {
    setIsLoading(true);
    try {
      const getLocationSharingCallable = httpsCallable(
        functions,
        'getLocationSharing',
      );
      const result = await getLocationSharingCallable({ signalId });

      const data = result.data as any;
      console.log('LocationSharingModal: Received data from Firebase:', data);

      if (data.success) {
        // Handle different timestamp formats from Firebase consistently
        let expiresAt: Date;
        if (data.data.expiresAt) {
          console.log(
            'LocationSharingModal: Processing expiresAt:',
            data.data.expiresAt,
          );

          if (
            data.data.expiresAt.toDate &&
            typeof data.data.expiresAt.toDate === 'function'
          ) {
            // Firebase Timestamp with toDate method
            expiresAt = data.data.expiresAt.toDate();
            console.log(
              'LocationSharingModal: Using toDate format, result:',
              expiresAt,
            );
          } else if (
            data.data.expiresAt._seconds ||
            data.data.expiresAt.seconds
          ) {
            // Firestore Timestamp format (with or without underscore)
            const seconds =
              data.data.expiresAt._seconds || data.data.expiresAt.seconds;
            expiresAt = new Date(seconds * 1000);
            console.log(
              'LocationSharingModal: Using seconds format, result:',
              expiresAt,
            );
          } else if (data.data.expiresAt instanceof Date) {
            // Already a Date object
            expiresAt = data.data.expiresAt;
            console.log(
              'LocationSharingModal: Already Date object, result:',
              expiresAt,
            );
          } else {
            // Regular Date string or number
            expiresAt = new Date(data.data.expiresAt);
            console.log(
              'LocationSharingModal: Using direct Date constructor, result:',
              expiresAt,
            );
          }
        } else {
          // Fallback: 30 minutes from now
          console.warn('No expiresAt timestamp found, using fallback');
          expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        }

        const locationData = {
          ...data.data,
          expiresAt,
        };

        setLocationData(locationData);

        // Fetch user-friendly address for the location
        fetchLocationAddress(locationData.otherUserLocation);
      } else {
        Alert.alert('Error', data.message);
        onClose();
      }
    } catch (error) {
      console.error('Error fetching location data:', error);
      Alert.alert('Error', 'Failed to load location sharing data');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const updateTimeRemaining = () => {
    if (!locationData?.expiresAt) {
      console.warn('LocationSharingModal: No expiresAt timestamp available');
      setTimeRemaining('Unknown');
      return;
    }

    // Ensure we have a valid Date object - use consistent timestamp handling
    let expiry: Date;
    if (
      locationData.expiresAt instanceof Date &&
      !isNaN(locationData.expiresAt.getTime())
    ) {
      expiry = locationData.expiresAt;
    } else {
      console.error(
        'LocationSharingModal: Invalid expiresAt timestamp:',
        locationData.expiresAt,
      );
      setTimeRemaining('Invalid time');
      return;
    }

    const now = new Date();
    const remaining = expiry.getTime() - now.getTime();

    if (remaining <= 0) {
      setTimeRemaining('Expired');
      return;
    }

    const totalMinutes = Math.floor(remaining / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      setTimeRemaining(`${hours}h ${minutes}m`);
    } else if (minutes > 0) {
      setTimeRemaining(`${minutes}m`);
    } else {
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
      setTimeRemaining(`${seconds}s`);
    }
  };

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const openDirections = () => {
    if (!locationData?.otherUserLocation) return;

    Alert.alert(
      'Open Google Maps',
      `This will open Google Maps to show directions to ${locationData.otherUserName}'s location.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Continue',
          style: 'default',
          onPress: () => {
            const { latitude, longitude } = locationData.otherUserLocation;
            const url = `https://maps.google.com/maps?daddr=${latitude},${longitude}`;

            Linking.canOpenURL(url).then((supported) => {
              if (supported) {
                Linking.openURL(url);
              } else {
                Alert.alert('Error', 'Unable to open maps');
              }
            });
          },
        },
      ],
    );
  };

  const distance =
    currentUserLocation && locationData?.otherUserLocation
      ? calculateDistance(
          currentUserLocation.latitude,
          currentUserLocation.longitude,
          locationData.otherUserLocation.latitude,
          locationData.otherUserLocation.longitude,
        )
      : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Location shared</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <SpinLoader text="Loading location data..." />
            </View>
          ) : locationData ? (
            <View style={styles.content}>
              <View style={styles.userInfo}>
                <Icon name="person-pin" size={32} color="#1e90ff" />
                <Text style={styles.userName}>
                  {locationData.otherUserName}
                </Text>
                <Text style={styles.statusText}>wants to meet up!</Text>
              </View>

              <View style={styles.locationDetails}>
                <View style={styles.detailRow}>
                  <Icon name="location-on" size={20} color="#ff6b6b" />
                  <Text style={styles.detailText}>
                    {locationAddress || 'Loading address...'}
                  </Text>
                </View>

                {distance && (
                  <View style={styles.detailRow}>
                    <Icon name="straighten" size={20} color="#4CAF50" />
                    <Text style={styles.detailText}>
                      {formatDistance(distance)} away
                    </Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Icon name="schedule" size={20} color="#FF9800" />
                  <Text style={styles.detailText}>
                    Expires in {timeRemaining}
                  </Text>
                </View>
              </View>

              <View style={styles.actions}>
                <CustomButton
                  title="Get directions"
                  onPress={openDirections}
                  variant="primary"
                  icon={{
                    name: 'map-outline',
                    size: 20,
                    color: '#fff',
                  }}
                  style={styles.directionsButton}
                />
              </View>

              <Text style={styles.disclaimer}>
                Location sharing will automatically expire in {timeRemaining}.
                Your location is only shared while this session is active.
              </Text>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>
                No location sharing data available
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#ff6b6b',
    textAlign: 'center',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  locationDetails: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  actions: {
    alignItems: 'center',
    marginBottom: 16,
  },
  directionsButton: {
    width: '100%',
  },
  disclaimer: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    lineHeight: 16,
  },
});

export default LocationSharingModal;
