import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { User } from '@/types/User';
import { useUser } from '@/context/UserContext';
import CustomButton from '@/components/CustomButton';
import MemberList from '@/components/MemberList';
import { getFormattedDate } from '@/utils/dateHelpers';
import { CrewEvent } from '@/types/CrewEvent';

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
  onEditEvent?: (day: string, event: CrewEvent) => void;
  onViewEvent?: (event: CrewEvent) => void;
  width?: string | number;
  margin?: number;
}

// Your chosen palette
const eventColors = [
  '#FFB300',
  '#F4511E',
  '#8E24AA',
  '#3949AB',
  '#00897B',
  '#616161',
  '#EF6C00',
  '#26A69A',
  '#7E57C2',
  '#00ACC1',
  '#5C6BC0',
  '#43A047',
  '#9E9D24',
  '#D81B60',
  '#8D6E63',
  '#78909C',
  '#1E88E5',
  '#C0CA33',
  '#FB8C00',
  '#4E342E',
];

// Minimal string hashing function
const getHash = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
};

// Derive a color index from the event ID’s hash
const getEventColor = (eventId: string): string => {
  const hash = Math.abs(getHash(eventId));
  return eventColors[hash % eventColors.length];
};

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
  onEditEvent,
  onViewEvent,
  events = [],
}) => {
  const { user } = useUser();
  const isEventCreator = (event: CrewEvent) => event.createdBy === user?.uid;

  const handlePillPress = (event: CrewEvent) => {
    if (isEventCreator(event)) {
      onEditEvent?.(day, event);
    } else {
      onViewEvent?.(event);
    }
  };

  return (
    <View style={styles.dayContainer}>
      <View>
        <Text style={styles.dayHeader}>{getFormattedDate(day)}</Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.eventsContainer}
        >
          {events.map((evt) => {
            const pillColor = getEventColor(evt.id);

            // If it's unconfirmed, we’ll reduce opacity and show an icon
            const eventPillStyles = [
              styles.eventPill,
              { backgroundColor: pillColor },
              evt.unconfirmed && {
                opacity: 0.5,
                borderWidth: 1,
                borderStyle: 'dashed' as const,
                borderColor: '#fff',
              },
            ];

            return (
              <View key={evt.id} style={eventPillStyles}>
                <TouchableOpacity
                  style={styles.eventRow}
                  onPress={() => handlePillPress(evt)}
                >
                  <Text style={styles.eventPillText}>{evt.title}</Text>

                  <View style={{ flex: 1 }} />
                  {evt.unconfirmed && (
                    <Text style={styles.unconfirmedText}>unconfirmed</Text>
                  )}

                  {/* Editing icon if user is the event creator */}
                  {isEventCreator(evt) && (
                    <Ionicons
                      name="create-outline"
                      size={16}
                      color="#fff"
                      style={styles.editIcon}
                    />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
          {onAddEvent && (
            <TouchableOpacity
              style={[styles.addEventPill, styles.addPill]}
              onPress={() => onAddEvent(day)}
            >
              <Text style={styles.eventPillText}>+ add an event</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <CustomButton
          title={userIsUp ? "You're in" : 'Count me in'}
          variant={userIsUp ? 'secondary' : 'primary'}
          onPress={() => toggleDayStatus(day)}
          icon={{ name: userIsUp ? 'star' : 'star-outline', size: 18 }}
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

export default DayContainer;

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
  eventsContainer: {
    flexDirection: 'column',
    paddingVertical: 8,
  },
  eventPill: {
    width: '100%',
    borderRadius: 6,
    paddingVertical: 1,
    paddingHorizontal: 10,
    marginBottom: 2,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  addEventPill: {
    width: '50%',
    borderRadius: 6,
    paddingVertical: 1,
    paddingHorizontal: 10,
    marginBottom: 2,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editIcon: {
    marginLeft: 6,
  },
  unconfirmedText: {
    fontSize: 12,
    color: '#fff',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  eventPillText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
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
