// components/RadioButtonGroup.tsx

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RadioOption {
  value: string;
  label: string;
  icon?: string;
  description?: string;
}

interface RadioButtonGroupProps {
  options: RadioOption[];
  selectedValue: string;
  onValueChange: (value: string) => void;
  label?: string;
}

const RadioButtonGroup: React.FC<RadioButtonGroupProps> = ({
  options,
  selectedValue,
  onValueChange,
  label,
}) => {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      {options.map((option) => {
        const isSelected = selectedValue === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.option, isSelected && styles.selectedOption]}
            onPress={() => onValueChange(option.value)}
            accessibilityLabel={`Select ${option.label}`}
            accessibilityState={{ selected: isSelected }}
          >
            {/* Radio Button */}
            <View
              style={[
                styles.radioButton,
                isSelected && styles.radioButtonSelected,
              ]}
            >
              {isSelected && <View style={styles.radioButtonInner} />}
            </View>

            {/* Content */}
            <View style={styles.optionContent}>
              <View style={styles.optionHeader}>
                {option.icon && (
                  <Ionicons
                    name={option.icon as any}
                    size={18}
                    color={isSelected ? '#1e90ff' : '#666'}
                    style={styles.optionIcon}
                  />
                )}
                <Text
                  style={[
                    styles.optionLabel,
                    isSelected && styles.selectedLabel,
                  ]}
                >
                  {option.label}
                </Text>
              </View>
              {option.description && (
                <Text style={styles.optionDescription}>
                  {option.description}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 8,
  },
  selectedOption: {
    borderColor: '#1e90ff',
    backgroundColor: '#F0F8FF',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: '#1e90ff',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1e90ff',
  },
  optionContent: {
    flex: 1,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    marginRight: 8,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  selectedLabel: {
    color: '#1e90ff',
    fontWeight: '600',
  },
  optionDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    marginLeft: 26, // Align with label when there's an icon
  },
});

export default RadioButtonGroup;
