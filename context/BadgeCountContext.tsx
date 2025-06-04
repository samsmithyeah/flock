// context/BadgeCountContext.tsx

import React, { useEffect, createContext, useContext } from 'react';
import { useCrewDateChat } from '@/context/CrewDateChatContext';
import { useDirectMessages } from '@/context/DirectMessagesContext';
import { useInvitations } from '@/context/InvitationsContext';
import { useSignal } from '@/context/SignalContext';
import { useCrewChat } from '@/context/CrewChatContext';
import { useUser } from '@/context/UserContext';
import Toast from 'react-native-toast-message';

interface BadgeCountContextType {
  totalBadgeCount: number;
  crewChatTotalUnread: number;
  crewDateTotalUnread: number;
  dmTotalUnread: number;
  invitationsPendingCount: number;
  unansweredSignalCount: number;
}

const BadgeCountContext = createContext<BadgeCountContextType | null>(null);

export const BadgeCountProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { totalUnread: crewDateTotalUnread } = useCrewDateChat();
  const { totalUnread: dmTotalUnread } = useDirectMessages();
  const { totalUnread: crewChatTotalUnread } = useCrewChat();
  const { pendingCount: invitationsPendingCount } = useInvitations();
  const { unansweredSignalCount } = useSignal();
  const { user, setBadgeCount } = useUser();

  const totalBadgeCount =
    crewChatTotalUnread +
    crewDateTotalUnread +
    dmTotalUnread +
    invitationsPendingCount +
    unansweredSignalCount;

  useEffect(() => {
    const updateBadgeCount = async () => {
      if (!user?.uid) return;

      try {
        await setBadgeCount(totalBadgeCount);
      } catch (error) {
        console.error('Error updating badge count:', error);
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'Could not update badge count',
        });
      }
    };

    updateBadgeCount();
  }, [totalBadgeCount, user, setBadgeCount]);

  const value: BadgeCountContextType = {
    totalBadgeCount,
    crewDateTotalUnread,
    dmTotalUnread,
    crewChatTotalUnread,
    invitationsPendingCount,
    unansweredSignalCount,
  };

  return (
    <BadgeCountContext.Provider value={value}>
      {children}
    </BadgeCountContext.Provider>
  );
};

export const useBadgeCount = () => {
  const context = useContext(BadgeCountContext);
  if (context === null) {
    throw new Error('useBadgeCount must be used within a BadgeCountProvider');
  }
  return context;
};
