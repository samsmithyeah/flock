import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface IconButtonProps {
  selected?: boolean;
  onPress: () => void;
  iconName: keyof (typeof Ionicons)['glyphMap'];
  color: string;
  size?: number;
}

const IconButton: React.FC<IconButtonProps> = ({
  selected,
  onPress,
  iconName,
  color,
  size = 24,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.button,
        { borderColor: color },
        selected
          ? {
              backgroundColor: color,
            }
          : {
              backgroundColor: `${color}10`, // 10% opacity of the color
            },
        styles.pressable,
      ]}
      activeOpacity={0.7}
    >
      <Ionicons name={iconName} size={size} color={selected ? '#fff' : color} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: '33%',
    height: 35,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressable: {
    transform: [{ scale: 1 }],
  },
});

export default IconButton;
