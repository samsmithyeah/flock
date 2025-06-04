import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import CustomButton from './CustomButton';

interface LocationPermissionWarningProps {
  /** Whether foreground location permission is granted */
  locationPermissionGranted: boolean;
  /** Whether background location permission is granted */
  backgroundLocationPermissionGranted: boolean;
  /** Whether background location tracking is currently active */
  backgroundLocationTrackingActive: boolean;
  /** Whether location tracking is enabled in user settings */
  userLocationTrackingEnabled: boolean;
}

const LocationPermissionWarning: React.FC<LocationPermissionWarningProps> = ({
  locationPermissionGranted,
  backgroundLocationPermissionGranted,
  backgroundLocationTrackingActive,
  userLocationTrackingEnabled,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Don't show the warning if everything is properly configured
  const shouldShowWarning = !(
    locationPermissionGranted &&
    backgroundLocationPermissionGranted &&
    backgroundLocationTrackingActive
  );

  if (!shouldShowWarning) {
    return null;
  }

  // Determine warning type and styling
  const isError = !locationPermissionGranted || !userLocationTrackingEnabled;

  const getTitle = () => {
    if (!locationPermissionGranted) return 'Location permission required';
    if (!userLocationTrackingEnabled) return 'Location tracking disabled';
    return 'Limited mode active';
  };

  const getMessage = () => {
    if (!locationPermissionGranted) {
      return 'Foreground location permission not granted. You need location access to use location features.';
    }
    if (!userLocationTrackingEnabled) {
      return 'Location tracking is turned off. Enable it in your profile settings to send and receive signals.';
    }
    return 'You can send signals and share location, but the signals you receive may be out of sync with your true location when the app is closed. Change location access from "While Using the App" to "Always" in your phone settings for full functionality.';
  };

  const getIcon = () => {
    return isError ? 'warning-outline' : 'information-circle-outline';
  };

  const getColors = () => {
    return {
      icon: isError ? '#FF9500' : '#2196F3',
      title: isError ? '#FF9500' : '#2196F3',
      text: isError ? '#F57C00' : '#1976D2',
      background: isError ? '#FFF8E1' : '#E3F2FD',
      border: isError ? '#FF9500' : '#2196F3',
    };
  };

  const colors = getColors();
  const shouldShowSettingsButton = isError; // Only show for scenarios 1, 3, 5

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          borderLeftColor: colors.border,
        },
      ]}
    >
      {/* Header with collapse/expand functionality */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerContent}>
          <Ionicons name={getIcon()} size={20} color={colors.icon} />
          <Text style={[styles.title, { color: colors.title }]}>
            {getTitle()}
          </Text>
          {/* Collapse/Expand button */}
          {userLocationTrackingEnabled && (
            <View style={styles.collapseButton}>
              <Text style={[styles.collapseText, { color: colors.title }]}>
                {isExpanded ? 'Less' : 'More'}
              </Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.icon}
                style={styles.chevronIcon}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Expandable content */}
      {isExpanded && (
        <View style={styles.content}>
          <Text style={[styles.message, { color: colors.text }]}>
            {getMessage()}
          </Text>

          {shouldShowSettingsButton && (
            <CustomButton
              title="Settings"
              onPress={() => router.push('/settings')}
              variant="secondary"
              style={styles.settingsButton}
              icon={{
                name: 'settings-outline',
                size: 18,
              }}
            />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    marginVertical: 16,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  header: {
    padding: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  collapseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  collapseText: {
    fontSize: 12,
    fontWeight: '500',
    marginRight: 4,
  },
  chevronIcon: {
    marginLeft: 2,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 0,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  settingsButton: {
    marginTop: 4,
  },
});

export default LocationPermissionWarning;
