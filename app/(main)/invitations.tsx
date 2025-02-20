// screens/InvitationsScreen.tsx

import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenTitle from '@/components/ScreenTitle';
import InvitationCard from '@/components/InvitationCard';
import { useInvitations } from '@/context/InvitationsContext';
import { InvitationWithDetails } from '@/types/Invitation';
import useglobalStyles from '@/styles/globalStyles';

const InvitationsScreen: React.FC = () => {
  const { invitations, loading, acceptInvitation, declineInvitation } =
    useInvitations();
  const globalStyles = useglobalStyles();

  const renderItem = ({ item }: { item: InvitationWithDetails }) => (
    <InvitationCard
      invitation={item}
      onAccept={() => acceptInvitation(item)}
      onDecline={() => declineInvitation(item)}
    />
  );

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  return (
    <View style={globalStyles.container}>
      <ScreenTitle title="Invitations" />
      {invitations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="mail-open-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>No invitations found</Text>
        </View>
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
        />
      )}
    </View>
  );
};

export default InvitationsScreen;

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 20,
    fontSize: 18,
    color: '#666',
  },
});
