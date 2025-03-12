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
      <Stack.Screen
        name="add-members"
        options={{ title: 'Add members', presentation: 'modal' }}
      />
      <Stack.Screen
        name="[crewId]"
        options={{ title: 'Crew', headerShown: true }}
      />
      <Stack.Screen
        name="[crewId]/calendar"
        options={{ title: 'Crew Calendar' }}
      />
      <Stack.Screen name="event-poll" options={{ title: 'Date Polls' }} />
      <Stack.Screen
        name="event-poll/create"
        options={{
          title: 'Create Date Poll',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="event-poll/[pollId]"
        options={{ title: 'Poll Details' }}
      />
      <Stack.Screen
        name="event-poll/respond"
        options={{ title: 'Respond to poll' }}
      />
    </Stack>
  );
}
