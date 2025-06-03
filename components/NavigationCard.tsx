import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');
const BASE_HEIGHT = 852;
const vs = (size: number) => (height / BASE_HEIGHT) * size;

interface NavigationCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  description: string;
  onPress: () => void;
}

const NavigationCard: React.FC<NavigationCardProps> = ({
  icon,
  iconColor,
  title,
  description,
  onPress,
}) => {
  return (
    <TouchableOpacity style={styles.navCard} onPress={onPress}>
      <Ionicons name={icon} size={36} color={iconColor} />
      <Text style={styles.navCardTitle}>{title}</Text>
      <Text style={styles.navCardDescription}>{description}</Text>
    </TouchableOpacity>
  );
};

export default NavigationCard;

const styles = StyleSheet.create({
  navCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    padding: vs(20),
    marginBottom: vs(16),
    alignItems: 'center',
  },
  navCardTitle: {
    fontSize: vs(18),
    fontWeight: '600',
    marginTop: vs(12),
    marginBottom: vs(8),
    color: '#333',
  },
  navCardDescription: {
    fontSize: vs(14),
    color: '#666',
    textAlign: 'center',
  },
});
