# Signal Feature Setup Guide

This guide will help you set up the Signal feature for immediate meetup requests in the GoingOutApp.

## Overview

The Signal feature allows users to:

- Send location-based meetup requests to nearby friends
- Choose radius and target audience (all contacts, specific crews, or contacts)
- Receive notifications when friends want to meet up nearby
- Accept signals and share locations for meetup coordination
- View shared locations with directions integration

## Prerequisites

- Existing GoingOutApp setup with Firebase
- Expo development environment
- Firebase Functions deployed
- Push notifications configured

## Installation Steps

### 1. Install Required Dependencies

```bash
cd GoingOutApp
npm install @react-native-community/slider
```

Note: `expo-location` should already be installed as part of Expo SDK.

### 2. Location Permissions Setup

#### iOS (ios/Info.plist)

Add the following permissions to your `ios/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>This app needs location access to send and receive meetup signals from nearby friends.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>This app needs location access to send and receive meetup signals from nearby friends.</string>
```

#### Android (android/app/src/main/AndroidManifest.xml)

Add the following permissions:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

### 3. Firebase Functions Deployment

Deploy the new Signal functions:

```bash
cd functions
npm run build
firebase deploy --only functions:processSignal,functions:updateUserLocation,functions:respondToSignal,functions:getLocationSharing
```

### 4. Firestore Security Rules

The Firestore security rules have been updated to include Signal collections. Deploy them:

```bash
firebase deploy --only firestore:rules
```

### 5. Firestore Indexes

Create the following indexes in the Firebase Console or using the Firebase CLI:

#### Signals Collection

- Collection: `signals`
- Fields: `senderId` (Ascending), `status` (Ascending)
- Fields: `status` (Ascending), `createdAt` (Descending)

#### Location Sharing Collection

- Collection: `locationSharing`
- Fields: `signalId` (Ascending), `status` (Ascending)
- Fields: `senderId` (Ascending), `status` (Ascending)
- Fields: `responderId` (Ascending), `status` (Ascending)

Create indexes using Firebase CLI:

```bash
firebase firestore:indexes
```

## Configuration

### 1. App Configuration

Ensure your `app.json` includes location permissions:

```json
{
  "expo": {
    "permissions": ["LOCATION", "LOCATION_FOREGROUND"],
    "ios": {
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "This app needs location access to send and receive meetup signals from nearby friends."
      }
    },
    "android": {
      "permissions": ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"]
    }
  }
}
```

### 2. Firebase Configuration

Ensure your Firebase project has:

- Cloud Functions enabled
- Firestore database created
- Push notifications configured (FCM for Android, APNs for iOS)

## Usage

### 1. Sending a Signal

1. Navigate to the Signal tab in the app
2. Grant location permission when prompted
3. Set your desired radius (100m - 5km)
4. Choose who to notify:
   - All Contacts: Notifies all your contacts within radius
   - Specific Crews: Select which crews to notify
5. Add an optional message
6. Tap "Send Signal"

### 2. Receiving Signals

- Users receive push notifications when someone nearby sends a signal
- Notifications include distance and sender information
- Users can accept or ignore signals from the Signal screen

### 3. Location Sharing

- When a user accepts a signal, both parties' locations are shared
- Location sharing expires after 30 minutes
- Users can view shared locations and get directions

## Testing

### 1. Local Testing

1. Use iOS Simulator or Android Emulator with location simulation
2. Set up multiple test accounts
3. Simulate different locations for testing proximity

### 2. Device Testing

1. Install the app on multiple physical devices
2. Ensure devices are in different locations for radius testing
3. Test notification delivery and location sharing

### 3. Function Testing

Test the Cloud Functions in the Firebase Console:

```javascript
// Test updateUserLocation
{
  "latitude": 37.7749,
  "longitude": -122.4194
}

// Test respondToSignal
{
  "signalId": "test-signal-id",
  "response": "accept",
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194
  }
}
```

## Troubleshooting

### Common Issues

1. **Location Permission Denied**

   - Ensure permissions are properly configured in Info.plist/AndroidManifest.xml
   - Check device location services are enabled

2. **Notifications Not Received**

   - Verify push notification setup
   - Check Firebase Functions logs
   - Ensure Expo push tokens are valid

3. **Distance Calculation Issues**

   - Verify Haversine formula implementation
   - Check coordinate precision and format

4. **Function Deployment Errors**
   - Ensure all dependencies are installed in functions/package.json
   - Check Node.js version compatibility
   - Verify Firebase project permissions

### Debugging

1. **Check Firebase Functions Logs:**

   ```bash
   firebase functions:log
   ```

2. **Monitor Firestore Activity:**
   Use Firebase Console to monitor document writes and reads

3. **Test Push Notifications:**
   Use Expo's push notification tool to test token validity

## Security Considerations

1. **Location Privacy:**

   - Locations are only shared for 30 minutes after signal acceptance
   - Location data is stored temporarily and automatically cleaned up

2. **Signal Targeting:**

   - Users can only signal their contacts or crew members
   - Signals respect crew membership and contact relationships

3. **Rate Limiting:**
   - Consider implementing rate limiting for signal creation
   - Monitor for abuse patterns

## Performance Optimization

1. **Location Updates:**

   - Implement location caching to reduce API calls
   - Use appropriate location accuracy settings

2. **Firestore Queries:**

   - Indexes are created for efficient querying
   - Pagination is implemented for large result sets

3. **Push Notifications:**
   - Batch notifications for better performance
   - Use appropriate TTL values

## Future Enhancements

Potential improvements to consider:

1. **Group Signals:** Allow signaling multiple crews simultaneously
2. **Recurring Signals:** Set up scheduled or recurring signals
3. **Signal History:** Track and display signal activity history
4. **Enhanced Privacy:** More granular location sharing controls
5. **Signal Templates:** Pre-defined signal messages and settings

## Support

For issues or questions:

1. Check Firebase Console for function errors
2. Review device logs for permission issues
3. Test with simplified scenarios first
4. Verify all setup steps have been completed
