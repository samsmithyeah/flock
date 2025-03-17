import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type BadgeVariant =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'highlight';

interface BadgeProps {
  text: string;
  variant?: BadgeVariant;
  icon?: {
    name: keyof typeof Ionicons.glyphMap;
    color?: string;
    size?: number;
  };
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const Badge: React.FC<BadgeProps> = ({
  text,
  variant = 'primary',
  icon,
  style,
  textStyle,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return {
          container: { backgroundColor: '#E8F5E9' },
          text: { color: '#4CAF50' },
          icon: '#4CAF50',
        };
      case 'warning':
        return {
          container: { backgroundColor: '#FFF8E1' },
          text: { color: '#FFA000' },
          icon: '#FFA000',
        };
      case 'danger':
        return {
          container: { backgroundColor: '#FFEBEE' },
          text: { color: '#F44336' },
          icon: '#F44336',
        };
      case 'info':
        return {
          container: { backgroundColor: '#E3F2FD' },
          text: { color: '#1E88E5' },
          icon: '#1E88E5',
        };
      case 'neutral':
        return {
          container: { backgroundColor: '#F5F5F5' },
          text: { color: '#757575' },
          icon: '#757575',
        };
      case 'highlight':
        return {
          container: { backgroundColor: '#FFFDE7' },
          text: { color: '#FFA000' },
          icon: '#FFD700',
        };
      case 'primary':
      default:
        return {
          container: { backgroundColor: '#1E90FF' },
          text: { color: '#FFFFFF' },
          icon: '#FFFFFF',
        };
    }
  };

  const variantStyle = getVariantStyles();

  return (
    <View style={[styles.badge, variantStyle.container, style]}>
      {icon && (
        <Ionicons
          name={icon.name}
          size={icon.size || 14}
          color={icon.color || variantStyle.icon}
          style={styles.icon}
        />
      )}
      <Text style={[styles.badgeText, variantStyle.text, textStyle]}>
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  icon: {
    marginRight: 4,
  },
});

export default Badge;
