// app/(main)/contacts/_layout.tsx
import { Stack } from 'expo-router';

export default function ContactsStackLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="other-user-profile" />
    </Stack>
  );
}
