import React from 'react';
import { View, Text, StyleSheet, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/styles/colors';
import CustomButton from './CustomButton';

interface LocationPermissionsCardProps {
  foregroundPermissionGranted: boolean;
  backgroundPermissionGranted: boolean;
  isTrackingActive: boolean;
  onRequestForegroundPermission: () => Promise<void>;
  onRequestBackgroundPermission: () => Promise<void>;
  onToggleTracking: (enabled: boolean) => Promise<void>;
  isLoading?: boolean;
  hasActiveLocationSharing?: boolean;
}

const LocationPermissionsCard: React.FC<LocationPermissionsCardProps> = ({
  foregroundPermissionGranted,
  backgroundPermissionGranted,
  isTrackingActive,
  onRequestForegroundPermission,
  onRequestBackgroundPermission,
  onToggleTracking,
  isLoading = false,
  hasActiveLocationSharing = false,
}) => {
  const handleToggleTracking = async (value: boolean) => {
    // Check for foreground permission first
    if (!foregroundPermissionGranted && value) {
      Alert.alert(
        'Foreground permission required',
        'Basic location permission is required before enabling location tracking.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Grant Permission', onPress: onRequestForegroundPermission },
        ],
      );
      return;
    }

    // Show warning if enabling without background permission
    if (!backgroundPermissionGranted && value) {
      Alert.alert(
        'Limited functionality',
        'Without background permission, you can send signals and share your location, but the signals you receive may be out of sync with your true location when the app is not open. Continue with foreground-only mode?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue limited',
            style: 'default',
            onPress: () => onToggleTracking(value),
          },
        ],
      );
      return;
    }

    // Prevent disabling tracking when actively sharing location
    if (!value && hasActiveLocationSharing) {
      Alert.alert(
        'Cannot disable tracking',
        'Location tracking cannot be disabled while you have active location sharing sessions. Please end all location sharing first.',
        [{ text: 'OK', style: 'default' }],
      );
      return;
    }

    await onToggleTracking(value);
  };

  const getOverallStatusIcon = () => {
    if (!foregroundPermissionGranted) {
      return 'location-outline';
    }
    if (!backgroundPermissionGranted) {
      return 'location-outline';
    }
    return isTrackingActive ? 'location' : 'location-outline';
  };

  const getOverallStatusColor = () => {
    if (!foregroundPermissionGranted) {
      return Colors.warning;
    }
    if (!backgroundPermissionGranted && isTrackingActive) {
      return Colors.warning; // Yellow for limited mode
    }
    if (!backgroundPermissionGranted) {
      return Colors.gray;
    }
    return isTrackingActive ? Colors.success : Colors.gray;
  };

  const getOverallStatusText = () => {
    if (!foregroundPermissionGranted) {
      return 'Foreground permission required';
    }
    if (!backgroundPermissionGranted && isTrackingActive) {
      return 'Active (while using app only)';
    }
    return isTrackingActive ? 'Active' : 'Inactive';
  };

  const getDescriptionText = () => {
    if (!foregroundPermissionGranted) {
      return 'Grant foreground location permission to use location features and share your location with friends.';
    }

    if (!backgroundPermissionGranted && !isTrackingActive) {
      return 'You can enable basic location tracking with foreground permission only. For the best experience and to receive signals when the app is closed, grant background permission.';
    }

    if (!backgroundPermissionGranted && isTrackingActive) {
      return 'Location tracking is active but limited to foreground only. You can send signals and share your location, bbut the signals you receive may be out of sync with your true location when the app is not open. Grant background permission for full functionality.';
    }

    if (isTrackingActive) {
      if (hasActiveLocationSharing) {
        return 'Smart location tracking is active. Cannot be disabled while actively sharing location with others. High-frequency updates during location sharing sessions.';
      }
      return 'Smart location tracking is active. Battery-optimized updates when idle, high-frequency updates during location sharing sessions.';
    }

    return 'Enable smart background tracking to receive signals when the app is closed. Automatically switches between battery-saving and high-precision modes.';
  };

  const canToggleTracking = foregroundPermissionGranted;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleContainer}>
            <Ionicons
              name={getOverallStatusIcon()}
              size={20}
              color={getOverallStatusColor()}
              style={styles.titleIcon}
            />
            <Text style={styles.title}>Location tracking</Text>
          </View>

          {canToggleTracking && (
            <Switch
              value={isTrackingActive}
              onValueChange={handleToggleTracking}
              trackColor={{
                false: Colors.lightGray,
                true: Colors.primaryLight,
              }}
              thumbColor={isTrackingActive ? Colors.primary : Colors.gray}
              disabled={
                isLoading || (isTrackingActive && hasActiveLocationSharing)
              }
            />
          )}
        </View>

        <Text
          style={[
            styles.statusText,
            { color: getOverallStatusColor() },
            canToggleTracking && styles.statusTextWithSwitch,
          ]}
        >
          {getOverallStatusText()}
        </Text>
      </View>

      {/* Description */}
      <Text style={styles.description}>{getDescriptionText()}</Text>

      {/* Permission Buttons */}
      {!foregroundPermissionGranted && (
        <View style={styles.permissionSection}>
          <CustomButton
            title="Enable foreground location"
            onPress={onRequestForegroundPermission}
            variant="secondary"
            icon={{
              name: 'location-outline',
              size: 18,
              color: Colors.primary,
            }}
            loading={isLoading}
            style={styles.permissionButton}
          />
        </View>
      )}

      {/* Settings Guidance for Background Permission - instead of button */}
      {foregroundPermissionGranted && !backgroundPermissionGranted && (
        <View style={styles.guidanceSection}>
          <View style={styles.guidanceRow}>
            <Ionicons
              name="settings-outline"
              size={16}
              color={Colors.primary}
            />
            <Text style={styles.guidanceText}>
              Change location access from "While Using the App" to "Always" in
              device settings
            </Text>
          </View>
        </View>
      )}

      {/* Permission Status Indicators */}
      {(foregroundPermissionGranted || backgroundPermissionGranted) && (
        <View style={styles.permissionStatusSection}>
          <View style={styles.permissionStatusRow}>
            <Ionicons
              name={
                foregroundPermissionGranted
                  ? 'checkmark-circle'
                  : 'close-circle'
              }
              size={16}
              color={
                foregroundPermissionGranted ? Colors.success : Colors.danger
              }
            />
            <Text
              style={[
                styles.permissionStatusText,
                {
                  color: foregroundPermissionGranted
                    ? Colors.success
                    : Colors.danger,
                },
              ]}
            >
              Foreground location{' '}
              {foregroundPermissionGranted ? 'granted' : 'not granted'}
            </Text>
          </View>

          <View style={styles.permissionStatusRow}>
            <Ionicons
              name={
                backgroundPermissionGranted
                  ? 'checkmark-circle'
                  : 'close-circle'
              }
              size={16}
              color={
                backgroundPermissionGranted ? Colors.success : Colors.danger
              }
            />
            <Text
              style={[
                styles.permissionStatusText,
                {
                  color: backgroundPermissionGranted
                    ? Colors.success
                    : Colors.danger,
                },
              ]}
            >
              Background location{' '}
              {backgroundPermissionGranted ? 'granted' : 'not granted'}
            </Text>
          </View>
        </View>
      )}

      {/* Info Section - only show when fully set up */}
      {foregroundPermissionGranted &&
        backgroundPermissionGranted &&
        !isTrackingActive && (
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={Colors.gray} />
              <Text style={styles.infoText}>
                Passive mode: 5-minute updates • Active mode: 15-second updates
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons
                name="battery-charging-outline"
                size={16}
                color={Colors.gray}
              />
              <Text style={styles.infoText}>
                Automatically switches modes to save battery
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color={Colors.gray}
              />
              <Text style={styles.infoText}>
                Secure and private - only visible to friends when actively
                sharing
              </Text>
            </View>
          </View>
        )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  header: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  titleIcon: {
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 28, // Align with title text (icon + margin)
  },
  statusTextWithSwitch: {
    marginTop: -4, // Compensate for switch height
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  permissionSection: {
    marginBottom: 16,
  },
  permissionButton: {
    marginTop: 0,
  },
  permissionStatusSection: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  permissionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  permissionStatusText: {
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  infoSection: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: 8,
    flex: 1,
  },
  guidanceSection: {
    backgroundColor: Colors.primaryLight + '20', // Very light blue
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  guidanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  guidanceText: {
    fontSize: 13,
    color: Colors.primary,
    marginLeft: 8,
    flex: 1,
    fontWeight: '500',
  },
});

export default LocationPermissionsCard;
