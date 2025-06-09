import { NotificationSettings, DEFAULT_NOTIFICATION_SETTINGS } from '../types/NotificationSettings';

/**
 * Maps notification types to their corresponding categories
 */
export const NOTIFICATION_TYPE_TO_CATEGORY: Record<string, keyof NotificationSettings> = {
  // Messages & Communication
  'new_message': 'messagesAndCommunication',
  'poke_crew': 'messagesAndCommunication',
  'crew_chat_message': 'messagesAndCommunication',

  // Crew Management
  'crew_invitation': 'crewManagement',
  'crew_member_joined': 'crewManagement',
  'crew_member_left': 'crewManagement',
  'crew_updated': 'crewManagement',
  'crew_disbanded': 'crewManagement',
  'crew_role_changed': 'crewManagement',
  'crew_member_kicked': 'crewManagement',

  // Events & Planning
  'event_created': 'eventsAndPlanning',
  'event_updated': 'eventsAndPlanning',
  'event_cancelled': 'eventsAndPlanning',

  // Polls & Voting
  'poll_created': 'pollsAndVoting',
  'poll_vote_cast': 'pollsAndVoting',
  'poll_completed': 'pollsAndVoting',
  'poll_updated': 'pollsAndVoting',
  'poll_reminder': 'pollsAndVoting',
  'poll_deadline_approaching': 'pollsAndVoting',

  // Status & Activity
  'user_status_changed': 'statusAndActivity',
  'friend_went_online': 'statusAndActivity',
  'activity_summary': 'statusAndActivity',

  // Signals & Location
  'signal_received': 'signalsAndLocation',
  'location_shared': 'signalsAndLocation',

  // Social & Discovery
  'friend_request': 'socialAndDiscovery',
};

/**
 * Checks if a notification should be sent based on user's notification settings
 * @param {NotificationSettings | undefined} userNotificationSettings The user's notification settings (can be undefined)
 * @param {string} notificationType The type of notification being sent
 * @return {boolean} true if the notification should be sent, false otherwise
 */
export function shouldSendNotification(
  userNotificationSettings: NotificationSettings | undefined,
  notificationType: string
): boolean {
  // Use default settings if user hasn't configured any preferences
  const settings = userNotificationSettings || DEFAULT_NOTIFICATION_SETTINGS;

  // Map notification type to category
  const category = NOTIFICATION_TYPE_TO_CATEGORY[notificationType];

  if (!category) {
    console.warn(`Unknown notification type: ${notificationType}. Defaulting to send.`);
    return true; // If we don't know the category, default to sending
  }

  return settings[category];
}

/**
 * Gets the category for a notification type
 * @param {string} notificationType The notification type
 * @return {string|null} The category name or null if unknown
 */
export function getNotificationCategory(notificationType: string): keyof NotificationSettings | null {
  return NOTIFICATION_TYPE_TO_CATEGORY[notificationType] || null;
}
