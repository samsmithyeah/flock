// components/CustomTextInput.tsx

import React from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type CustomTextInputProps = TextInputProps & {
  iconName?: keyof typeof Ionicons.glyphMap; // Optional Ionicon name
  containerStyle?: ViewStyle; // Optional container style
  inputStyle?: TextStyle; // Optional TextInput style
  hasBorder?: boolean; // Optional prop to add border
  labelText?: string; // Optional label
};

const CustomTextInput: React.FC<CustomTextInputProps> = ({
  iconName,
  containerStyle,
  inputStyle,
  hasBorder = false, // Default to no border
  labelText,
  ...textInputProps
}) => {
  return (
    <>
      {labelText && <Text style={styles.label}>{labelText}</Text>}
      <View
        style={[styles.container, hasBorder && styles.border, containerStyle]}
      >
        {iconName && (
          <Ionicons
            name={iconName}
            size={24}
            color="#333"
            style={styles.icon}
          />
        )}
        <TextInput style={[styles.input, inputStyle]} {...textInputProps} />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 10,
    paddingHorizontal: 10,
    height: 42,
  },
  border: {
    borderColor: '#ccc',
    borderWidth: 1,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#333',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 5,
  },
});

export default CustomTextInput;
