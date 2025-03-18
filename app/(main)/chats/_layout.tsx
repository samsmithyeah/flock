// app/(main)/chats/_layout.tsx
import { Stack } from 'expo-router';

export default function ChatsStackLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="dm-chat" />
      <Stack.Screen name="crew-date-chat" />
      <Stack.Screen name="crew-chat" />
    </Stack>
  );
}
