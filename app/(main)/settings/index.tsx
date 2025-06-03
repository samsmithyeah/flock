import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useUser } from '@/context/UserContext';
import { useSignal } from '@/context/SignalContext';
import { useGlobalStyles } from '@/styles/globalStyles';
import ScreenTitle from '@/components/ScreenTitle';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import LocationPermissionsCard from '@/components/LocationPermissionsCard';
import Colors from '@/styles/colors';

const SettingsScreen: React.FC = () => {
  const {
    user,
    logout,
    setUserDisabledForegroundLocation,
    persistForegroundLocationPreference,
  } = useUser();
  const {
    locationPermissionGranted,
    backgroundLocationPermissionGranted,
    requestLocationPermission,
    requestBackgroundLocationPermission,
    startBackgroundLocationTracking,
    stopBackgroundLocationTracking,
    hasActiveLocationSharing,
    userDisabledForegroundLocation,
  } = useSignal();
  const globalStyles = useGlobalStyles();

  // Calculate if location tracking is active - either foreground or background
  const isLocationTrackingActive =
    locationPermissionGranted && !userDisabledForegroundLocation;

  // Handler functions for LocationPermissionsCard
  const handleRequestForegroundPermission = async () => {
    await requestLocationPermission();
  };

  const handleRequestBackgroundPermission = async () => {
    await requestBackgroundLocationPermission();
  };

  const handleToggleTracking = async (enabled: boolean) => {
    if (enabled) {
      // For foreground-only mode, just clear the disabled flags
      // This enables location features without background tracking
      setUserDisabledForegroundLocation(false);
      persistForegroundLocationPreference(false);

      // If background permission is available, also start background tracking
      if (backgroundLocationPermissionGranted) {
        await startBackgroundLocationTracking();
      } else {
        // Don't start background tracking since user doesn't have permission
        // or explicitly chose foreground-only mode
        console.log('Enabled foreground-only location tracking');

        Toast.show({
          type: 'success',
          text1: 'Foreground tracking enabled',
          text2:
            'Location features enabled. Grant background permission for full functionality.',
        });
      }
    } else {
      // When disabling, stop background tracking and set disabled flags
      await stopBackgroundLocationTracking();
      setUserDisabledForegroundLocation(true);
      persistForegroundLocationPreference(true);

      Toast.show({
        type: 'success',
        text1: 'Location tracking disabled',
        text2: 'All location features have been disabled.',
      });
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: logout,
      },
    ]);
  };

  if (!user) {
    return null;
  }

  return (
    <ScrollView style={globalStyles.container}>
      <ScreenTitle title="Settings" />

      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>

        <View style={styles.profileContainer}>
          <ProfilePicturePicker
            imageUrl={user.photoURL || null}
            onImageUpdate={() => {}} // Read-only for now
            editable={false}
            size={80}
          />

          <View style={styles.profileInfo}>
            <Text style={styles.displayName}>
              {user.displayName || 'Unknown User'}
            </Text>
            <Text style={styles.email}>{user.email}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.settingsItem}
          onPress={() => router.push('/settings/edit-profile')}
          accessibilityLabel="Edit Profile"
          accessibilityHint="Edit your profile information"
        >
          <View style={styles.settingsItemLeft}>
            <Ionicons name="person-outline" size={24} color={Colors.primary} />
            <Text style={styles.settingsItemText}>Edit Profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.gray} />
        </TouchableOpacity>
      </View>

      {/* Location Settings Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>
        <LocationPermissionsCard
          foregroundPermissionGranted={locationPermissionGranted}
          backgroundPermissionGranted={backgroundLocationPermissionGranted}
          isTrackingActive={isLocationTrackingActive}
          onRequestForegroundPermission={handleRequestForegroundPermission}
          onRequestBackgroundPermission={handleRequestBackgroundPermission}
          onToggleTracking={handleToggleTracking}
          hasActiveLocationSharing={hasActiveLocationSharing()}
        />
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        <TouchableOpacity
          style={styles.settingsItem}
          onPress={handleLogout}
          accessibilityLabel="Log Out"
          accessibilityHint="Sign out of your account"
        >
          <View style={styles.settingsItemLeft}>
            <Ionicons name="log-out-outline" size={24} color={Colors.danger} />
            <Text style={[styles.settingsItemText, { color: Colors.danger }]}>
              Log out
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,

    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  settingsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsItemText: {
    fontSize: 16,
    color: Colors.text,
    marginLeft: 12,
  },
});
