import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface SendSignalButtonProps {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const SendSignalButton: React.FC<SendSignalButtonProps> = ({
  onPress,
  disabled = false,
  loading = false,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.buttonContainer}
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.85}
        accessibilityLabel="Send signal"
        accessibilityHint="Tap to create and send a new signal to nearby friends"
        accessibilityRole="button"
      >
        <LinearGradient
          colors={['#FF6B6B', '#FF5252', '#FF6B6B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, disabled && styles.disabledGradient]}
        >
          {/* Outer glow effect */}
          <View style={styles.outerGlow} />

          {/* Button content */}
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <View style={styles.iconBackground}>
                <Ionicons name="paper-plane" size={26} color="#fff" />
              </View>
              {/* Icon pulse effect */}
              <View style={styles.iconPulse} />
            </View>

            <View style={styles.textContainer}>
              <Text style={styles.title}>Send a signal</Text>
              <Text style={styles.subtitle}>
                Let friends know you want to meet up
              </Text>
            </View>

            <View style={styles.arrowContainer}>
              <Ionicons
                name="chevron-forward"
                size={22}
                color="rgba(255, 255, 255, 0.9)"
              />
            </View>
          </View>

          {/* Inner highlight */}
          <View style={styles.innerHighlight} />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 20,
    width: '100%',
  },
  buttonContainer: {
    borderRadius: 18,
    overflow: 'hidden',
    width: '100%',
  },
  gradient: {
    paddingVertical: 22,
    paddingHorizontal: 28,
    position: 'relative',
    minHeight: 85,
  },
  disabledGradient: {
    opacity: 0.6,
  },
  outerGlow: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    backgroundColor: '#FF6B6B',
    opacity: 0.2,
    borderRadius: 21,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 3,
  },
  iconContainer: {
    marginRight: 18,
    position: 'relative',
  },
  iconBackground: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  iconPulse: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    opacity: 0.5,
  },
  textContainer: {
    flex: 1,
    marginRight: 18,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '500',
  },
  arrowContainer: {
    opacity: 0.9,
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    zIndex: 1,
  },
});

export default SendSignalButton;
