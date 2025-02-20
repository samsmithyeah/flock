// app/(main)/crews/_layout.tsx
import { Stack } from 'expo-router';

export default function CrewsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="crew-settings" options={{ title: 'Crew settings' }} />
    </Stack>
  );
}
