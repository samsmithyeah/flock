import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Text,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useUser } from '@/context/UserContext';
import { useCrews } from '@/context/CrewsContext';
import { useSignal } from '@/context/SignalContext';
import { router, useNavigation, useLocalSearchParams } from 'expo-router';
import RadioButtonGroup from '@/components/RadioButtonGroup';
import CrewSelectorModal from '@/components/CrewSelectorModal';
import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from 'react-native-toast-message';

const formatDuration = (minutes: number): string => {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
};

const SendSignalScreen: React.FC = () => {
  const { user } = useUser();
  const { crews } = useCrews();
  const { currentLocation, sendSignal: sendSignalContext } = useSignal();
  const navigation = useNavigation();
  const { crewId } = useLocalSearchParams<{ crewId?: string }>();

  const [radius, setRadius] = useState<number>(2000);
  const [targetType, setTargetType] = useState<'all' | 'crews'>('all');
  const [selectedCrews, setSelectedCrews] = useState<string[]>([]);
  const [message, setMessage] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60); // Default 1 hour
  const [isLoading, setIsLoading] = useState(false);
  const [isCrewModalVisible, setIsCrewModalVisible] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSendSignal}
          disabled={
            isLoading ||
            !currentLocation ||
            (targetType === 'crews' && selectedCrews.length === 0)
          }
          accessibilityLabel="Send Signal"
          accessibilityHint="Send your signal to nearby friends"
        >
          <Text
            style={{
              color:
                isLoading ||
                !currentLocation ||
                (targetType === 'crews' && selectedCrews.length === 0)
                  ? '#999'
                  : '#1e90ff',
              fontSize: 16,
              fontWeight: 'bold',
            }}
          >
            Send
          </Text>
        </TouchableOpacity>
      ),
      headerLeft: () => (
        <TouchableOpacity
          onPress={handleCancel}
          accessibilityLabel="Cancel"
          accessibilityHint="Cancel sending signal and go back"
        >
          <Text style={{ color: '#1e90ff', fontSize: 16 }}>Cancel</Text>
        </TouchableOpacity>
      ),
      title: 'Send signal',
      presentation: 'modal',
    });
  }, [
    navigation,
    isLoading,
    currentLocation,
    targetType,
    selectedCrews,
    message,
    durationMinutes,
    radius,
  ]);

  // Redirect back if no location is available
  useEffect(() => {
    if (!currentLocation) {
      Alert.alert(
        'Location Required',
        'Location access is required to send signals. Please enable location from the main signal screen.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ],
      );
    }
  }, [currentLocation]);

  // Pre-select crew if crewId is provided in route params
  useEffect(() => {
    if (crewId && crews.length > 0) {
      // Check if the crew exists in the user's crews
      const crew = crews.find((c) => c.id === crewId);
      if (crew) {
        setTargetType('crews');
        setSelectedCrews([crewId]);
      }
    }
  }, [crewId, crews]);

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
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

    setIsLoading(true);

    try {
      await sendSignalContext({
        message: message.trim() || undefined,
        radius,
        targetType,
        targetIds: targetType === 'crews' ? selectedCrews : [],
        durationMinutes,
      });

      Toast.show({
        type: 'success',
        text1: 'Signal sent!',
        text2: `Friends within ${formatDistance(radius)} will be notified`,
      });

      router.back();
    } catch (error) {
      console.error('Error sending signal:', error);
      Toast.show({
        type: 'error',
        text1: 'Send Failed',
        text2: 'Unable to send signal. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (
      message.trim() ||
      targetType !== 'all' ||
      selectedCrews.length > 0 ||
      radius !== 1000 ||
      durationMinutes !== 120
    ) {
      Alert.alert(
        'Cancel Signal',
        'Are you sure you want to discard your signal?',
        [
          {
            text: 'Keep editing',
            style: 'cancel',
          },
          {
            text: 'Discard',
            onPress: () => router.back(),
          },
        ],
      );
    } else {
      router.back();
    }
  };

  const targetOptions = [
    {
      value: 'all' as const,
      label: 'All contacts',
      description: 'Send the signal to all contacts in range',
      icon: 'people' as const,
    },
    {
      value: 'crews' as const,
      label: 'Specific crews',
      description: 'Choose which crews to signal to',
      icon: 'person' as const,
    },
  ];

  return (
    <>
      {isLoading && <LoadingOverlay text="Sending signal..." />}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Range Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Radius</Text>
            <Text style={styles.sectionDescription}>
              How far should your signal reach?
            </Text>

            <View style={styles.rangeContainer}>
              <Text style={styles.rangeValue}>{formatDistance(radius)}</Text>
              <Slider
                style={styles.slider}
                minimumValue={100}
                maximumValue={10000}
                value={radius}
                onValueChange={setRadius}
                step={100}
                minimumTrackTintColor="#4CAF50"
                maximumTrackTintColor="#E0E0E0"
              />
              <View style={styles.rangeLabels}>
                <Text style={styles.rangeLabel}>100m</Text>
                <Text style={styles.rangeLabel}>10km</Text>
              </View>
            </View>
          </View>

          {/* Duration Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Duration</Text>
            <Text style={styles.sectionDescription}>
              How long should your signal stay active?
            </Text>

            <View style={styles.rangeContainer}>
              <Text style={styles.rangeValue}>
                {formatDuration(durationMinutes)}
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={30}
                maximumValue={480}
                value={durationMinutes}
                onValueChange={setDurationMinutes}
                step={30}
                minimumTrackTintColor="#4CAF50"
                maximumTrackTintColor="#E0E0E0"
              />
              <View style={styles.rangeLabels}>
                <Text style={styles.rangeLabel}>30m</Text>
                <Text style={styles.rangeLabel}>8h</Text>
              </View>
            </View>
          </View>

          {/* Target Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Who to signal</Text>
            <Text style={styles.sectionDescription}>
              Choose who should receive your signal
            </Text>

            <RadioButtonGroup
              options={targetOptions}
              selectedValue={targetType}
              onValueChange={(value) => setTargetType(value as 'all' | 'crews')}
            />
          </View>

          {/* Crew Selection */}
          {targetType === 'crews' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select crews</Text>
              <Text style={styles.sectionDescription}>
                Choose which crews to signal to
              </Text>

              <TouchableOpacity
                style={styles.crewSelectorButton}
                onPress={() => setIsCrewModalVisible(true)}
                accessibilityLabel="Select crews"
                accessibilityHint="Open crew selection modal"
              >
                <View style={styles.crewSelectorContent}>
                  <Ionicons name="people-outline" size={20} color="#1e90ff" />
                  <View style={styles.crewSelectorText}>
                    {selectedCrews.length === 0 ? (
                      <Text style={styles.crewSelectorPlaceholder}>
                        Tap to select crews
                      </Text>
                    ) : (
                      <>
                        <Text style={styles.crewSelectorLabel}>
                          {selectedCrews.length} crew
                          {selectedCrews.length !== 1 ? 's' : ''} selected
                        </Text>
                        <Text style={styles.crewSelectorNames}>
                          {crews
                            .filter((crew) => selectedCrews.includes(crew.id))
                            .map((crew) => crew.name)
                            .join(', ')}
                        </Text>
                      </>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Message Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Message (optional)</Text>
            <Text style={styles.sectionDescription}>
              Add a personal message to your signal
            </Text>

            <TextInput
              style={styles.messageInput}
              value={message}
              onChangeText={setMessage}
              placeholder="What's the plan?"
              placeholderTextColor="#999"
              multiline
              maxLength={200}
              textAlignVertical="top"
            />
            <Text style={styles.characterCount}>{message.length}/200</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Crew Selection Modal */}
      <CrewSelectorModal
        isVisible={isCrewModalVisible}
        onClose={() => setIsCrewModalVisible(false)}
        crews={crews}
        selectedCrewIds={selectedCrews}
        onToggleCrew={(crewId: string) => {
          setSelectedCrews((prev) =>
            prev.includes(crewId)
              ? prev.filter((id) => id !== crewId)
              : [...prev, crewId],
          );
        }}
        onConfirm={() => {
          // Modal will close automatically after confirm
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  rangeContainer: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  rangeValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4CAF50',
    textAlign: 'center',
    marginBottom: 12,
  },
  slider: {
    width: '100%',
    height: 32,
  },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  rangeLabel: {
    fontSize: 11,
    color: '#888',
  },
  messageInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 16,
    fontSize: 16,
    color: '#333',
    minHeight: 100,
    maxHeight: 150,
  },
  characterCount: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 8,
  },
  crewSelectorButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 16,
  },
  crewSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crewSelectorText: {
    flex: 1,
    marginLeft: 12,
  },
  crewSelectorPlaceholder: {
    fontSize: 16,
    color: '#999',
  },
  crewSelectorLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  crewSelectorNames: {
    fontSize: 14,
    color: '#666',
  },
});

export default SendSignalScreen;
