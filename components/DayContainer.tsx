import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import CustomButton from '@/components/CustomButton';
import MemberList from '@/components/MemberList';
import { User } from '@/types/User';
import { getFormattedDate } from '@/utils/dateHelpers';
import { useUser } from '@/context/UserContext';

interface DayContainerProps {
  day: string;
  userIsUp: boolean;
  upForItMembers: User[];
  totalUp: number;
  totalMembers: number;
  getCrewActivity: () => string;
  toggleDayStatus: (day: string) => void;
  navigateToDayChat: (day: string) => void;
  handlePokeCrew: (day: string) => void;
  navigateToUserProfile: (user: User) => void;
  width?: string | number;
  margin?: number;
}

const DayContainer: React.FC<DayContainerProps> = ({
  day,
  userIsUp,
  upForItMembers,
  totalUp,
  totalMembers,
  getCrewActivity,
  toggleDayStatus,
  navigateToDayChat,
  handlePokeCrew,
  navigateToUserProfile,
  width = '100%',
}) => {
  const { user } = useUser();
  return (
    <View style={styles.dayContainer}>
      <Text style={styles.dayHeader}>{getFormattedDate(day)}</Text>

      <CustomButton
        title={userIsUp ? "You're in" : 'Count me in'}
        variant={userIsUp ? 'secondary' : 'primary'}
        onPress={() => toggleDayStatus(day)}
        icon={{
          name: userIsUp ? 'star' : 'star-outline',
          size: 18,
        }}
      />

      {userIsUp ? (
        <>
          <Text style={styles.countText}>
            {totalUp} of {totalMembers} up for {getCrewActivity()}
          </Text>
          <View style={styles.memberListContainer}>
            <MemberList
              members={upForItMembers}
              currentUserId={user?.uid ?? null}
              emptyMessage="No one's up yet"
              onMemberPress={navigateToUserProfile}
              scrollEnabled
            />
          </View>

          {totalUp > 1 && (
            <CustomButton
              title="Group chat"
              variant="secondary"
              onPress={() => navigateToDayChat(day)}
              icon={{ name: 'chatbubble-ellipses-outline', size: 18 }}
            />
          )}

          {totalUp < totalMembers && (
            <View style={styles.actionButton}>
              <CustomButton
                title="Poke the others"
                variant="secondary"
                onPress={() => handlePokeCrew(day)}
                icon={{ name: 'notifications-outline', size: 18 }}
              />
            </View>
          )}

          {totalUp === totalMembers && (
            <Text style={styles.everyoneInText}>Everyone is up for it!</Text>
          )}
        </>
      ) : (
        <Text style={styles.joinPrompt}>
          Join to see who’s up for {getCrewActivity()}.
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  dayContainer: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    justifyContent: 'flex-start',
    height: '100%',
    flex: 1,
  },
  dayHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  countText: {
    marginVertical: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  joinPrompt: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  everyoneInText: {
    marginTop: 8,
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
    textAlign: 'center',
  },
  actionButton: {
    marginTop: 8,
  },
  memberListContainer: {
    flex: 1,
    marginVertical: 8,
  },
});

export default DayContainer;
