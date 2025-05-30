// app/(main)/_layout.tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInvitations } from '@/context/InvitationsContext';
import { useDirectMessages } from '@/context/DirectMessagesContext';
import { useCrewDateChat } from '@/context/CrewDateChatContext';
import { useSignal } from '@/context/SignalContext';

export default function MainLayout() {
  const { pendingCount } = useInvitations();
  const { totalUnread: totalDMUnread } = useDirectMessages();
  const { totalUnread: totalGroupUnread } = useCrewDateChat();
  const { unansweredSignalCount } = useSignal();

  const getTotalUnread = () => totalDMUnread + totalGroupUnread;

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Your week',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="crews"
        options={{
          title: 'Crews',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="signal"
        options={{
          title: 'Signal',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="radio-outline" size={size} color={color} />
          ),
          tabBarBadge:
            unansweredSignalCount > 0
              ? unansweredSignalCount > 99
                ? '99+'
                : unansweredSignalCount
              : undefined,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-add-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="invitations"
        options={{
          title: 'Invitations',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mail-outline" size={size} color={color} />
          ),
          tabBarBadge:
            pendingCount > 0
              ? pendingCount > 99
                ? '99+'
                : pendingCount
              : undefined,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
          tabBarBadge:
            getTotalUnread() > 0
              ? getTotalUnread() > 99
                ? '99+'
                : getTotalUnread()
              : undefined,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
