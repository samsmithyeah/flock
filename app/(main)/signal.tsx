import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  TextInput,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Icon from '@expo/vector-icons/MaterialIcons';
import { useUser } from '@/context/UserContext';
import { useCrews } from '@/context/CrewsContext';
import { useSignal } from '@/context/SignalContext';
import LoadingOverlay from '@/components/LoadingOverlay';

import ScreenTitle from '@/components/ScreenTitle';
import useglobalStyles from '@/styles/globalStyles';
import LocationSharingModal from '@/components/LocationSharingModal';


const SignalScreen: React.FC = () => {
  const { user } = useUser();
  const { crews } = useCrews();
  const globalStyles = useglobalStyles();
  const {
    currentLocation,
    activeSignals,
    receivedSignals,
    isLoading,
    locationPermissionGranted,
    requestLocationPermission,
    getCurrentLocation,
    sendSignal: sendSignalContext,
    respondToSignal: respondToSignalContext,
  } = useSignal();

  const [radius, setRadius] = useState<number>(1000); // meters
  const [targetType, setTargetType] = useState<'all' | 'crews' | 'contacts'>('all');
  const [selectedCrews, setSelectedCrews] = useState<string[]>([]);
  const [message, setMessage] = useState<string>('');
  const [selectedSignalForSharing, setSelectedSignalForSharing] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const handleLocationRequest = async () => {
    setLocationLoading(true);
    setLocationError(null);
    
    try {
      if (!locationPermissionGranted) {
        const granted = await requestLocationPermission();
        if (!granted) {
          setLocationError('Location permission is required to send signals');
          Alert.alert('Permission Required', 'Location permission is needed to send signals. Please enable it in Settings.');
          return;
        }
      }
      
      const location = await getCurrentLocation();
      if (!location) {
        setLocationError('Unable to get location. Try again or check simulator settings.');
      }
    } catch (error) {
      console.error('Location request failed:', error);
      setLocationError('Failed to get location. Please try again.');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSendSignal = async () => {
    if (!user || !currentLocation) {
      Alert.alert('Error', 'User or location not available');
      return;
    }

    if (targetType === 'crews' && selectedCrews.length === 0) {
      Alert.alert('Error', 'Please select at least one crew');
      return;
    }

    try {
      await sendSignalContext({
        message,
        radius,
        targetType,
        targetIds: targetType === 'crews' ? selectedCrews : [],
      });

      // Reset form
      setMessage('');
      setSelectedCrews([]);
    } catch (error) {
      console.error('Error sending signal:', error);
    }
  };

  const handleRespondToSignal = async (signalId: string, response: 'accept' | 'ignore') => {
    try {
      await respondToSignalContext(signalId, response);
    } catch (error) {
      console.error('Error responding to signal:', error);
    }
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const toggleCrewSelection = (crewId: string) => {
    setSelectedCrews(prev => 
      prev.includes(crewId) 
        ? prev.filter(id => id !== crewId)
        : [...prev, crewId]
    );
  };

  return (
    <>
      {isLoading && <LoadingOverlay />}
      <ScrollView style={[globalStyles.container, styles.container]}>
        <ScreenTitle title="Signal" />
        
        {/* Send Signal Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send a Signal</Text>
          <Text style={styles.description}>
            Let nearby friends know you want to meet up right now!
          </Text>

          {!currentLocation && (
            <>
              <TouchableOpacity 
                style={[styles.locationButton, locationLoading && styles.locationButtonDisabled]} 
                onPress={handleLocationRequest}
                disabled={locationLoading}
              >
                <Icon name="location-on" size={24} color="#fff" />
                <Text style={styles.locationButtonText}>
                  {locationLoading ? 'Getting Location...' : 'Enable Location'}
                </Text>
              </TouchableOpacity>
              
              {locationError && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{locationError}</Text>
                  <TouchableOpacity style={styles.retryButton} onPress={handleLocationRequest}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
              
              {__DEV__ && (
                <Text style={styles.devNote}>
                  📍 iOS Simulator: Set location via Device → Location → Custom Location
                </Text>
              )}
            </>
          )}

          {currentLocation && (
            <>
              {/* Radius Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Radius: {formatDistance(radius)}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={100}
                  maximumValue={5000}
                  value={radius}
                  onValueChange={setRadius}
                  step={100}
                  minimumTrackTintColor="#1e90ff"
                  maximumTrackTintColor="#ccc"
                />
              </View>

              {/* Target Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Who to notify:</Text>
                
                <TouchableOpacity 
                  style={[styles.optionButton, targetType === 'all' && styles.optionButtonActive]}
                  onPress={() => setTargetType('all')}
                >
                  <Text style={[styles.optionText, targetType === 'all' && styles.optionTextActive]}>
                    All Contacts
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.optionButton, targetType === 'crews' && styles.optionButtonActive]}
                  onPress={() => setTargetType('crews')}
                >
                  <Text style={[styles.optionText, targetType === 'crews' && styles.optionTextActive]}>
                    Specific Crews
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Crew Selection */}
              {targetType === 'crews' && (
                <View style={styles.crewSelection}>
                  {crews.map((crew) => (
                    <TouchableOpacity
                      key={crew.id}
                      style={styles.crewOption}
                      onPress={() => toggleCrewSelection(crew.id)}
                    >
                      <Text style={styles.crewName}>{crew.name}</Text>
                      <Switch
                        value={selectedCrews.includes(crew.id)}
                        onValueChange={() => toggleCrewSelection(crew.id)}
                        trackColor={{ false: '#ccc', true: '#1e90ff' }}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Message Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Message (optional):</Text>
                <TextInput
                  style={styles.textInput}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Add a message to your signal..."
                  maxLength={100}
                  multiline
                />
              </View>

              {/* Send Button */}
              <TouchableOpacity style={styles.sendButton} onPress={handleSendSignal}>
                <Icon name="send" size={24} color="#fff" />
                <Text style={styles.sendButtonText}>Send Signal</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Active Signals */}
        {activeSignals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Active Signals</Text>
            {activeSignals.map((signal) => (
              <View key={signal.id} style={styles.signalCard}>
                <Text style={styles.signalInfo}>
                  Sent {formatDistance(signal.radius)} radius • {signal.responses.length} responses
                </Text>
                {signal.responses.map((response, index) => (
                  <View key={index} style={styles.responseRow}>
                    <Text style={styles.responseText}>
                      {response.response === 'accept' ? '✅' : '❌'} Response {index + 1}
                    </Text>
                    {response.response === 'accept' && (
                      <TouchableOpacity
                        style={styles.viewLocationButton}
                        onPress={() => setSelectedSignalForSharing(signal.id)}
                      >
                        <Text style={styles.viewLocationText}>View Location</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Received Signals */}
        {receivedSignals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Signals Near You</Text>
            {receivedSignals.map((signal) => (
              <View key={signal.id} style={styles.signalCard}>
                <Text style={styles.signalSender}>Signal from nearby friend</Text>
                {signal.message && (
                  <Text style={styles.signalMessage}>{signal.message}</Text>
                )}
                <View style={styles.responseButtons}>
                  <TouchableOpacity
                    style={[styles.responseButton, styles.acceptButton]}
                    onPress={() => handleRespondToSignal(signal.id, 'accept')}
                  >
                    <Text style={styles.responseButtonText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.responseButton, styles.ignoreButton]}
                    onPress={() => handleRespondToSignal(signal.id, 'ignore')}
                  >
                    <Text style={styles.responseButtonText}>Ignore</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

    <LocationSharingModal
      visible={selectedSignalForSharing !== null}
      onClose={() => setSelectedSignalForSharing(null)}
      signalId={selectedSignalForSharing || ''}
      currentUserLocation={currentLocation || undefined}
    />
  </>
);
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e90ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  locationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  locationButtonDisabled: {
    opacity: 0.6,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 14,
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: '#f44336',
    padding: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  devNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  optionButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    marginBottom: 8,
    alignItems: 'center',
  },
  optionButtonActive: {
    backgroundColor: '#1e90ff',
    borderColor: '#1e90ff',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  crewSelection: {
    marginTop: 12,
  },
  crewOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginBottom: 8,
  },
  crewName: {
    fontSize: 16,
    color: '#333',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff6b6b',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  signalCard: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  signalInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  signalSender: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  signalMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
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
  viewLocationButton: {
    backgroundColor: '#1e90ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  viewLocationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  responseButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  responseButton: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  ignoreButton: {
    backgroundColor: '#f44336',
  },
  responseButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default SignalScreen;