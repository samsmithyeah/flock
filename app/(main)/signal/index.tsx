// app/(main)/signal/index.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import * as Location from 'expo-location';
import { useUser } from '../../../context/UserContext'; // Assuming path
import { firebase, sendBatSignal, cancelBatSignal } from '../../../firebase'; // Actual function
import { GeoPoint, Timestamp, collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import CustomButton from '../../../components/CustomButton'; // Assuming path
import LoadingOverlay from '../../../components/LoadingOverlay'; // Assuming path
import Toast from 'react-native-toast-message';
import { BatSignalAcceptance } from '../../../types/BatSignal'; // Assuming path
import { router } from 'expo-router';


export default function SignalScreen() {
  const { user: currentUser } = useUser(); // Get current user, renamed to currentUser for clarity

  const [radiusMetres, setRadiusMetres] = useState<number>(1000);
  const [audienceType, setAudienceType] = useState<'all' | 'crews' | 'contacts'>('all');
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [signalSent, setSignalSent] = useState<boolean>(false);
  const [activeSignalId, setActiveSignalId] = useState<string | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  
  // New states for sender consent flow
  const [showSenderConsentModal, setShowSenderConsentModal] = useState<boolean>(false);
  const [consentingRecipient, setConsentingRecipient] = useState<{ id: string, name?: string } | null>(null);
  const [activeAcceptances, setActiveAcceptances] = useState<BatSignalAcceptance[]>([]);
  const [isProcessingSenderConsent, setIsProcessingSenderConsent] = useState<boolean>(false);


  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermissionStatus(status);
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to send a Bat Signal.');
        return;
      }
      try {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation(location);
      } catch (error) {
        console.error("Error fetching location: ", error);
        Alert.alert('Location Error', 'Failed to fetch current location.');
        Toast.show({ type: 'error', text1: 'Location Error', text2: 'Could not fetch your location.' });
      }
    })();
  }, []);

  const handleSendSignal = async () => {
    if (!userLocation) {
      Toast.show({ type: 'error', text1: 'Location Missing', text2: 'Cannot send signal without your location.' });
      return;
    }
    if (radiusMetres <= 0) {
      Toast.show({ type: 'error', text1: 'Invalid Radius', text2: 'Radius must be a positive number.' });
      return;
    }

    setIsSending(true);
    try {
      const result: any = await sendBatSignal({ // Using actual function
        senderLocation: new GeoPoint(userLocation.coords.latitude, userLocation.coords.longitude),
        radiusMetres: radiusMetres,
        targetAudienceType: audienceType,
        targetIds: audienceType === 'all' ? [] : selectedTargetIds,
        message: message, // message is now sent
      });

      if (result.data.success && result.data.signalId) {
        setSignalSent(true);
        setActiveSignalId(result.data.signalId);
        Toast.show({ type: 'success', text1: 'Signal Sent!', text2: 'Waiting for responses.' });
      } else {
        throw new Error(result.data.error || 'Failed to send signal');
      }
    } catch (error: any) {
      console.error("Error sending Bat Signal:", error);
      Toast.show({ type: 'error', text1: 'Signal Failed', text2: error.message || 'An unknown error occurred.' });
      setSignalSent(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleCancelSignal = async () => {
    if (!activeSignalId) return;
    setIsSending(true);
    try {
      // const result: any = await cancelBatSignal(activeSignalId); // Assuming cancelBatSignal exists
      // For now, simulate cancellation as the function is not defined in this subtask
      console.log("Simulating cancellation for signal:", activeSignalId);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setActiveSignalId(null);
      setSignalSent(false);
      setActiveAcceptances([]); // Clear acceptances
      setConsentingRecipient(null);
      setShowSenderConsentModal(false);
      Toast.show({ type: 'info', text1: 'Signal Cancelled' });
    } catch (error: any) {
      console.error("Error cancelling Bat Signal:", error);
      Toast.show({ type: 'error', text1: 'Cancellation Failed', text2: error.message });
    } finally {
      setIsSending(false);
    }
  };

  // Listen for acceptances
  useEffect(() => {
    if (!activeSignalId) {
      setActiveAcceptances([]); // Clear acceptances if signal is cancelled or not active
      return;
    }

    const q = query(
      collection(firebase.firestore, 'batSignalAcceptances'),
      where('signalId', '==', activeSignalId),
      where('status', '==', 'accepted')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newAcceptances: BatSignalAcceptance[] = [];
      let foundRecipientRequiringConsent = false;

      snapshot.forEach(doc => {
        const acceptance = doc.data() as BatSignalAcceptance;
        acceptance.id = doc.id; // Store doc ID
        newAcceptances.push(acceptance);

        // Check for mutual consent leading to navigation
        if (acceptance.recipientConsentedShare && acceptance.senderConsentedShare && acceptance.sharingExpiresAt && acceptance.sharingExpiresAt.toDate() > new Date()) {
          console.log(`Mutual consent with ${acceptance.recipientId}. Navigating...`);
          Toast.show({ type: 'success', text1: 'Mutual Consent!', text2: `Connecting with ${acceptance.recipientName || 'user'}...` });
          router.replace({
            pathname: '/(main)/signal/LocationSharingScreen',
            params: {
              signalId: activeSignalId,
              currentUserUid: currentUser!.uid, // Sender is current user
              otherUserUid: acceptance.recipientId,
              sharingExpiresAt: acceptance.sharingExpiresAt.toMillis().toString(),
            },
          });
          // Potentially reset state after navigation or handle multiple navigations carefully
          // For now, first one to get mutual consent wins for the sender.
          // Consider unsubscribing or managing state to prevent multiple navigation attempts.
          return; // Exit after initiating navigation for one.
        }
        
        // If we are not already showing a consent modal and this recipient needs sender consent
        if (!showSenderConsentModal && !foundRecipientRequiringConsent && acceptance.recipientConsentedShare && !acceptance.senderConsentedShare) {
            if (acceptance.sharingExpiresAt && acceptance.sharingExpiresAt.toDate() > new Date()) {
                setConsentingRecipient({ id: acceptance.recipientId, name: acceptance.recipientName || 'A User' });
                setShowSenderConsentModal(true);
                foundRecipientRequiringConsent = true; // Prioritize one modal at a time
            } else {
                 console.log("Recipient consent found but sharing already expired for", acceptance.recipientId);
            }
        }
      });
      setActiveAcceptances(newAcceptances);
    });

    return () => unsubscribe();
  }, [activeSignalId, showSenderConsentModal, currentUser]); // Added showSenderConsentModal to dependencies


  const handleSenderGrantConsent = async () => {
    if (!activeSignalId || !consentingRecipient || !currentUser) return;
    setIsProcessingSenderConsent(true);
    try {
      const acceptanceDocRef = doc(firebase.firestore, 'batSignalAcceptances', `${activeSignalId}_${consentingRecipient.id}`);
      const acceptanceDocSnap = await firebase.firestore.getDoc(acceptanceDocRef); // Use getDoc from firebase.firestore namespace
      
      if (!acceptanceDocSnap.exists()) {
          throw new Error("Acceptance document not found.");
      }
      const acceptanceData = acceptanceDocSnap.data() as BatSignalAcceptance;

      // Ensure recipient has consented and sharing is not expired
      if (!acceptanceData.recipientConsentedShare) {
          throw new Error("Recipient has not consented yet.");
      }
      if (!acceptanceData.sharingExpiresAt || acceptanceData.sharingExpiresAt.toDate() < new Date()) {
          throw new Error("Sharing session has expired or expiry not set by recipient.");
      }

      await setDoc(acceptanceDocRef, {
        senderConsentedShare: serverTimestamp(),
        // sharingExpiresAt is already set by recipient, no need to update unless logic changes
      }, { merge: true });

      Toast.show({ type: 'success', text1: 'Consent Granted!', text2: `Location sharing with ${consentingRecipient.name} can now begin.`});
      // The useEffect listener for acceptances should pick this up and navigate.
    } catch (error: any) {
      console.error("Error granting sender consent:", error);
      Toast.show({ type: 'error', text1: 'Consent Failed', text2: error.message });
    } finally {
      setShowSenderConsentModal(false);
      setConsentingRecipient(null);
      setIsProcessingSenderConsent(false);
    }
  };

  const handleSenderDenyConsent = () => {
    // Optionally, update Firestore if needed, e.g. to mark senderDeniedConsent: true
    // For now, just closing the modal.
    Toast.show({ type: 'info', text1: 'Consent Denied', text2: `You have not shared your location with ${consentingRecipient?.name}.` });
    setShowSenderConsentModal(false);
    setConsentingRecipient(null);
  };
    
  const renderAudienceSpecificSelector = () => {
    if (audienceType === 'crews' || audienceType === 'contacts') {
      return (
        <CustomButton
          title={`Select ${audienceType === 'crews' ? 'Crews' : 'Contacts'}`}
          onPress={() => Alert.alert("Not Implemented", "Crew/Contact selection will be here.")}
          style={styles.selectButton}
          textStyle={styles.selectButtonText}
        />
      );
    }
    return null;
  };


  if (locationPermissionStatus === null) {
    return (
      <View style={styles.container}>
        <Text>Requesting location permission...</Text>
      </View>
    );
  }
  
  if (locationPermissionStatus !== 'granted') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Location permission denied. Please enable it in settings to use Bat Signal.</Text>
        <Button title="Open Settings" onPress={() => { /* TODO: Link to app settings */ Alert.alert("TODO", "Link to app settings"); }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LoadingOverlay visible={isSending || isProcessingSenderConsent} />
      <Text style={styles.title}>Bat Signal</Text>

      {/* Sender Consent Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showSenderConsentModal}
        onRequestClose={() => {
          setShowSenderConsentModal(false);
          setConsentingRecipient(null);
        }}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Share Location?</Text>
            <Text style={styles.modalText}>
              Share your live location with {consentingRecipient?.name || 'this user'} to connect? This will use your live location for up to 1 hour or until the signal expires/is cancelled.
            </Text>
            <CustomButton
              title="Grant Consent"
              onPress={handleSenderGrantConsent}
              isLoading={isProcessingSenderConsent}
              disabled={isProcessingSenderConsent}
              style={[styles.button, styles.grantButton]}
            />
            <CustomButton
              title="Deny"
              onPress={handleSenderDenyConsent}
              disabled={isProcessingSenderConsent}
              style={[styles.button, styles.denyButton]}
            />
          </View>
        </View>
      </Modal>

      {!signalSent ? (
        <>
          {/* ... (rest of the form for sending signal - no changes from previous) ... */}
          <View style={styles.settingRow}>
            <Text style={styles.label}>Radius (meters):</Text>
            <TextInput
              style={styles.radiusInput}
              value={String(radiusMetres)}
              onChangeText={(text) => setRadiusMetres(Number(text))}
              keyboardType="numeric"
              editable={!isSending}
            />
          </View>
          <View style={styles.buttonGroup}>
            {[500, 1000, 5000].map((r) => (
                <CustomButton
                    key={r}
                    title={`${r / 1000}km`}
                    onPress={() => setRadiusMetres(r)}
                    style={[styles.radiusButton, radiusMetres === r && styles.radiusButtonSelected]}
                    textStyle={[styles.radiusButtonText, radiusMetres === r && styles.radiusButtonTextSelected]}
                    disabled={isSending}
                />
            ))}
          </View>


          <Text style={styles.label}>Audience:</Text>
          <SegmentedControl
            values={['All', 'Crews', 'Contacts']}
            selectedIndex={['all', 'crews', 'contacts'].indexOf(audienceType)}
            onChange={(event) => {
              setAudienceType(['all', 'crews', 'contacts'][event.nativeEvent.selectedSegmentIndex] as 'all' | 'crews' | 'contacts');
              setSelectedTargetIds([]); 
            }}
            enabled={!isSending}
            style={styles.segmentedControl}
          />
          {renderAudienceSpecificSelector()}
          
          <Text style={styles.label}>Optional Message:</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Friendly wave, need help, etc."
            value={message}
            onChangeText={setMessage}
            editable={!isSending}
            multiline
          />

          <CustomButton
            title="Send Signal"
            onPress={handleSendSignal}
            disabled={isSending || locationPermissionStatus !== 'granted' || !userLocation}
            icon={<Ionicons name="pulse-outline" size={20} color="white" />}
            style={styles.sendButton}
          />
        </>
      ) : (
        <View style={styles.signalActiveContainer}>
          <Ionicons name="checkmark-circle-outline" size={80} color="green" />
          <Text style={styles.signalActiveText}>Signal active!</Text>
          <Text style={styles.signalActiveSubText}>ID: {activeSignalId}</Text>
          <Text style={styles.signalActiveSubText}>Waiting for responses...</Text>
          {/* Display list of active acceptances - optional */}
          {activeAcceptances.length > 0 && (
            <View style={styles.acceptancesList}>
              <Text style={styles.acceptancesTitle}>Accepted By:</Text>
              {activeAcceptances.map(acc => (
                <Text key={acc.id} style={styles.acceptanceItem}>
                  {acc.recipientName || acc.recipientId}{' '}
                  {acc.recipientConsentedShare ? '(Consented)' : '(Awaiting their consent)'}
                  {acc.senderConsentedShare && acc.recipientConsentedShare && ' (Sharing!)'}
                </Text>
              ))}
            </View>
          )}
          <CustomButton
            title="Cancel Signal"
            onPress={handleCancelSignal}
            disabled={isSending}
            style={styles.cancelButton}
            icon={<Ionicons name="close-circle-outline" size={20} color="white" />}
          />
        </View>
      )}

      <Text style={styles.statusText}>
        {!userLocation && locationPermissionStatus === 'granted' && <Text style={styles.errorText}>Fetching location...</Text>}
      </Text>
      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  // Modal Styles (copied from BatSignalResponseScreen, adjust if needed)
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalView: {
    margin: 20,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 35,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalText: {
    marginBottom: 20,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
  },
  button: { // General button style for modal
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center'
  },
  grantButton: { // Specific for grant consent
    backgroundColor: '#28a745', // Green
    marginBottom:10,
  },
  denyButton: { // Specific for deny consent
    backgroundColor: '#dc3545', // Red
  },
  // End Modal Styles
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#444',
    marginBottom: 8,
    marginTop: 10,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  radiusInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 16,
    minWidth: 100,
    textAlign: 'right',
  },
   buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  radiusButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  radiusButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#0056b3',
  },
  radiusButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  radiusButtonTextSelected: {
    color: 'white',
  },
  segmentedControl: {
    marginBottom: 20,
    height: Platform.OS === 'ios' ? 40 : 50, // Adjust height for better touch target
  },
  selectButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  selectButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    minHeight: Platform.OS === 'ios' ? 80 : 60, // Adjust height for multiline
    fontSize: 16,
    textAlignVertical: 'top',
  },
  sendButton: {
    backgroundColor: '#4CAF50', // Green
    padding: 15,
  },
  cancelButton: {
    backgroundColor: '#f44336', // Red
    marginTop: 20,
    padding: 15,
  },
  statusText: {
    marginTop: 16,
    textAlign: 'center',
    color: 'gray',
    fontSize: 14,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 16,
  },
  signalActiveContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  signalActiveText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'green',
    marginTop: 10,
    marginBottom: 5,
  },
  signalActiveSubText: {
    fontSize: 16,
    color: 'gray',
    marginBottom: 5,
  },
  acceptancesList: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 5,
    width: '90%',
  },
  acceptancesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  acceptanceItem: {
    fontSize: 14,
    color: '#333',
    paddingVertical: 2,
  }
});
