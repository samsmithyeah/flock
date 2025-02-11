// navigation/UserProfileStackNavigator.tsx

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import UserProfileScreen from '@/screens/UserProfileScreen';
import EditUserProfileModal from '@/screens/EditUserProfileModal';

export type UserProfileStackParamList = {
  UserProfile: undefined;
  EditUserProfile: undefined;
};

const Stack = createStackNavigator<UserProfileStackParamList>();

const UserProfileStackNavigator: React.FC = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ headerTitle: 'Profile' }}
      />
      <Stack.Screen
        name="EditUserProfile"
        component={EditUserProfileModal}
        options={{
          headerTitle: 'Edit profile',
          headerBackTitleVisible: false,
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
};

export default UserProfileStackNavigator;
