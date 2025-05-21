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
          setSignalDetails(null); // Set to null explicitly
        } else {
          const signalData = signalSnap.data() as BatSignal;
          setSignalDetails(signalData);

          const senderIdToFetch = signalData.senderId || querySenderId;
          if (senderIdToFetch) {
            const senderRef = doc(firebase.firestore, 'users', senderIdToFetch);
            const senderSnap = await getDoc(senderRef);
            if (senderSnap.exists()) {
              setSenderProfile(senderSnap.data() as User);
            } else {
              console.warn("Sender profile not found for ID:", senderIdToFetch);
              setSenderProfile({ 
                uid: senderIdToFetch, 
                displayName: signalData.senderName || 'Unknown Sender', 
                photoURL: signalData.senderProfilePictureUrl, // This could be undefined if not on signalData
                email: '' // Required by User type
              });
            }
          } else {
             console.warn("No sender ID available to fetch profile.");
             setSenderProfile({ 
                uid: 'unknown', 
                displayName: signalData.senderName || 'Unknown Sender', // Fallback to signalData if possible
                photoURL: signalData.senderProfilePictureUrl, // Fallback to signalData if possible
                email: ''
              });
          }
        }
        // Initial fetch of acceptance status is good, listener will keep it updated.
        // const acceptanceRef = doc(firebase.firestore, 'batSignalAcceptances', `${querySignalId}_${currentUser.uid}`);
        // const acceptanceSnap = await getDoc(acceptanceRef);
        // if (acceptanceSnap.exists()) {
        //   setAcceptanceStatus(acceptanceSnap.data().status as BatSignalAcceptance['status']);
        // }

      } catch (error: any) {
        console.error("Error fetching Bat Signal data:", error);
        Toast.show({ type: 'error', text1: 'Error', text2: error.message || 'Could not load signal details.' });
        setSignalDetails(null); // Ensure state is null on error
        setSenderProfile(null);
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
      if (signalDetails.expiresAt && signalDetails.expiresAt.toDate() < new Date()) {
        Toast.show({ type: 'info', text1: 'Signal Expired', text2: 'This Bat Signal has already expired.' });
        setAcceptanceStatus('ignored');
        return; 
      }

      await respondToBatSignal(querySignalId, 'accepted'); 
      // No need to setAcceptanceStatus here, listener will update it.
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
      await respondToBatSignal(querySignalId, 'declined'); 
      // No need to setAcceptanceStatus here, listener will update it.
      Toast.show({ type: 'info', text1: 'Signal Declined' });
      // Navigation will be handled by the listener if status changes, or user can dismiss
      // setTimeout(() => {
      //   if(router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard');
      // }, 1500); // Keep timeout for now, but listener is better
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
        <CustomButton title="Dismiss" onPress={() => {if(router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard')}} style={styles.buttonSpacing} />
      </View>
    );
  }
  
  const displayName = senderProfile?.displayName || signalDetails.senderName || "Someone";
  const profilePicUrl = senderProfile?.photoURL || signalDetails.senderProfilePictureUrl;

  const handleGrantConsent = async () => {
    if (!currentUser || !querySignalId || !signalDetails?.senderId) { 
        Toast.show({ type: 'error', text1: 'Error', text2: 'Cannot grant consent, critical info missing.' });
        return;
    }
    setIsProcessingConsent(true);
    try {
      const acceptanceRef = doc(firebase.firestore, 'batSignalAcceptances', `${querySignalId}_${currentUser.uid}`);
      const X_DURATION_SECONDS = 1 * 60 * 60; // 1 hour from now
      const sharingExpiresAt = Timestamp.fromDate(new Date(Date.now() + X_DURATION_SECONDS * 1000));
      
      await setDoc(acceptanceRef, {
        recipientConsentedShare: serverTimestamp(), 
        sharingExpiresAt: sharingExpiresAt, 
        senderId: signalDetails.senderId, // Ensure senderId is in acceptance doc
        recipientId: currentUser.uid, // Ensure recipientId is in acceptance doc
        signalId: querySignalId, // Ensure signalId is in acceptance doc
        // status: 'accepted' should already be set by respondToBatSignal, but merge ensures it.
      }, { merge: true });

      setConsentModalVisible(false); 
      Toast.show({ type: 'info', text1: 'Consent Granted', text2: `Waiting for ${displayName} to also consent.` });
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
    // If denying consent should also mean declining the signal, call handleDecline.
    // Current setup: Signal remains 'accepted', but no location sharing from this user.
    // To make "Deny & Cancel" also decline the signal if it was accepted:
    // if (acceptanceStatus === 'accepted') {
    //   await handleDecline();
    // }
  };

  // Firestore Listener for BatSignalAcceptance document changes
  useEffect(() => {
    if (!querySignalId || !currentUser?.uid) return;

    const acceptanceDocId = `${querySignalId}_${currentUser.uid}`;
    const acceptanceDocRef = doc(firebase.firestore, 'batSignalAcceptances', acceptanceDocId);
    let hasNavigated = false; 

    const unsubscribe = onSnapshot(acceptanceDocRef, (docSnap) => {
      if (hasNavigated) return;

      if (docSnap.exists()) {
        const acceptanceData = docSnap.data() as BatSignalAcceptance;
        
        // Update local acceptanceStatus if it differs from Firestore
        // This ensures UI reflects the true state, e.g., if declined via Cloud Function elsewhere
        if (acceptanceStatus !== acceptanceData.status) {
            setAcceptanceStatus(acceptanceData.status);
        }

        // Check for navigation conditions
        if (acceptanceData.status === 'accepted' && 
            acceptanceData.recipientConsentedShare && 
            acceptanceData.senderConsentedShare && 
            acceptanceData.sharingExpiresAt) {
          if (acceptanceData.sharingExpiresAt.toDate() > new Date()) {
            hasNavigated = true; 
            Toast.show({ type: 'success', text1: 'Mutual consent!', text2: 'Navigating to map...' });
            
            const otherUserId = acceptanceData.senderId; 
            router.replace({
              pathname: '/(main)/signal/LocationSharingScreen',
              params: {
                signalId: acceptanceData.signalId,
                currentUserUid: currentUser.uid, 
                otherUserUid: otherUserId,       
                sharingExpiresAt: acceptanceData.sharingExpiresAt.toMillis().toString(),
              },
            });
          } else { // Sharing expired case
            if (!hasNavigated) { 
                Toast.show({ type: 'error', text1: 'Sharing Expired', text2: 'Location sharing period has ended.' });
                // Don't navigate here if already on a different screen or if modal is up.
                // Let user dismiss naturally if they are on this screen.
            }
          }
        } else if (acceptanceData.status === 'declined' && !consentModalVisible) {
            // If the status becomes 'declined' (e.g. by sender cancelling or admin action)
            // and the consent modal isn't up (meaning user isn't in active flow of accepting)
            // then it might be appropriate to inform the user and potentially navigate back.
            // For now, the UI will just show "You have already responded: declined".
        }

      } else { // Acceptance document doesn't exist
        // This could mean it was declined and then deleted, or never created.
        // If current local status was 'accepted' or 'pending', this is a change.
        if (acceptanceStatus && acceptanceStatus !== 'declined') { 
            // setAcceptanceStatus(null); // Or 'ignored' or some other status
            // Toast.show({ type: 'info', text1: 'Signal Response Cleared', text2: 'Your previous response is no longer active.' });
        }
      }
    });

    return () => {
        unsubscribe();
        hasNavigated = false; 
    };
  }, [querySignalId, currentUser?.uid, router, acceptanceStatus]); // Add acceptanceStatus to re-evaluate if it changes locally


  // Main return logic
  if ((acceptanceStatus === 'accepted' && !consentModalVisible) || acceptanceStatus === 'declined') {
    // If accepted (and not in consent flow) OR declined, show final status.
    return (
      <View style={styles.centered}>
        <Ionicons
            name={acceptanceStatus === 'accepted' ? "checkmark-circle-outline" : "close-circle-outline"}
            size={60}
            color={acceptanceStatus === 'accepted' ? "green" : "red"}
        />
        <Text style={styles.infoText}>
            {acceptanceStatus === 'accepted' ? 'You have accepted. Waiting for sender if location not shared.' : 'You have declined this signal.'}
        </Text>
        <CustomButton title="Dismiss" onPress={() => {if(router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard')}} style={styles.buttonSpacing} />
      </View>
    );
  }
  
  // If still pending, or if 'accepted' AND consent modal is now visible:
  return (
    <View style={styles.container}>
      <Modal
        animationType="slide"
        transparent={true}
        visible={consentModalVisible}
        onRequestClose={() => {
          setConsentModalVisible(!consentModalVisible);
          // If user closes modal without choice, and status was 'accepted', it remains 'accepted' but without consent.
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
              title="Deny Consent" // Changed from "Deny & Cancel"
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

      {/* Show accept/decline buttons only if status is null (pending) and modal is not visible */}
      { !acceptanceStatus && !consentModalVisible && (
          <View style={styles.actionsContainer}>
            <CustomButton
              title="Accept & Share Location"
              onPress={handleAccept}
              disabled={isProcessingAccept || isProcessingDecline}
              isLoading={isProcessingAccept}
              icon={<Ionicons name="checkmark-outline" size={20} color="white" />}
              style={[styles.button, styles.acceptButton]}
              textStyle={styles.buttonText}
            />
            <CustomButton
              title="Decline Signal"
              onPress={handleDecline}
              disabled={isProcessingAccept || isProcessingDecline}
              isLoading={isProcessingDecline}
              icon={<Ionicons name="close-outline" size={20} color="white" />}
              style={[styles.button, styles.declineButton]}
              textStyle={styles.buttonText}
            />
          </View>
      )}
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
    justifyContent: 'space-around', 
    backgroundColor: '#f4f4f8',
  },
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
    backgroundColor: '#28a745', 
    width: '100%',
  },
  denyButton: {
    backgroundColor: '#dc3545', 
    marginTop: 10,
    width: '100%',
  },
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
  },
  button: {
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 15, 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CAF50', 
  },
  declineButton: {
    backgroundColor: '#f44336', 
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
