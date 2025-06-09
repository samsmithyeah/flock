// functions/src/types/NotificationSettings.ts

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
