// types/NotificationSettings.ts

export interface NotificationSettings {
  messagesAndCommunication: boolean;
  crewManagement: boolean;
  eventsAndPlanning: boolean;
  pollsAndVoting: boolean;
  statusAndActivity: boolean;
  signalsAndLocation: boolean;
  socialAndDiscovery: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  messagesAndCommunication: true,
  crewManagement: true,
  eventsAndPlanning: true,
  pollsAndVoting: true,
  statusAndActivity: true,
  signalsAndLocation: true,
  socialAndDiscovery: true,
};

export const NOTIFICATION_CATEGORIES = {
  messagesAndCommunication: {
    title: 'Messages & communication',
    description: 'New messages in crew chats, direct messages, and group chats',
    icon: 'chatbubble-ellipses-outline' as const,
  },
  crewManagement: {
    title: 'Crew management',
    description: 'Crew invitations, member changes, and crew updates',
    icon: 'people-outline' as const,
  },
  eventsAndPlanning: {
    title: 'Events & planning',
    description: 'Event reminders and planning notifications',
    icon: 'calendar-outline' as const,
  },
  pollsAndVoting: {
    title: 'Polls & voting',
    description: 'New polls, responses, and voting reminders',
    icon: 'bar-chart-outline' as const,
  },
  statusAndActivity: {
    title: 'Status & activity',
    description: 'Availability changes and activity updates',
    icon: 'pulse-outline' as const,
  },
  signalsAndLocation: {
    title: 'Signals & location',
    description: 'Location-based signals and responses',
    icon: 'radio-outline' as const,
  },
  socialAndDiscovery: {
    title: 'Social & discovery',
    description: 'When friends join the app',
    icon: 'person-add-outline' as const,
  },
} as const;
