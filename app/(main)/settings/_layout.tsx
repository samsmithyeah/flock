// app/(main)/settings/_layout.tsx
import { Stack } from 'expo-router';

export default function SettingsStackLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: 'Profile', headerShown: false }}
      />
      <Stack.Screen
        name="edit-profile"
        options={{ title: 'Edit profile', presentation: 'modal' }}
      />
      <Stack.Screen
        name="notification-preferences"
        options={{ title: 'Notification preferences' }}
      />
    </Stack>
  );
}
