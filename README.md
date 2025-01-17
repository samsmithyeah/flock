# Flock

Flock is a React Native app designed to help friends coordinate impromptu meetups effortlessly. Built with Expo and Firebase, Flock provides a simple and intuitive interface to make organizing social gatherings easier and more spontaneous.

## Features

- **Discover Availability**: Quickly check who’s free to hang out.
- **Chat**: In-app chat with your friends with dynamically created group chats.
- **Push Notifications**: Stay informed when your friends are free or send you a message.
- **Cross-Platform**: Runs on both iOS and Android.

## Getting Started

Follow these instructions to get Flock up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Firebase CLI](https://firebase.google.com/docs/cli)

### Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/samsmithyeah/flock.git
   cd flock
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Install expo dev client:

   ```bash
   npx expo install expo-dev-client
   ```

4. Run the application:
   ```bash
   npx expo run:ios
   ```
   or:
   ```bash
   npx expo run:android
   ```

## Firebase Integration

### Setup Firebase

1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable the services required for the app:
   - Firestore
   - Authentication (Email/password and Google)
   - Cloud Functions
   - Cloud Messaging (including connection with Apple APNs)
3. Download the configuration files and put in project root folder:
   - `google-services.json` (for Android)
   - `GoogleService-Info.plist` (for iOS)
4. Update the config in firebase.ts for your firebase account

### Deploying Cloud Functions

1. Navigate to the `functions` directory:

   ```bash
   cd functions
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Log in to Firebase CLI:

   ```bash
   firebase login
   ```

4. Initialize Firebase Functions (if not already done):

   ```bash
   firebase init functions
   ```

   - Select your Firebase project.
   - Choose the language for Cloud Functions (JavaScript or TypeScript).

5. Deploy functions:

   ```bash
   firebase deploy --only functions
   ```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE.txt) file for details.

## Contact

For any questions or feedback, feel free to reach out to [sam@sammysmith.co.uk](mailto:sam@sammysmith.co.uk).
