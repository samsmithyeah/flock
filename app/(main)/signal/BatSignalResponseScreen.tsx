// app/(main)/signal/BatSignalResponseScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Alert, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { doc, getDoc, setDoc, serverTimestamp, Timestamp, onSnapshot } from 'firebase/firestore';
import { firebase, respondToBatSignal } from '../../../firebase'; // Assuming this path is correct
import { BatSignal, BatSignalAcceptance } from '../../../types/BatSignal';
import { User } from '../../../types/User';
import CustomButton from '../../../components/CustomButton'; // Assuming path
import Toast from 'react-native-toast-message';
import { useUser } from '../../../context/UserContext'; // Assuming path
import { Ionicons } from '@expo/vector-icons';


export default function BatSignalResponseScreen() {
  const { signalId: querySignalId, senderIdFromNotification: querySenderId } = useLocalSearchParams<{ signalId: string, senderIdFromNotification: string }>();
  const { user: currentUser } = useUser();
  const navigation = useNavigation();

  const [signalDetails, setSignalDetails] = useState<BatSignal | null>(null);
  const [senderProfile, setSenderProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessingAccept, setIsProcessingAccept] = useState<boolean>(false);
  const [isProcessingDecline, setIsProcessingDecline] = useState<boolean>(false);
  const [acceptanceStatus, setAcceptanceStatus] = useState<BatSignalAcceptance['status'] | null>(null);
  const [consentModalVisible, setConsentModalVisible] = useState<boolean>(false);
  const [isProcessingConsent, setIsProcessingConsent] = useState<boolean>(false);


  useEffect(() => {
    if (navigation) {
        navigation.setOptions({ title: 'Incoming Signal' });
    }
}, [navigation]);

  useEffect(() => {
    const fetchSignalData = async () => {
      if (!querySignalId || !currentUser?.uid) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'Signal ID or user information is missing.' });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Fetch BatSignal document
        const signalRef = doc(firebase.firestore, 'batSignals', querySignalId);
        const signalSnap = await getDoc(signalRef);

        if (!signalSnap.exists()) {
          Toast.show({ type: 'error', text1: 'Signal Not Found', text2: 'This Bat Signal may have been cancelled or expired.' });
          setSignalDetails(null);
        } else {
          const signalData = signalSnap.data() as BatSignal;
          setSignalDetails(signalData);

          // Fetch Sender Profile
          const senderIdToFetch = signalData.senderId || querySenderId;
          if (senderIdToFetch) {
            const senderRef = doc(firebase.firestore, 'users', senderIdToFetch);
            const senderSnap = await getDoc(senderRef);
            if (senderSnap.exists()) {
              setSenderProfile(senderSnap.data() as User);
            } else {
              console.warn("Sender profile not found for ID:", senderIdToFetch);
              // Use denormalized data if available
              setSenderProfile({ 
                uid: senderIdToFetch, 
                displayName: signalData.senderName || 'Unknown Sender', 
                photoURL: signalData.senderProfilePictureUrl,
                email: '' // Required by User type, but not available here
              });
            }
          } else {
             console.warn("No sender ID available to fetch profile.");
             setSenderProfile({ 
                uid: 'unknown', 
                displayName: signalData.senderName || 'Unknown Sender', 
                photoURL: signalData.senderProfilePictureUrl,
                email: ''
              });
          }
        }

        // Fetch BatSignalAcceptance document
        const acceptanceRef = doc(firebase.firestore, 'batSignalAcceptances', `${querySignalId}_${currentUser.uid}`);
        const acceptanceSnap = await getDoc(acceptanceRef);
        if (acceptanceSnap.exists()) {
          setAcceptanceStatus(acceptanceSnap.data().status as BatSignalAcceptance['status']);
        }

      } catch (error: any) {
        console.error("Error fetching Bat Signal data:", error);
        Toast.show({ type: 'error', text1: 'Error', text2: error.message || 'Could not load signal details.' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSignalData();
  }, [querySignalId, currentUser?.uid, querySenderId]);

  const handleAccept = async () => {
    if (!currentUser || !signalDetails || !querySignalId) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Missing user or signal information.' });
      return;
    }
    setIsProcessingAccept(true);

    try {
      if (!querySignalId) throw new Error("Signal ID is missing");
      if (signalDetails?.expiresAt && signalDetails.expiresAt.toDate() < new Date()) {
        Toast.show({ type: 'info', text1: 'Signal Expired', text2: 'This Bat Signal has already expired.' });
        setAcceptanceStatus('ignored');
        setIsProcessingAccept(false);
        return;
      }

      // Call the Cloud Function first
      await respondToBatSignal(querySignalId, 'accepted');

      // If Cloud Function is successful, then proceed with local state updates
      // The BatSignalAcceptance document is now created/updated by the Cloud Function
      setAcceptanceStatus('accepted');
      Toast.show({ type: 'success', text1: 'Accepted!', text2: 'Please grant consent to share location.' });
      setConsentModalVisible(true);

    } catch (error: any) {
      console.error("Error accepting signal:", error);
      const errorMessage = error.message || 'Failed to accept signal. Please try again.';
      Toast.show({ type: 'error', text1: 'Acceptance Failed', text2: errorMessage });
    } finally {
      setIsProcessingAccept(false);
    }
  };

  const handleDecline = async () => {
    if (!currentUser || !querySignalId) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Missing user or signal information.' });
      return;
    }
    setIsProcessingDecline(true);

    try {
      // Call the Cloud Function
      await respondToBatSignal(querySignalId, 'declined');
      
      // If Cloud Function is successful
      setAcceptanceStatus('declined');
      Toast.show({ type: 'info', text1: 'Signal Declined' });
      setTimeout(() => {
        if(router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard');
      }, 1500);

    } catch (error: any) {
      console.error("Error declining signal:", error);
      const errorMessage = error.message || 'Failed to decline signal. Please try again.';
      Toast.show({ type: 'error', text1: 'Decline Failed', text2: errorMessage });
    } finally {
      setIsProcessingDecline(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading Signal...</Text>
      </View>
    );
  }

  if (!signalDetails) {
    return (
      <View style={styles.centered}>
        <Ionicons name="sad-outline" size={60} color="gray" />
        <Text style={styles.infoText}>Signal not found or no longer available.</Text>
        <CustomButton title="Dismiss" onPress={() => router.goBack()} style={styles.buttonSpacing} />
      </View>
    );
  }
  
  const displayName = senderProfile?.displayName || signalDetails.senderName || "Someone";
  const profilePicUrl = senderProfile?.photoURL || signalDetails.senderProfilePictureUrl;

  const handleGrantConsent = async () => {
    if (!currentUser || !querySignalId) return;
    setIsProcessingConsent(true);
    try {
      const acceptanceRef = doc(firebase.firestore, 'batSignalAcceptances', `${querySignalId}_${currentUser.uid}`);
      const X_DURATION_SECONDS = 1 * 60 * 60; // 1 hour from now
      const sharingExpiresAt = Timestamp.fromDate(new Date(Date.now() + X_DURATION_SECONDS * 1000));
      
      await setDoc(acceptanceRef, {
        recipientConsentedShare: serverTimestamp(), // Recipient grants consent now
        sharingExpiresAt: sharingExpiresAt, // Set definitive expiry time
      }, { merge: true });

      setConsentModalVisible(false); // Close modal on success
      Toast.show({ type: 'info', text1: 'Consent Granted', text2: `Waiting for ${displayName} to also consent.` });
      // Firestore listener will be set up by the useEffect hook to watch for sender's consent
      // and navigate if mutual consent is achieved.
    } catch (error: any) {
      console.error("Error granting consent:", error);
      Toast.show({ type: 'error', text1: 'Consent Failed', text2: error.message });
    } finally {
      setIsProcessingConsent(false);
    }
  };

  const handleDenyConsent = async () => {
    setConsentModalVisible(false);
    Toast.show({ type: 'info', text1: 'Consent Denied', text2: 'Location sharing not initiated. You can decline the signal if you wish.' });
    // To fully cancel, the user would need to decline the signal explicitly
    // This is because they already accepted the signal. Denying consent only stops location sharing part.
    // No longer calling respondToBatSignal here as the initial acceptance stands.
    // If we wanted "Deny Consent" to also mean "Decline Signal", we'd call:
    // await handleDecline(); 
  };

  // Firestore Listener for Mutual Consent AND for initial acceptance status
  useEffect(() => {
    if (!querySignalId || !currentUser?.uid) return;

    const acceptanceDocId = `${querySignalId}_${currentUser.uid}`;
    const acceptanceDocRef = doc(firebase.firestore, 'batSignalAcceptances', acceptanceDocId);

    const unsubscribe = onSnapshot(acceptanceDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const acceptanceData = docSnap.data() as BatSignalAcceptance;
        setAcceptanceStatus(acceptanceData.status); // Update local status from Firestore

        if (acceptanceData.status === 'accepted' && acceptanceData.recipientConsentedShare && acceptanceData.senderConsentedShare && acceptanceData.sharingExpiresAt) {
          if (acceptanceData.sharingExpiresAt.toDate() > new Date()) {
            Toast.show({ type: 'success', text1: 'Mutual consent!', text2: 'Navigating to map...' });
            const otherUserId = acceptanceData.senderId; // This is the BatSignal sender
            router.replace({
              pathname: '/(main)/signal/LocationSharingScreen',
              params: {
                signalId: acceptanceData.signalId,
                currentUserUid: currentUser.uid, // This is the recipient
                otherUserUid: otherUserId,       // This is the sender
                sharingExpiresAt: acceptanceData.sharingExpiresAt.toMillis().toString(),
              },
            });
            unsubscribe(); // Stop listening after navigation
          } else {
            Toast.show({ type: 'error', text1: 'Sharing Expired', text2: 'Location sharing period has ended.' });
            if (router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard');
            unsubscribe(); // Stop listening
          }
        }
      } else {
        // If the acceptance document doesn't exist, reset status (e.g., sender cancelled signal before recipient responded)
        // setAcceptanceStatus(null); // Or handle as appropriate
      }
    });

    return () => unsubscribe();
  }, [querySignalId, currentUser?.uid, router]); // Removed signalDetails from dependency array as it might not be stable


  // If already responded (and not currently in consent modal because that implies recent 'accepted' state)
  if ((acceptanceStatus === 'accepted' || acceptanceStatus === 'declined') && !consentModalVisible) {
    return (
      <View style={styles.centered}>
        <Ionicons
            name={acceptanceStatus === 'accepted' ? "checkmark-circle-outline" : "close-circle-outline"}
            size={60}
            color={acceptanceStatus === 'accepted' ? "green" : "red"}
        />
        <Text style={styles.infoText}>You have already responded: {acceptanceStatus}.</Text>
        <CustomButton title="Dismiss" onPress={() => router.goBack()} style={styles.buttonSpacing} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Modal
        animationType="slide"
        transparent={true}
        visible={consentModalVisible}
        onRequestClose={() => {
          // Alert.alert("Modal has been closed.");
          setConsentModalVisible(!consentModalVisible);
        }}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Share Location?</Text>
            <Text style={styles.modalText}>
              To connect, you need to share your live location with {displayName} for up to 1 hour.
            </Text>
            <CustomButton
              title="Grant Consent"
              onPress={handleGrantConsent}
              isLoading={isProcessingConsent}
              disabled={isProcessingConsent}
              style={[styles.button, styles.grantButton]}
              textStyle={styles.buttonText}
            />
            <CustomButton
              title="Deny & Cancel"
              onPress={handleDenyConsent}
              disabled={isProcessingConsent}
              style={[styles.button, styles.denyButton]}
              textStyle={styles.buttonText}
            />
          </View>
        </View>
      </Modal>

      <View style={styles.headerContainer}>
        {profilePicUrl ? (
          <Image source={{ uri: profilePicUrl }} style={styles.profilePic} />
        ) : (
          <Ionicons name="person-circle-outline" size={80} color="#ccc" style={styles.profilePicPlaceholder} />
        )}
        <Text style={styles.titleText}>{displayName}</Text>
        <Text style={styles.subtitleText}>is sending a Bat Signal!</Text>
        {signalDetails.message && <Text style={styles.messageText}>"{signalDetails.message}"</Text>}
      </View>

      <View style={styles.actionsContainer}>
        <CustomButton
          title="Accept & Share Location"
          onPress={handleAccept}
          disabled={isProcessingAccept || isProcessingDecline || acceptanceStatus === 'accepted'}
          isLoading={isProcessingAccept}
          icon={<Ionicons name="checkmark-outline" size={20} color="white" />}
          style={[styles.button, styles.acceptButton]}
          textStyle={styles.buttonText}
        />
        <CustomButton
          title="Decline Signal"
          onPress={handleDecline}
          disabled={isProcessingAccept || isProcessingDecline || acceptanceStatus === 'accepted'}
          isLoading={isProcessingDecline}
          icon={<Ionicons name="close-outline" size={20} color="white" />}
          style={[styles.button, styles.declineButton]}
          textStyle={styles.buttonText}
        />
      </View>
      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-around', // Distribute space
    backgroundColor: '#f4f4f8',
  },
  // Modal Styles
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)", // Dimmed background
  },
  modalView: {
    margin: 20,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 35,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
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
  grantButton: {
    backgroundColor: '#28a745', // Green
    width: '100%',
  },
  denyButton: {
    backgroundColor: '#dc3545', // Red
    marginTop: 10,
    width: '100%',
  },
  // End Modal Styles
  headerContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  profilePic: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#007AFF'
  },
  profilePicPlaceholder: {
    marginBottom: 15,
  },
  titleText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  subtitleText: {
    fontSize: 18,
    color: '#555',
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 15,
  },
  messageText: {
    fontSize: 16,
    fontStyle: 'italic',
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },
  actionsContainer: {
    // No specific styles needed if buttons handle their own margins
  },
  button: {
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 15, // Space between buttons
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CAF50', // Green
  },
  declineButton: {
    backgroundColor: '#f44336', // Red
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  infoText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: 'gray',
  },
  buttonSpacing: {
    marginTop: 20,
    width: '80%',
  }
});
