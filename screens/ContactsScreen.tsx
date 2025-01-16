// src/screens/ContactsScreen.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useContacts } from '@/context/ContactsContext';
import MemberList from '@/components/MemberList';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { NavParamList } from '@/navigation/AppNavigator';
import { User } from '@/types/User';
import ScreenTitle from '@/components/ScreenTitle';
import useglobalStyles from '@/styles/globalStyles';
import CustomSearchInput from '@/components/CustomSearchInput';
import LoadingOverlay from '@/components/LoadingOverlay';
import { Ionicons } from '@expo/vector-icons';

type ContactsScreenProp = NativeStackNavigationProp<NavParamList, 'Contacts'>;

const ContactsScreen: React.FC = () => {
  const { allContacts, loading, error, refreshContacts } = useContacts();
  const globalStyles = useglobalStyles();
  const navigation = useNavigation<ContactsScreenProp>();

  const [searchQuery, setSearchQuery] = useState<string>(''); // State for search
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]); // State for filtered contacts

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredUsers(allContacts);
    } else {
      const filtered = allContacts.filter((user) =>
        user.displayName.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      setFilteredUsers(filtered);
    }
  }, [searchQuery, allContacts]);

  const handleContactPress = (contact: User) => {
    // Navigate to the member's profile or perform another action
    navigation.navigate('OtherUserProfile', { userId: contact.uid });
  };

  // Render the empty state UI
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="people-outline" size={64} color="#888" />
      <Text style={styles.emptyText}>No contacts found</Text>
      {/* <CustomButton title="Refresh Contacts" onPress={refreshContacts} /> */}
    </View>
  );

  return (
    <>
      {/* Loading Overlay */}
      {loading && <LoadingOverlay />}
      <View style={globalStyles.container}>
        {/* Error State */}
        {error && !loading && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              onPress={refreshContacts}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Main Content */}
        {!loading && !error && (
          <>
            {/* Screen Title */}
            <ScreenTitle title="Contacts" />

            {/* Search Bar */}
            <CustomSearchInput
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
            />

            {/* Conditional Rendering based on filtered users */}
            {filteredUsers.length === 0 ? (
              renderEmptyState()
            ) : (
              <MemberList
                members={filteredUsers}
                currentUserId={''}
                onMemberPress={handleContactPress}
                isLoading={loading}
                emptyMessage="No registered contacts found."
                scrollEnabled
              />
            )}
          </>
        )}
      </View>
    </>
  );
};

export default ContactsScreen;

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1e90ff',
    borderRadius: 5,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyText: {
    fontSize: 18,
    color: '#555',
    marginTop: 16,
    textAlign: 'center',
  },
});
