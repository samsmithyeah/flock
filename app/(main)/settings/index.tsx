import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Alert,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useUser } from '@/context/UserContext';
import { useSignal } from '@/context/SignalContext';
import { useGlobalStyles } from '@/styles/globalStyles';
import ScreenTitle from '@/components/ScreenTitle';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import Colors from '@/styles/colors';
import Toast from 'react-native-toast-message';

const SettingsScreen: React.FC = () => {
  const { user, logout } = useUser();
  const {
    backgroundLocationPermissionGranted,
    backgroundLocationTrackingActive,
    requestBackgroundLocationPermission,
    startBackgroundLocationTracking,
    stopBackgroundLocationTracking,
    hasActiveLocationSharing,
  } = useSignal();

  const globalStyles = useGlobalStyles();
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleBackgroundTracking = async (value: boolean) => {
    if (isToggling) return;

    if (!backgroundLocationPermissionGranted && value) {
      Alert.alert(
        'Permission Required',
        'Background location permission is required to enable location tracking. Would you like to grant permission?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Grant Permission',
            onPress: async () => {
              const granted = await requestBackgroundLocationPermission();
              if (granted) {
                // Auto-start tracking after permission is granted
                setIsToggling(true);
                try {
                  await startBackgroundLocationTracking();
                } catch (error) {
                  console.error(
                    'Error starting tracking after permission:',
                    error,
                  );
                } finally {
                  setIsToggling(false);
                }
              }
            },
          },
        ],
      );
      return;
    }

    // Prevent disabling tracking when actively sharing location
    if (!value && hasActiveLocationSharing()) {
      Alert.alert(
        'Cannot Disable Tracking',
        'Location tracking cannot be disabled while you have active location sharing sessions. Please end all location sharing first.',
        [{ text: 'OK', style: 'default' }],
      );
      return;
    }

    setIsToggling(true);
    try {
      if (value) {
        await startBackgroundLocationTracking();
      } else {
        await stopBackgroundLocationTracking();
      }
    } catch (error) {
      console.error('Error toggling background tracking:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to update location tracking setting',
      });
    } finally {
      setIsToggling(false);
    }
  };

  const getLocationStatusIcon = () => {
    if (!backgroundLocationPermissionGranted) {
      return 'location-outline';
    }
    return backgroundLocationTrackingActive ? 'location' : 'location-outline';
  };

  const getLocationStatusColor = () => {
    if (!backgroundLocationPermissionGranted) {
      return Colors.warning;
    }
    return backgroundLocationTrackingActive ? Colors.success : Colors.gray;
  };

  const getLocationStatusText = () => {
    if (!backgroundLocationPermissionGranted) {
      return 'Permission Required';
    }
    return backgroundLocationTrackingActive ? 'Active' : 'Inactive';
  };

  const getLocationDescriptionText = () => {
    if (!backgroundLocationPermissionGranted) {
      return 'Grant background location permission to receive signals and automatically update your location, even when the app is closed.';
    }

    if (backgroundLocationTrackingActive) {
      if (hasActiveLocationSharing()) {
        return 'Smart location tracking is active. Cannot be disabled while actively sharing location with others. High-frequency updates during location sharing sessions.';
      }
      return 'Smart location tracking is active. Battery-optimized updates when idle, high-frequency updates during location sharing sessions.';
    }

    return 'Enable smart background tracking to receive signals when the app is closed. Automatically switches between battery-saving and high-precision modes.';
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

        <View style={styles.locationCard}>
          <View style={styles.locationHeader}>
            <View style={styles.locationTitleContainer}>
              <Ionicons
                name={getLocationStatusIcon()}
                size={20}
                color={getLocationStatusColor()}
                style={styles.locationIcon}
              />
              <Text style={styles.locationTitle}>
                Background Location Tracking
              </Text>
            </View>

            <View style={styles.locationStatusContainer}>
              <Text
                style={[
                  styles.locationStatus,
                  { color: getLocationStatusColor() },
                ]}
              >
                {getLocationStatusText()}
              </Text>
              <Switch
                value={backgroundLocationTrackingActive}
                onValueChange={handleToggleBackgroundTracking}
                trackColor={{
                  false: Colors.lightGray,
                  true: Colors.primaryLight,
                }}
                thumbColor={
                  backgroundLocationTrackingActive
                    ? Colors.primary
                    : Colors.gray
                }
                disabled={
                  isToggling ||
                  (backgroundLocationTrackingActive &&
                    hasActiveLocationSharing())
                }
              />
            </View>
          </View>

          <Text style={styles.locationDescription}>
            {getLocationDescriptionText()}
          </Text>
        </View>
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
    marginBottom: 32,
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
  locationCard: {
    backgroundColor: Colors.white,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  locationHeader: {
    marginBottom: 12,
  },
  locationTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationIcon: {
    marginRight: 8,
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  locationStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationStatus: {
    fontSize: 14,
    fontWeight: '500',
  },
  locationDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
