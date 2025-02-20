// app/(main)/chats/_layout.tsx
import { Stack } from 'expo-router';

export default function ChatsStackLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
