// app/(main)/profile/_layout.tsx
import { Stack } from 'expo-router';

export default function ProfileStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
      <Stack.Screen
        name="edit"
        options={{ title: 'Edit profile', presentation: 'modal' }}
      />
    </Stack>
  );
}
