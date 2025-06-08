import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Colors from '@/styles/colors';
import IndeterminateProgressBar from './IndeterminateProgressBar';

const InitialLoadingScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/images/flock-transparent.png')}
        style={styles.logo}
        contentFit="contain"
      />
      <Text style={styles.loadingText}>Getting things ready...</Text>
      <IndeterminateProgressBar />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.flock,
    position: 'absolute',
    width: '100%',
    height: '100%',
    zIndex: 999, // Make sure it's on top
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
  },
});

export default InitialLoadingScreen;
