// components/EmptyState.tsx

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  size?: 'small' | 'medium' | 'large';
}

interface SizeStyles {
  iconContainer: ViewStyle;
  iconSize: number;
  title: TextStyle;
  description: TextStyle;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  size = 'medium',
}) => {
  const sizeStyles = sizeStylesMap[size];

  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, sizeStyles.iconContainer]}>
        <Ionicons name={icon} size={sizeStyles.iconSize} color="#9CA3AF" />
      </View>
      <Text style={[styles.title, sizeStyles.title]}>{title}</Text>
      <Text style={[styles.description, sizeStyles.description]}>
        {description}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  } as ViewStyle,
  iconContainer: {
    borderRadius: 50,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  } as ViewStyle,
  title: {
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 8,
  } as TextStyle,
  description: {
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  } as TextStyle,
});

const sizeStylesMap: Record<'small' | 'medium' | 'large', SizeStyles> = {
  small: {
    iconContainer: {
      width: 40,
      height: 40,
    },
    iconSize: 20,
    title: {
      fontSize: 14,
    },
    description: {
      fontSize: 12,
    },
  },
  medium: {
    iconContainer: {
      width: 60,
      height: 60,
    },
    iconSize: 30,
    title: {
      fontSize: 16,
    },
    description: {
      fontSize: 14,
    },
  },
  large: {
    iconContainer: {
      width: 80,
      height: 80,
    },
    iconSize: 40,
    title: {
      fontSize: 18,
    },
    description: {
      fontSize: 16,
    },
  },
};

export default EmptyState;
