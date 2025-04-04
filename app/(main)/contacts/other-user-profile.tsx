// app/(main)/contacts/other-user-profile.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { User } from '@/types/User';
import ProfilePicturePicker from '@/components/ProfilePicturePicker';
import CustomButton from '@/components/CustomButton';
import Colors from '@/styles/colors';
import moment from 'moment';
import { useCrews } from '@/context/CrewsContext';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';

const OtherUserProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { fetchUserDetails } = useCrews();

  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!userId) {
        console.log('User ID not provided');
        setLoading(false);
        return;
      }
      try {
        const user = await fetchUserDetails(userId);
        setUserProfile(user);
      } catch (error) {
        console.error('Error fetching user profile:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchUserProfile();
  }, [userId, fetchUserDetails]);

  useEffect(() => {
    navigation.setOptions({
      title: userProfile?.displayName || 'User Profile',
    });
  }, [navigation, userProfile]);

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  if (!userProfile) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>User profile not available.</Text>
      </View>
    );
  }

  const getStatusText = () => {
    if (userProfile.lastSeen) {
      const lastSeenMoment = moment(userProfile.lastSeen.toDate());
      const now = moment();
      if (lastSeenMoment.isSame(now, 'day')) {
        return `Today at ${lastSeenMoment.format('h:mma')}`;
      } else if (lastSeenMoment.isSame(now.subtract(1, 'day'), 'day')) {
        return `Yesterday at ${lastSeenMoment.format('h:mma')}`;
      } else {
        return lastSeenMoment.format('MMM Do, YYYY [at] h:mma');
      }
    } else {
      return 'N/A';
    }
  };

  return (
    <View style={styles.container}>
      <ProfilePicturePicker
        imageUrl={userProfile.photoURL ?? null}
        onImageUpdate={() => {}}
        editable={false}
        storagePath={`users/${userProfile.uid}/profile.jpg`}
        size={150}
      />
      <View style={styles.infoContainer}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>Status: </Text>
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: userProfile.isOnline ? '#2ecc71' : '#e74c3c',
                },
              ]}
            />
            <Text style={styles.infoValue}>
              {userProfile.isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
        {!userProfile.isOnline && (
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Last seen: </Text>

            <Text style={styles.infoValue}>{getStatusText()}</Text>
          </View>
        )}
      </View>
      <View style={styles.chatButton}>
        <CustomButton
          title={`Send a message to ${userProfile.displayName}`}
          onPress={() =>
            router.push(
              {
                pathname: '/chats/dm-chat',
                params: {
                  otherUserId: userProfile.uid,
                },
              },
              { withAnchor: true },
            )
          }
          icon={{
            name: 'chatbubble-ellipses-outline',
            size: 24,
          }}
          accessibilityLabel="Open Chat"
          accessibilityHint="Navigate to crew date chat"
        />
      </View>
    </View>
  );
};

export default OtherUserProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginTop: 20,
    borderColor: '#E0E0E0',
    borderWidth: 1,
  },
  infoItem: {
    flexDirection: 'row',
    marginVertical: 8,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 5,
    width: '30%',
  },
  infoValue: {
    fontSize: 16,
    color: '#555',
    flexShrink: 1,
  },
  errorText: {
    fontSize: 16,
    color: 'red',
  },
  chatButton: {
    marginTop: 20,
  },
});
