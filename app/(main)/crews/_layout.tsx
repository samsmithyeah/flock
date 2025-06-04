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
      <Stack.Screen
        name="invitations"
        options={{ title: 'Crew invitations' }}
      />
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
        options={{ title: 'Crew calendar' }}
      />
      <Stack.Screen name="event-poll/index" options={{ title: 'Date polls' }} />
      <Stack.Screen
        name="event-poll/create"
        options={{
          title: 'Create date poll',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="event-poll/edit"
        options={{
          title: 'Edit poll',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="event-poll/[pollId]"
        options={{
          title: 'Poll details',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="event-poll/respond"
        options={{ title: 'Respond to poll', presentation: 'modal' }}
      />
    </Stack>
  );
}
