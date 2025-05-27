// components/BackgroundLocationCard.tsx

import React from 'react';
import { View, Text, StyleSheet, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/styles/colors';
import CustomButton from './CustomButton';

// Define colors to match app theme
const AppColors = {
  primary: '#1E90FF',
  primaryLight: '#87CEEB',
  success: '#28A745',
  warning: '#FF9500',
  danger: '#DC3545',
  gray: '#6B7280',
  lightGray: '#E5E7EB',
  text: '#1F2937',
  textSecondary: '#6B7280',
  white: '#FFFFFF',
  background: Colors.background,
};

interface BackgroundLocationCardProps {
  isPermissionGranted: boolean;
  isTrackingActive: boolean;
  onRequestPermission: () => Promise<void>;
  onToggleTracking: (enabled: boolean) => Promise<void>;
  isLoading?: boolean;
}

const BackgroundLocationCard: React.FC<BackgroundLocationCardProps> = ({
  isPermissionGranted,
  isTrackingActive,
  onRequestPermission,
  onToggleTracking,
  isLoading = false,
}) => {
  const handleToggleTracking = async (value: boolean) => {
    if (!isPermissionGranted && value) {
      Alert.alert(
        'Permission Required',
        'Background location permission is required to enable automatic location tracking.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Grant Permission', onPress: onRequestPermission },
        ],
      );
      return;
    }

    await onToggleTracking(value);
  };

  const getStatusIcon = () => {
    if (!isPermissionGranted) {
      return 'location-outline';
    }
    return isTrackingActive ? 'location' : 'location-outline';
  };

  const getStatusColor = () => {
    if (!isPermissionGranted) {
      return AppColors.warning;
    }
    return isTrackingActive ? AppColors.success : AppColors.gray;
  };

  const getStatusText = () => {
    if (!isPermissionGranted) {
      return 'Permission Required';
    }
    return isTrackingActive ? 'Active' : 'Inactive';
  };

  const getDescriptionText = () => {
    if (!isPermissionGranted) {
      return 'Grant background location permission to automatically update your location for signals, even when the app is closed.';
    }

    if (isTrackingActive) {
      return 'Your location is being updated automatically. Friends can send you signals even when the app is closed.';
    }

    return 'Enable to receive signals when the app is closed. Your location will be updated automatically every 30 seconds or when you move 50+ meters.';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Ionicons
            name={getStatusIcon()}
            size={20}
            color={getStatusColor()}
            style={styles.titleIcon}
          />
          <Text style={styles.title}>Background location</Text>
        </View>

        <View style={styles.statusContainer}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
          <Switch
            value={isTrackingActive}
            onValueChange={handleToggleTracking}
            trackColor={{
              false: AppColors.lightGray,
              true: AppColors.primaryLight,
            }}
            thumbColor={isTrackingActive ? AppColors.primary : AppColors.gray}
            disabled={isLoading}
          />
        </View>
      </View>

      {/* Description */}
      <Text style={styles.description}>{getDescriptionText()}</Text>

      {/* Permission Button */}
      {!isPermissionGranted && (
        <View style={styles.permissionSection}>
          <CustomButton
            title="Grant background permission"
            onPress={onRequestPermission}
            variant="secondary"
            icon={{
              name: 'navigate-circle-outline',
              size: 18,
              color: AppColors.primary,
            }}
            loading={isLoading}
            style={styles.permissionButton}
          />
        </View>
      )}

      {/* Info Section */}
      {!isTrackingActive && (
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={AppColors.gray} />
            <Text style={styles.infoText}>
              Updates every 30 seconds or 50+ meters
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons
              name="battery-charging-outline"
              size={16}
              color={AppColors.gray}
            />
            <Text style={styles.infoText}>
              Optimized for battery efficiency
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={16}
              color={AppColors.gray}
            />
            <Text style={styles.infoText}>
              Only shared with your crew members
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: AppColors.white,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: AppColors.lightGray,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
    color: AppColors.text,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 12,
  },
  description: {
    fontSize: 14,
    color: AppColors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  permissionSection: {
    marginBottom: 16,
  },
  permissionButton: {
    marginTop: 0,
  },
  infoSection: {
    backgroundColor: AppColors.background,
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
    color: AppColors.textSecondary,
    marginLeft: 8,
    flex: 1,
  },
});

export default BackgroundLocationCard;
