/* eslint-disable react-native/no-unused-styles */
// components/ActionButton.tsx

import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  GestureResponderEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
}

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'disabled'
  | 'secondaryDanger';

interface ActionButtonProps {
  icon: IconProps;
  onPress: (event: GestureResponderEvent) => void;
  loading?: boolean;
  variant?: ButtonVariant;
  disabled?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  onPress,
  loading = false,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}) => {
  // Determine if the button should be disabled
  const isDisabled = disabled || variant === 'disabled';

  // Helper function to determine icon color based on variant
  const getIconColor = () => {
    if (icon.color) return icon.color;

    if (variant === 'secondary') {
      return '#1E90FF'; // DodgerBlue
    } else if (variant === 'disabled') {
      return '#D3D3D3'; // LightGray
    } else if (variant === 'secondaryDanger') {
      return '#DC3545'; // Red
    } else {
      return '#FFFFFF'; // Default to White
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        styles[variant],
        isDisabled ? styles.buttonDisabled : {},
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={isDisabled || loading}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === 'secondary' || variant === 'secondaryDanger'
              ? '#0056b3'
              : '#FFFFFF'
          }
        />
      ) : (
        <Ionicons
          name={icon.name as any}
          size={icon.size || 16}
          color={getIconColor()}
        />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Variant Styles
  primary: {
    backgroundColor: '#1E90FF', // DodgerBlue
  },
  secondary: {
    backgroundColor: '#FFFFFF', // White
    borderWidth: 1,
    borderColor: '#1E90FF', // DodgerBlue
  },
  danger: {
    backgroundColor: '#DC3545', // Red
  },
  secondaryDanger: {
    backgroundColor: '#FFFFFF', // White
    borderWidth: 1,
    borderColor: '#DC3545', // Red
  },
  success: {
    backgroundColor: '#28A745', // Green
  },
  disabled: {
    backgroundColor: '#A9A9A9', // DarkGray
  },
  // Disabled State
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default ActionButton;
