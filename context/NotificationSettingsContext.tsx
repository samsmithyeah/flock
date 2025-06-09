import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import {
  NotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
} from '@/types/NotificationSettings';

interface NotificationSettingsContextType {
  settings: NotificationSettings;
  loading: boolean;
  updateSettings: (newSettings: Partial<NotificationSettings>) => Promise<void>;
  toggleCategory: (category: keyof NotificationSettings) => Promise<void>;
  isNotificationEnabled: (category: keyof NotificationSettings) => boolean;
  error: string | null;
}

const NotificationSettingsContext = createContext<
  NotificationSettingsContextType | undefined
>(undefined);

export const NotificationSettingsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { user } = useUser();
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user's notification settings from the user object
  useEffect(() => {
    if (user?.notificationSettings) {
      setSettings({
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...user.notificationSettings,
      });
    } else {
      setSettings(DEFAULT_NOTIFICATION_SETTINGS);
    }
    setLoading(false);
  }, [user]);

  const updateSettings = async (newSettings: Partial<NotificationSettings>) => {
    if (!user?.uid) {
      setError('User not authenticated');
      throw new Error('User not authenticated');
    }

    try {
      setError(null);
      const updatedSettings = { ...settings, ...newSettings };

      // Update Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        notificationSettings: updatedSettings,
      });

      // Update local state
      setSettings(updatedSettings);
    } catch (err) {
      console.error('Failed to update notification settings:', err);
      setError('Failed to update notification settings');
      throw err;
    }
  };

  const toggleCategory = async (category: keyof NotificationSettings) => {
    await updateSettings({
      [category]: !settings[category],
    });
  };

  const isNotificationEnabled = (
    category: keyof NotificationSettings,
  ): boolean => {
    return settings[category];
  };

  const value: NotificationSettingsContextType = {
    settings,
    loading,
    updateSettings,
    toggleCategory,
    isNotificationEnabled,
    error,
  };

  return (
    <NotificationSettingsContext.Provider value={value}>
      {children}
    </NotificationSettingsContext.Provider>
  );
};

export const useNotificationSettings = (): NotificationSettingsContextType => {
  const context = useContext(NotificationSettingsContext);
  if (context === undefined) {
    throw new Error(
      'useNotificationSettings must be used within a NotificationSettingsProvider',
    );
  }
  return context;
};

// Utility function to check if a notification should be sent based on type
export const shouldSendNotification = (
  settings: NotificationSettings,
  notificationType: string,
): boolean => {
  // Map notification types to categories
  const notificationTypeToCategory: Record<string, keyof NotificationSettings> =
    {
      // Messages & Communication
      new_message: 'messagesAndCommunication',
      poke_crew: 'messagesAndCommunication',
      crew_chat_message: 'messagesAndCommunication',

      // Crew Management
      crew_invitation: 'crewManagement',
      crew_member_joined: 'crewManagement',
      crew_member_left: 'crewManagement',
      crew_updated: 'crewManagement',
      crew_disbanded: 'crewManagement',
      crew_role_changed: 'crewManagement',
      crew_member_kicked: 'crewManagement',

      // Events & Planning
      event_created: 'eventsAndPlanning',
      event_updated: 'eventsAndPlanning',
      event_cancelled: 'eventsAndPlanning',

      // Polls & Voting
      poll_created: 'pollsAndVoting',
      poll_vote_cast: 'pollsAndVoting',
      poll_completed: 'pollsAndVoting',
      poll_updated: 'pollsAndVoting',
      poll_reminder: 'pollsAndVoting',
      poll_deadline_approaching: 'pollsAndVoting',

      // Status & Activity
      user_status_changed: 'statusAndActivity',
      friend_went_online: 'statusAndActivity',
      activity_summary: 'statusAndActivity',

      // Signals & Location
      signal_received: 'signalsAndLocation',
      location_shared: 'signalsAndLocation',

      // Social & Discovery
      friend_request: 'socialAndDiscovery',
    };

  const category = notificationTypeToCategory[notificationType];
  if (!category) {
    // If we don't know the category, default to sending the notification
    console.warn(`Unknown notification type: ${notificationType}`);
    return true;
  }

  return settings[category];
};
