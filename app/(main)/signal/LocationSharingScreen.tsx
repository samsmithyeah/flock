// app/(main)/signal/LocationSharingScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { doc, onSnapshot, Timestamp, getDoc, updateDoc, FieldValue as FirebaseFieldValue } from 'firebase/firestore'; // Renamed FieldValue
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
  const [initialRegionSet, setInitialRegionSet] = useState(false); // To control initial map animation

  // Store refs to unsubscribe/clear functions to call them in handleStopSharing and cleanup
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const otherUserLocationUnsubscribeRef = useRef<(() => void) | null>(null);
  const acceptanceDocUnsubscribeRef = useRef<(() => void) | null>(null); // For the new listener
  const expiryTimeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  
  const [acceptanceDocId, setAcceptanceDocId] = useState<string | null>(null);
  const [isSessionTerminated, setIsSessionTerminated] = useState(false); // To prevent multiple navigations

  useEffect(() => {
    navigation.setOptions({ title: 'Live Location' });

    const { signalId, currentUserUid, otherUserUid, sharingExpiresAt: expiresAtParam } = params;
    let isMounted = true; // Flag to prevent state updates if component unmounts during async ops

    if (!signalId || !currentUserUid || !otherUserUid || !expiresAtParam) {
        if (isMounted) {
            setError("Critical session information is missing. Cannot start sharing.");
            setIsLoading(false);
            Toast.show({type: 'error', text1: "Error", text2: "Missing session details."});
            if(router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard');
        }
        return;
    }
    
    const determineAndSetAcceptanceId = async () => {
        try {
            const signalRef = doc(firebase.firestore, 'batSignals', signalId);
            const signalSnap = await getDoc(signalRef);
            if (isMounted && signalSnap.exists()) {
                const signalData = signalSnap.data();
                let determinedId = '';
                if (signalData?.senderId === currentUserUid) { 
                    determinedId = `${signalId}_${otherUserUid}`;
                } else { 
                    determinedId = `${signalId}_${currentUserUid}`;
                }
                setAcceptanceDocId(determinedId);
            } else if (isMounted) {
                console.error("Signal document not found to determine acceptance ID");
                setError("Signal details missing, cannot manage session.");
                setIsLoading(false); 
            }
        } catch (e) {
            if (isMounted) {
                console.error("Error fetching signal for acceptance ID:", e);
                setError("Error verifying session details.");
                setIsLoading(false);
            }
        }
    };

    determineAndSetAcceptanceId();
    
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
    
    expiryTimeoutIdRef.current = setTimeout(() => {
      Toast.show({ type: 'info', text1: 'Session Ended', text2: 'Location sharing time has expired.' });
      if (router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard');
    }, expiryDate.getTime() - Date.now());

    let isMounted = true; // Flag to prevent state updates if component unmounts during async ops

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (!isMounted) return;
      if (status !== 'granted') {
        setError('Location permission denied for self.');
        Toast.show({ type: 'error', text1: 'Permission Denied', text2: 'Location permission is required.' });
        setIsLoading(false);
        return;
      }

      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: LOCATION_UPDATE_INTERVAL,
          distanceInterval: LOCATION_UPDATE_DISTANCE_INTERVAL,
        },
        async (location) => {
          if (!isMounted) return;
          const newMapLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          setCurrentUserMapLocation(newMapLocation);

          try {
            const userDocRef = doc(firebase.firestore, 'users', currentUserUid);
            await updateDoc(userDocRef, {
              liveLocation: new GeoPoint(location.coords.latitude, location.coords.longitude),
              lastKnownLocationTimestamp: Timestamp.now(),
            });
          } catch (e) {
            console.error("Error updating self location to Firestore:", e);
          }
        }
      );
    })();

    const otherUserDocRef = doc(firebase.firestore, 'users', otherUserUid);
    otherUserLocationUnsubscribeRef.current = onSnapshot(otherUserDocRef, (docSnap) => {
      if (!isMounted) return;
      if (docSnap.exists()) {
        const userData = docSnap.data() as User;
        if (userData.liveLocation) {
          setOtherUserMapLocation({
            latitude: userData.liveLocation.latitude,
            longitude: userData.liveLocation.longitude,
          });
        } else {
          setOtherUserMapLocation(null);
          if (!isSessionTerminated) { // Avoid duplicate toasts if session already ended
            Toast.show({type: 'info', text1: "Info", text2: `${otherUserName || 'The other user'} stopped sharing or location is unavailable.`});
          }
        }
      }
    }, (e) => {
      if (!isMounted) return;
      console.error("Error listening to other user's location:", e);
      if (!isSessionTerminated) {
          Toast.show({type: 'error', text1: "Connection Issue", text2: `Could not get ${otherUserName || 'their'} location.`})
      }
    });
    
    if (isMounted) setIsLoading(false); 

    return () => {
      isMounted = false;
      if (locationSubscriptionRef.current) locationSubscriptionRef.current.remove();
      if (otherUserLocationUnsubscribeRef.current) otherUserLocationUnsubscribeRef.current();
      if (acceptanceDocUnsubscribeRef.current) acceptanceDocUnsubscribeRef.current(); // Cleanup new listener
      if (expiryTimeoutIdRef.current) clearTimeout(expiryTimeoutIdRef.current);
    };
  }, [params.currentUserUid, params.otherUserUid, params.sharingExpiresAt, params.signalId, navigation, router]); // acceptanceDocId is not needed here as it's derived from these


  // New useEffect to listen to BatSignalAcceptance document changes
  useEffect(() => {
    if (!acceptanceDocId || isSessionTerminated) return;
    let isMounted = true;

    const acceptanceRef = doc(firebase.firestore, 'batSignalAcceptances', acceptanceDocId);
    acceptanceDocUnsubscribeRef.current = onSnapshot(acceptanceRef, (docSnap) => {
      if (!isMounted || !docSnap.exists() || isSessionTerminated) return;

      const acceptanceData = docSnap.data() as BatSignalAcceptance; // Type assertion
      const sessionExpiredByTime = acceptanceData.sharingExpiresAt && acceptanceData.sharingExpiresAt.toDate() < new Date();
      const stoppedManually = acceptanceData.sharingStoppedManually === true;

      if (sessionExpiredByTime || stoppedManually) {
        setIsSessionTerminated(true); // Prevent further actions/toasts
        Toast.show({
          type: 'info',
          text1: 'Session Ended',
          text2: stoppedManually ? `${otherUserName || 'The other user'} stopped sharing.` : 'Location sharing time has expired.',
        });
        
        // Perform cleanup similar to handleStopSharing
        if (locationSubscriptionRef.current) locationSubscriptionRef.current.remove();
        if (otherUserLocationUnsubscribeRef.current) otherUserLocationUnsubscribeRef.current();
        if (expiryTimeoutIdRef.current) clearTimeout(expiryTimeoutIdRef.current);
        
        // Clear current user's liveLocation in Firestore
        const userDocRef = doc(firebase.firestore, 'users', params.currentUserUid);
        updateDoc(userDocRef, { liveLocation: firebase.firestore.FieldValue.delete() })
            .catch(e => console.error("Error clearing liveLocation on session end:", e));

        if (router.canGoBack()) router.goBack(); else router.replace('/(main)/dashboard');
      }
    });

    return () => { 
        isMounted = false;
        if (acceptanceDocUnsubscribeRef.current) acceptanceDocUnsubscribeRef.current();
    };
  }, [acceptanceDocId, otherUserName, params.currentUserUid, router, isSessionTerminated]);


  useEffect(() => {
    if (mapRef.current && currentUserMapLocation) {
        if (otherUserMapLocation) {
            if (!initialRegionSet) { // Only fit to coordinates once or if explicitly reset
                 mapRef.current.fitToCoordinates([currentUserMapLocation, otherUserMapLocation], {
                    edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
                    animated: true,
                });
                setInitialRegionSet(true);
            }
        } else if (!initialRegionSet) { 
            mapRef.current.animateToRegion({
                ...currentUserMapLocation,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            }, 1000);
            setInitialRegionSet(true);
        }
    }
}, [currentUserMapLocation, otherUserMapLocation, initialRegionSet]);


  const handleStopSharing = async () => {
    if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
    }
    if (otherUserLocationUnsubscribeRef.current) {
        otherUserLocationUnsubscribeRef.current();
        otherUserLocationUnsubscribeRef.current = null;
    }
    if (expiryTimeoutIdRef.current) {
        clearTimeout(expiryTimeoutIdRef.current);
        expiryTimeoutIdRef.current = null;
    }
    
    try {
        const userDocRef = doc(firebase.firestore, 'users', params.currentUserUid);
        await updateDoc(userDocRef, {
            liveLocation: firebase.firestore.FieldValue.delete(), // Use FieldValue from firebase.firestore
        });
    } catch (e) {
        console.error("Error clearing current user's liveLocation:", e);
    }

    try {
      if (acceptanceDocId) { 
        const acceptanceRef = doc(firebase.firestore, 'batSignalAcceptances', acceptanceDocId);
        await updateDoc(acceptanceRef, {
            sharingExpiresAt: Timestamp.now(), 
        });
        Toast.show({type: 'info', text1: 'Sharing Stopped', text2: 'You have stopped sharing your location.'});
      } else {
        Toast.show({type: 'error', text1: 'Error', text2: 'Could not stop session, acceptance details unclear.'});
        console.warn("acceptanceDocId is not set, cannot update Firestore to stop sharing.");
      }
    } catch (e) {
        console.error("Error updating BatSignalAcceptance to stop sharing:", e);
        Toast.show({type: 'error', text1: 'Error Stopping', text2: 'Could not update session status.'});
    }

    if (router.canGoBack()) {
      router.goBack();
    } else {
      router.replace('/(main)/dashboard');
    }
  };
  
  if (isLoading) { 
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
  } : ( otherUserMapLocation ? { 
    latitude: otherUserMapLocation.latitude,
    longitude: otherUserMapLocation.longitude,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  } : undefined );


  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live Location Sharing</Text>
      <Text style={styles.infoText}>
        Sharing with: {otherUserName || params.otherUserUid?.substring(0,6) || 'User'}
      </Text>
      <Text style={styles.infoText}>
        Session expires: {sharingActuallyExpiresAt ? sharingActuallyExpiresAt.toLocaleTimeString() : 'N/A'}
      </Text>
      
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialMapRegion} 
        showsUserLocation={false} 
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
                strokeColor="#FF0000" 
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
    height: '70%', 
    marginBottom: 15,
  },
  stopButton: {
    backgroundColor: '#f44336', 
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
