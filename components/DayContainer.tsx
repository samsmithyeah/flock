import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import CustomButton from '@/components/CustomButton';
import MemberList from '@/components/MemberList';
import { User } from '@/types/User';
import { getFormattedDate } from '@/utils/dateHelpers';
import { useUser } from '@/context/UserContext';

export interface CrewEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  description?: string;
  createdBy: string;
}

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
  events?: CrewEvent[];
  onAddEvent?: (day: string) => void;
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
  onAddEvent,
  events = [],
}) => {
  const { user } = useUser();

  const eventColors = [
    '#FFB300',
    '#F4511E',
    '#8E24AA',
    '#3949AB',
    '#00897B',
    '#616161',
  ];

  return (
    <View style={styles.dayContainer}>
      {/* Top Section */}
      <View>
        <Text style={styles.dayHeader}>{getFormattedDate(day)}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.eventsRow}
        >
          {events.map((evt, index) => (
            <View
              key={evt.id}
              style={[
                styles.eventPill,
                { backgroundColor: eventColors[index % eventColors.length] },
              ]}
            >
              <Text style={styles.eventPillText}>{evt.title}</Text>
            </View>
          ))}
          {onAddEvent && (
            <View style={[styles.eventPill, styles.addPill]}>
              <Text
                style={styles.eventPillText}
                onPress={() => onAddEvent(day)}
              >
                + add an event
              </Text>
            </View>
          )}
        </ScrollView>
        <CustomButton
          title={userIsUp ? "You're in" : 'Count me in'}
          variant={userIsUp ? 'secondary' : 'primary'}
          onPress={() => toggleDayStatus(day)}
          icon={{
            name: userIsUp ? 'star' : 'star-outline',
            size: 18,
          }}
        />
        {!userIsUp && (
          <Text style={styles.joinPrompt}>
            Join to see who's up for {getCrewActivity()}.
          </Text>
        )}

        {userIsUp && (
          <>
            <Text style={styles.countText}>
              {totalUp} of {totalMembers} up for {getCrewActivity()}:
            </Text>
            <View style={styles.memberListContainer}>
              <MemberList
                members={upForItMembers}
                currentUserId={user?.uid ?? null}
                emptyMessage="No one's up for it yet"
                onMemberPress={navigateToUserProfile}
                scrollEnabled
              />
            </View>
          </>
        )}
      </View>

      {/* Bottom Section */}
      <View style={styles.bottomSection}>
        {userIsUp && (
          <>
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
        )}
      </View>
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
    flex: 1,
    flexDirection: 'column',
  },
  eventsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  eventPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 8,
    minWidth: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventPillText: {
    color: '#fff',
    fontWeight: '600',
  },
  addPill: {
    backgroundColor: '#90d5ff',
  },
  dayHeader: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  countText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  memberListContainer: {
    marginBottom: 8,
  },
  bottomSection: {
    marginTop: 'auto',
    paddingTop: 16,
  },
  actionButton: {
    marginTop: 8,
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
});
export default DayContainer;
