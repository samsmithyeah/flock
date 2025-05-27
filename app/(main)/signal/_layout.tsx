import { Stack } from 'expo-router';

export default function SignalStackLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: 'Signals', headerShown: false }}
      />
      <Stack.Screen
        name="send"
        options={{ title: 'Send signal', presentation: 'modal' }}
      />
    </Stack>
  );
}
