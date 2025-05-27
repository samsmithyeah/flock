# Background Location Tracking Setup Guide

## Overview

The background location tracking feature allows users to receive signals even when the app is closed by automatically updating their location in the background.

## Implementation Components

### 1. Core Files Created/Modified

#### `/services/BackgroundLocationTask.ts`

- Defines the expo-task-manager background task
- Handles location updates in the background
- Updates Firebase with new location data
- Manages task registration and cleanup

#### `/context/SignalContext.tsx` (Updated)

- Added background location permission state
- Added background tracking active state
- Added methods for starting/stopping background tracking
- Integrated with existing location management

#### `/hooks/useBackgroundLocation.ts`

- Custom hook for managing background location state
- Provides convenient methods for toggling tracking
- Handles initialization logic

#### `/app/(main)/signal.tsx` (Updated)

- Added UI controls for background location tracking
- Toggle switch to enable/disable tracking
- Permission request button
- Status indicators

### 2. Configuration Updates

#### `app.json`

**iOS:**

- `UIBackgroundModes: ["location"]` - Enables background execution
- `NSLocationAlwaysUsageDescription` - Permission description
- `NSLocationAlwaysAndWhenInUseUsageDescription` - Enhanced description

**Android:**

- `ACCESS_BACKGROUND_LOCATION` - Background location permission
- `FOREGROUND_SERVICE` - Required for background location service
- `FOREGROUND_SERVICE_LOCATION` - Specific foreground service type

#### `package.json`

- `expo-task-manager` - Required for background tasks

## How It Works

### 1. Permission Flow

1. User enables background location toggle
2. App requests foreground location permission (if not granted)
3. App requests background location permission
4. User grants "Always" location access in system settings

### 2. Background Tracking

1. `startLocationUpdatesAsync` begins continuous location monitoring
2. Location updates trigger the background task every 30 seconds or 50 meters
3. Background task calls Firebase function to update user location
4. Foreground service notification keeps Android informed

### 3. Signal Reception

1. Other users send signals based on updated locations
2. Firebase Cloud Functions determine users within radius
3. Push notifications sent to eligible users
4. Users can respond even if they just opened the app

## Key Features

### Automatic Location Updates

- Updates every 30 seconds or when user moves 50+ meters
- Uses balanced accuracy for battery optimization
- Deferred updates batch changes when possible

### Battery Optimization

- Pauses updates automatically when stationary
- Uses efficient location accuracy settings
- Respects system battery optimization

### User Control

- Easy toggle to enable/disable tracking
- Clear permission requests with explanations
- Status indicators showing current state

### Privacy & Transparency

- Clear descriptions of why permissions are needed
- Foreground service notification on Android
- User can disable at any time

## Usage Examples

### Basic Usage in Component

```tsx
import { useBackgroundLocation } from '@/hooks/useBackgroundLocation';

const MyComponent = () => {
  const {
    backgroundLocationTrackingActive,
    toggleBackgroundTracking,
    isInitializing,
  } = useBackgroundLocation();

  return (
    <Switch
      value={backgroundLocationTrackingActive}
      onValueChange={toggleBackgroundTracking}
      disabled={isInitializing}
    />
  );
};
```

### Direct Context Usage

```tsx
import { useSignal } from '@/context/SignalContext';

const MyComponent = () => {
  const {
    backgroundLocationPermissionGranted,
    backgroundLocationTrackingActive,
    startBackgroundLocationTracking,
    stopBackgroundLocationTracking,
  } = useSignal();

  // Your component logic here
};
```

## Testing

### iOS Simulator

- Set custom location: Device → Location → Custom Location
- Background location won't actually work in simulator
- Test permission flows and UI states

### Physical Device

- Grant "Always" location permission when prompted
- Test with app in background/closed
- Monitor location updates in Firebase console
- Verify push notifications are received

### Android Testing

- Enable location services
- Grant background location permission
- Check foreground service notification appears
- Test signal reception with app closed

## Troubleshooting

### Common Issues

1. **Permission Denied**

   - User must grant "Always" location access
   - Check system settings if permission seems granted but tracking fails

2. **Battery Optimization**

   - Some Android devices aggressively kill background tasks
   - Users may need to disable battery optimization for the app

3. **Location Not Updating**

   - Check if background task is registered: `TaskManager.isTaskRegisteredAsync()`
   - Verify Firebase function is receiving location updates
   - Check expo-location permissions

4. **iOS Background App Refresh**
   - Ensure Background App Refresh is enabled for the app
   - Check iOS Settings → General → Background App Refresh

### Debugging

- Use console logs in background task to monitor location updates
- Check Firebase console for location update calls
- Monitor push notification delivery
- Use device logs to check for permission issues

## Security Considerations

### Data Privacy

- Location data is only stored as needed for signal functionality
- User can disable tracking at any time
- Clear permission descriptions explain data usage

### Permission Best Practices

- Request permissions progressively (foreground first, then background)
- Provide clear explanations for why permissions are needed
- Allow users to use core features without background location

## Future Enhancements

### Potential Improvements

1. **Smart Tracking**: Only track during certain hours or locations
2. **Battery Awareness**: Adjust tracking frequency based on battery level
3. **Location History**: Optional location history for improved signal accuracy
4. **Geofencing**: Create location-based triggers for automatic signals
5. **Privacy Controls**: More granular privacy settings for location sharing

### Performance Optimizations

1. **Adaptive Frequency**: Increase/decrease update frequency based on movement
2. **Network Awareness**: Batch updates when on cellular to save data
3. **Predictive Updates**: Use machine learning to predict when updates are needed
