// components/LocationStatusBadge.tsx

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface LocationStatusBadgeProps {
  isBackgroundEnabled: boolean;
  isTracking: boolean;
  size?: 'small' | 'medium' | 'large';
}

interface SizeStyles {
  container: ViewStyle;
  iconSize: number;
  text: TextStyle;
}

const LocationStatusBadge: React.FC<LocationStatusBadgeProps> = ({
  isBackgroundEnabled,
  isTracking,
  size = 'medium',
}) => {
  const getStatusInfo = () => {
    if (!isBackgroundEnabled) {
      return {
        icon: 'location-outline' as keyof typeof Ionicons.glyphMap,
        color: '#FF9500',
        text: 'Permission needed',
        bgColor: '#FFF3E0',
      };
    }

    if (isTracking) {
      return {
        icon: 'location' as keyof typeof Ionicons.glyphMap,
        color: '#28A745',
        text: 'Tracking active',
        bgColor: '#E8F5E8',
      };
    }

    return {
      icon: 'location-outline' as keyof typeof Ionicons.glyphMap,
      color: '#6B7280',
      text: 'Tracking inactive',
      bgColor: '#F3F4F6',
    };
  };

  const status = getStatusInfo();
  const sizeStyles = sizeStylesMap[size];

  return (
    <View
      style={[
        styles.container,
        sizeStyles.container,
        { backgroundColor: status.bgColor },
      ]}
    >
      <Ionicons
        name={status.icon}
        size={sizeStyles.iconSize}
        color={status.color}
      />
      {size !== 'small' && (
        <Text style={[styles.text, sizeStyles.text, { color: status.color }]}>
          {status.text}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
  } as ViewStyle,
  text: {
    fontWeight: '500',
    marginLeft: 6,
  } as TextStyle,
});

const sizeStylesMap: Record<'small' | 'medium' | 'large', SizeStyles> = {
  small: {
    container: {
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 12,
    },
    iconSize: 12,
    text: {
      fontSize: 10,
    },
  },
  medium: {
    container: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 16,
    },
    iconSize: 16,
    text: {
      fontSize: 12,
    },
  },
  large: {
    container: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    iconSize: 20,
    text: {
      fontSize: 14,
    },
  },
};

export default LocationStatusBadge;
