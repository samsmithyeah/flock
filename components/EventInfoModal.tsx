// /components/EventInfoModal.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import CustomModal from '@/components/CustomModal';
import { getFormattedDate } from '@/utils/dateHelpers';
import { CrewEvent } from '@/types/CrewEvent';
import { useCrews } from '@/context/CrewsContext';
import { User } from '@/types/User';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Ionicons } from '@expo/vector-icons';

type EventInfoModalProps = {
  isVisible: boolean;
  onClose: () => void;
  event: CrewEvent;
};

const EventInfoModal: React.FC<EventInfoModalProps> = ({
  isVisible,
  onClose,
  event,
}) => {
  const { usersCache, setUsersCache } = useCrews();
  const [creatorName, setCreatorName] = useState<string>('');

  useEffect(() => {
    const getCreatorName = async (uid: string) => {
      if (usersCache[uid]) {
        return usersCache[uid].displayName;
      }

      try {
        console.log('getDoc in EventInfoModal');
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const fetchedUser: User = {
            uid: userDoc.id,
            displayName: userData.displayName || 'Unnamed User',
            email: userData.email || '',
            photoURL: userData.photoURL || '',
          };
          // Update usersCache
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

      <View style={styles.dateContainer}>
        {event.startDate !== event.endDate ? (
          <>
            <Text style={styles.text}>
              {getFormattedDate(event.startDate, true)}
            </Text>
            <View style={styles.arrowIcon}>
              <Ionicons name="arrow-forward" size={16} color="#333" />
            </View>
            <Text style={styles.text}>
              {getFormattedDate(event.endDate, true)}
            </Text>
          </>
        ) : (
          <Text style={styles.text}>{getFormattedDate(event.startDate)}</Text>
        )}
      </View>

      <Text style={styles.label}>Location</Text>
      <Text style={styles.text}>
        {event.location || 'No location specified'}
      </Text>
      <Text style={styles.label}>Created by</Text>
      <Text style={styles.text}>{creatorName}</Text>
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
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowIcon: {
    marginHorizontal: 4,
  },
});
