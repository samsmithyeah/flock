// app/(main)/signal/LocationSharingScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { doc, onSnapshot, Timestamp, getDoc, updateDoc } from 'firebase/firestore';
import { firebase } from '../../../firebase'; // Assuming path
import { User } from '../../../types/User';
import { GeoPoint } from 'firebase/firestore';
import Toast from 'react-native-toast-message';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import CustomButton from '../../../components/CustomButton';
import { Ionicons } from '@expo/vector-icons';

const LOCATION_UPDATE_INTERVAL = 5000; // 5 seconds
const LOCATION_UPDATE_DISTANCE_INTERVAL = 10; // 10 meters

export default function LocationSharingScreen() {
  const params = useLocalSearchParams<{
    signalId: string;
    currentUserUid: string;
    otherUserUid: string;
    sharingExpiresAt: string; // Passed as string (milliseconds)
  }>();
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);

  const [currentUserMapLocation, setCurrentUserMapLocation] = useState<{ latitude: number, longitude: number } | null>(null);
  const [otherUserMapLocation, setOtherUserMapLocation] = useState<{ latitude: number, longitude: number } | null>(null);
  const [sharingActuallyExpiresAt, setSharingActuallyExpiresAt] = useState<Date | null>(null);
  const [otherUserName, setOtherUserName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initialRegionSet, setInitialRegionSet] = useState(false);

  let locationSubscription: Location.LocationSubscription | null = null;
  let otherUserLocationUnsubscribe: (() => void) | null = null;
  let expiryTimeoutId: NodeJS.Timeout | null = null;
  const [acceptanceDocId, setAcceptanceDocId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: 'Live Location' });

    const { signalId, currentUserUid, otherUserUid, sharingExpiresAt: expiresAtParam } = params;

    // Determine BatSignalAcceptance document ID
    if (signalId) {
      const signalRef = doc(firebase.firestore, 'batSignals', signalId);
      getDoc(signalRef).then(signalSnap => {
        if (signalSnap.exists()) {
          const signalData = signalSnap.data();
          if (signalData?.senderId === currentUserUid) { // Current user is the sender of the signal
            setAcceptanceDocId(`${signalId}_${otherUserUid}`);
          } else { // Current user is the recipient of the signal
            setAcceptanceDocId(`${signalId}_${currentUserUid}`);
          }
        } else {
          console.error("Signal document not found to determine acceptance ID");
          setError("Signal details missing, cannot manage session.");
        }
      }).catch(e => {
        console.error("Error fetching signal for acceptance ID:", e);
        setError("Error verifying session details.");
      });
    }

    // Fetch other user's name
    if (otherUserUid) {
      const userRef = doc(firebase.firestore, 'users', otherUserUid);
      getDoc(userRef).then(docSnap => {
        if (docSnap.exists()) {
          setOtherUserName(docSnap.data()?.displayName || 'User');
        } else {
          setOtherUserName('Unknown User');
        }
      }).catch(err => {
        console.error("Error fetching other user's name:", err);
        setOtherUserName('User');
      });
    }

    // Handle expiry
    if (expiresAtParam) {
      const expiryTimestamp = parseInt(expiresAtParam, 10);
      if (isNaN(expiryTimestamp)) {
        setError('Invalid expiry time provided.');
        setIsLoading(false);
        Toast.show({ type: 'error', text1: 'Error', text2: 'Invalid session duration.' });
        if (router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard');
        return;
      }
      const expiryDate = new Date(expiryTimestamp);
      if (expiryDate <= new Date()) {
        Toast.show({ type: 'error', text1: 'Sharing Expired', text2: 'This session has already expired.' });
        setError('This session has already expired.');
        setIsLoading(false);
        if (router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard');
        return;
      }
      setSharingActuallyExpiresAt(expiryDate);
      
      expiryTimeoutId = setTimeout(() => {
        Toast.show({ type: 'info', text1: 'Session Ended', text2: 'Location sharing time has expired.' });
        if (router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard');
      }, expiryDate.getTime() - Date.now());
    } else {
      setError('Expiry time not provided.');
      setIsLoading(false);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Session duration not specified.' });
      if (router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard');
      return;
    }

    // Start self location updates
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied for self.');
        Toast.show({ type: 'error', text1: 'Permission Denied', text2: 'Location permission is required.' });
        setIsLoading(false);
        return;
      }

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: LOCATION_UPDATE_INTERVAL,
          distanceInterval: LOCATION_UPDATE_DISTANCE_INTERVAL,
        },
        async (location) => {
          const newMapLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          setCurrentUserMapLocation(newMapLocation);

          try {
            const userDocRef = doc(firebase.firestore, 'users', currentUserUid);
            await updateDoc(userDocRef, {
              liveLocation: new GeoPoint(location.coords.latitude, location.coords.longitude),
              lastKnownLocationTimestamp: Timestamp.now(), // Also update this for recency checks
            });
          } catch (e) {
            console.error("Error updating self location to Firestore:", e);
          }
        }
      );
    })();

    // Listen for other user's location
    const otherUserDocRef = doc(firebase.firestore, 'users', otherUserUid);
    otherUserLocationUnsubscribe = onSnapshot(otherUserDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data() as User;
        if (userData.liveLocation) {
          setOtherUserMapLocation({
            latitude: userData.liveLocation.latitude,
            longitude: userData.liveLocation.longitude,
          });
        }
      }
    }, (e) => {
      console.error("Error listening to other user's location:", e);
      Toast.show({type: 'error', text1: "Connection Issue", text2: `Could not get ${otherUserName || 'their'} location.`})
    });
    
    setIsLoading(false); // Initial loading done

    return () => {
      if (locationSubscription) locationSubscription.remove();
      if (otherUserLocationUnsubscribe) otherUserLocationUnsubscribe();
      if (expiryTimeoutId) clearTimeout(expiryTimeoutId);
    };
  }, [params.currentUserUid, params.otherUserUid, params.sharingExpiresAt, navigation, router]);


  useEffect(() => {
    if (currentUserMapLocation && otherUserMapLocation && mapRef.current && !initialRegionSet) {
        const coordinates = [currentUserMapLocation, otherUserMapLocation];
        mapRef.current.fitToCoordinates(coordinates, {
            edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
            animated: true,
        });
        setInitialRegionSet(true); // Ensure this runs only once initially or when explicitly needed
    } else if (currentUserMapLocation && mapRef.current && !initialRegionSet) {
        mapRef.current.animateToRegion({
            ...currentUserMapLocation,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
        }, 1000);
        setInitialRegionSet(true);
    }
  }, [currentUserMapLocation, otherUserMapLocation, initialRegionSet]);


  const handleStopSharing = async () => {
    if (locationSubscription) locationSubscription.remove();
    locationSubscription = null; // prevent further updates
    
    // Clear liveLocation for current user in Firestore
    try {
        const userDocRef = doc(firebase.firestore, 'users', params.currentUserUid);
        await updateDoc(userDocRef, {
            liveLocation: firebase.firestore.FieldValue.delete(), // Use FieldValue.delete() for Firestore
        });
    } catch (e) {
        console.error("Error clearing liveLocation:", e);
    }

    // Update BatSignalAcceptance to reflect sharing stopped (e.g., by setting sharingExpiresAt to now)
    // This implicitly stops sharing for both.
    try {
        const acceptanceDocId = `${params.signalId}_${params.otherUserUid}`; // If recipient is otherUser
        // Or, if current user is recipient: `${params.signalId}_${params.currentUserUid}`;
        // For now, let's assume the acceptance doc ID is based on the signal and the recipient.
        // The one who initiated the BatSignal is params.otherUserUid if current user is recipient, and vice-versa.
    if (acceptanceDocId) {
        const acceptanceRef = doc(firebase.firestore, 'batSignalAcceptances', acceptanceDocId);
        await updateDoc(acceptanceRef, {
            sharingExpiresAt: Timestamp.now(), // Set expiry to now to stop session
            // Optionally: sharingStoppedManually: true 
        });
        Toast.show({type: 'info', text1: 'Sharing Stopped', text2: 'You have stopped sharing your location.'});
    } else {
        Toast.show({type: 'error', text1: 'Error', text2: 'Could not stop session, acceptance details unclear.'});
        console.warn("acceptanceDocId is not set, cannot update Firestore to stop sharing.");
    }

    } catch (e) {
        console.error("Error during stop sharing process:", e);
        Toast.show({type: 'error', text1: 'Error Stopping', text2: 'Could not update session status.'});
    }

    if (router.canGoBack()) {
      router.goBack();
    } else {
      router.replace('/(main)/dashboard');
    }
  };
  
  if (isLoading && !currentUserMapLocation) { // Show loading only if truly loading initial data
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text>Loading Live Share Session...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <CustomButton title="Go Back" onPress={() => {if(router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard')}} />
      </View>
    );
  }

  const initialMapRegion: Region | undefined = currentUserMapLocation ? {
    latitude: currentUserMapLocation.latitude,
    longitude: currentUserMapLocation.longitude,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  } : undefined;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live Location Sharing</Text>
      <Text style={styles.infoText}>
        Sharing with: {otherUserName || params.otherUserUid.substring(0,6)}
      </Text>
      <Text style={styles.infoText}>
        Session expires: {sharingActuallyExpiresAt ? sharingActuallyExpiresAt.toLocaleTimeString() : 'N/A'}
      </Text>
      
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialMapRegion}
        showsUserLocation={false} // We use custom markers
      >
        {currentUserMapLocation && (
          <Marker
            coordinate={currentUserMapLocation}
            title="You"
            pinColor="blue"
          />
        )}
        {otherUserMapLocation && (
          <Marker
            coordinate={otherUserMapLocation}
            title={otherUserName || 'Them'}
            pinColor="green"
          />
        )}
        {currentUserMapLocation && otherUserMapLocation && (
            <Polyline
                coordinates={[currentUserMapLocation, otherUserMapLocation]}
                strokeColor="#000" // fallback for when `strokeColors` is not supported
                strokeColors={['#7F0000']}
                strokeWidth={3}
            />
        )}
      </MapView>

      <CustomButton 
        title="Stop Sharing" 
        onPress={handleStopSharing} 
        style={styles.stopButton}
        icon={<Ionicons name="stop-circle-outline" size={20} color="white" />}
      />
      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    flex: 1,
    // padding: 16, // Map should take full width/height available in its view part
    alignItems: 'center',
    backgroundColor: '#f4f4f8',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginVertical: 10,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 14,
    marginBottom: 5,
    color: 'gray',
    textAlign: 'center',
  },
  map: {
    width: '100%',
    height: '70%', // Adjust as needed
    marginBottom: 15,
  },
  stopButton: {
    backgroundColor: '#f44336', // Red
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginTop: 10,
    width: '80%',
    alignSelf: 'center',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    marginBottom: 10,
  },
});
