// navigation/TabNavigator.tsx

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import InvitationsScreen from '@/screens/InvitationsScreen';
import UserProfileStackNavigator from '@/navigation/UserProfileStackNavigator';
import DashboardStackNavigator from '@/navigation/DashboardStackNavigator';
import CrewsStackNavigator from '@/navigation/CrewsStackNavigator';
import { useInvitations } from '@/context/InvitationsContext';
import ChatsStackNavigator from '@/navigation/ChatsStackNavigator';
import { useDirectMessages } from '@/context/DirectMessagesContext';
import { useCrewDateChat } from '@/context/CrewDateChatContext';
import ContactsStackNavigator from '@/navigation/ContactsStackNavigator';

export type TabsParamList = {
  DashboardStack: undefined;
  CrewsStack: { screen: string; params: { crewId: string } };
  ContactsStack: undefined;
  Invitations: undefined;
  ChatsStack: undefined;
  UserProfileStack: undefined;
};

const Tab = createBottomTabNavigator<TabsParamList>();

const TabNavigator: React.FC = () => {
  const { pendingCount } = useInvitations();
  const { totalUnread: totalDMUnread } = useDirectMessages();
  const { totalUnread: totalGroupUnread } = useCrewDateChat();

  const getTotalUnread = () => {
    return totalDMUnread + totalGroupUnread;
  };

  return (
    <Tab.Navigator
      initialRouteName="DashboardStack"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="DashboardStack"
        component={DashboardStackNavigator}
        options={{
          title: 'Your week',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="CrewsStack"
        component={CrewsStackNavigator}
        options={{
          title: 'Crews',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ContactsStack"
        component={ContactsStackNavigator}
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-add-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Invitations"
        component={InvitationsScreen}
        options={{
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
      <Tab.Screen
        name="ChatsStack"
        component={ChatsStackNavigator}
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
      <Tab.Screen
        name="UserProfileStack"
        component={UserProfileStackNavigator}
        options={{
          title: 'Your profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

export default TabNavigator;
