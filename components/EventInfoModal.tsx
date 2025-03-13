// /components/EventInfoModal.tsx

import React, { useEffect, useState } from 'react';
import { Text, StyleSheet, Alert } from 'react-native';
import CustomModal from '@/components/CustomModal';
import { getFormattedDate } from '@/utils/dateHelpers';
import { CrewEvent } from '@/types/CrewEvent';
import { useCrews } from '@/context/CrewsContext';
import { User } from '@/types/User';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import CustomButton from '@/components/CustomButton';

type EventInfoModalProps = {
  isVisible: boolean;
  onClose: () => void;
  event: CrewEvent;
  onAddToCalendar?: () => void;
};

const EventInfoModal: React.FC<EventInfoModalProps> = ({
  isVisible,
  onClose,
  event,
  onAddToCalendar,
}) => {
  const { usersCache, setUsersCache } = useCrews();
  const [creatorName, setCreatorName] = useState<string>('');

  useEffect(() => {
    const getCreatorName = async (uid: string) => {
      if (usersCache[uid]) {
        return usersCache[uid].displayName;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const fetchedUser: User = {
            uid: userDoc.id,
            displayName: userData.displayName || 'Unnamed User',
            email: userData.email || '',
            photoURL: userData.photoURL || '',
          };
          setUsersCache((prev) => ({ ...prev, [uid]: fetchedUser }));
          return fetchedUser.displayName;
        } else {
          return 'Unknown User';
        }
      } catch (error) {
        console.error(`Error fetching user data for UID ${uid}:`, error);
        return 'Unknown User';
      }
    };

    getCreatorName(event.createdBy).then(setCreatorName);
  }, [event.createdBy]);

  const confirmAddToCalendar = () => {
    Alert.alert(
      'Add to phone calendar',
      'Do you want to add this event to your calendar?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () => {
            if (onAddToCalendar) onAddToCalendar();
          },
        },
      ],
    );
  };

  return (
    <CustomModal
      isVisible={isVisible}
      onClose={onClose}
      title="Event details"
      buttons={[
        {
          label: 'Close',
          onPress: onClose,
          variant: 'primary' as const,
        },
      ]}
    >
      <Text style={styles.label}>Event name</Text>
      <Text style={styles.text}>{event.title}</Text>

      <Text style={styles.label}>Event date</Text>
      <Text style={styles.text}>{getFormattedDate(event.date)}</Text>

      <Text style={styles.label}>Location</Text>
      <Text style={styles.text}>
        {event.location || 'No location specified'}
      </Text>
      <Text style={styles.label}>Created by</Text>
      <Text style={styles.text}>{creatorName}</Text>

      {onAddToCalendar && (
        <CustomButton
          title="Add to phone calendar"
          onPress={confirmAddToCalendar}
          variant="secondary"
          accessibilityLabel="Add to phone clendar"
          accessibilityHint="Add the current event to your phone's calendar"
          icon={{ name: 'calendar-outline' }}
          style={{ marginTop: 16 }}
        />
      )}
    </CustomModal>
  );
};

export default EventInfoModal;

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    color: '#333',
  },
  text: {
    fontSize: 16,
    color: '#555',
  },
});
