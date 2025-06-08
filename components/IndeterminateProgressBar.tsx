import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const IndeterminateProgressBar: React.FC = () => {
  const animation = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (containerWidth > 0) {
      Animated.loop(
        Animated.timing(animation, {
          toValue: 1,
          duration: 1200, // Faster animation for a more active feel
          easing: Easing.inOut(Easing.ease), // Smoother start and end
          useNativeDriver: true, // Offloads animation to the native thread
        }),
      ).start();
    }
  }, [animation, containerWidth]);

  const translateX =
    containerWidth > 0
      ? animation.interpolate({
          inputRange: [0, 1],
          // Move from just off-screen left to just off-screen right
          outputRange: [-100, containerWidth],
        })
      : -100;

  return (
    <View
      style={styles.container}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.shimmer, { transform: [{ translateX }] }]}>
        <LinearGradient
          colors={['transparent', 'rgba(30, 144, 255, 0.5)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 6, // Slightly thicker for better visibility
    width: '80%',
    backgroundColor: 'rgba(30, 144, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 100, // Fixed width for the shimmer itself
  },
  gradient: {
    width: '100%',
    height: '100%',
  },
});

export default IndeterminateProgressBar;
