// app/(main)/signal/_layout.tsx
import { Stack } from 'expo-router';

export default function SignalLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Bat Signal' }} />
    </Stack>
  );
}
