// components/InvitationCard.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { InvitationWithDetails } from '@/types/Invitation';

interface InvitationCardProps {
  invitation: InvitationWithDetails;
  onAccept: () => void;
  onDecline: () => void;
}

const InvitationCard: React.FC<InvitationCardProps> = ({
  invitation,
  onAccept,
  onDecline,
}) => {
  return (
    <View style={styles.card}>
      {invitation.crew?.iconUrl ? (
        <Image
          source={{ uri: invitation.crew.iconUrl }}
          style={styles.crewImage}
        />
      ) : (
        <View style={styles.placeholderImage}>
          <Ionicons name="people-outline" size={24} color="#888" />
        </View>
      )}
      <View style={styles.cardContent}>
        <Text style={styles.crewName}>{invitation.crew?.name}</Text>
        <Text style={styles.inviterName}>
          Invited by {invitation.inviter?.displayName}
        </Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={onAccept}
            accessibilityLabel={`Accept invitation to join ${invitation.crew?.name}`}
          >
            <Ionicons name="checkmark-circle" size={30} color="#28a745" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.declineButton}
            onPress={onDecline}
            accessibilityLabel={`Decline invitation to join ${invitation.crew?.name}`}
          >
            <Ionicons name="close-circle" size={30} color="#dc3545" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default InvitationCard;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 16,
    alignItems: 'center',
    marginBottom: 10, // Space between cards
  },
  crewImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0f0f0',
  },
  placeholderImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    marginLeft: 16,
  },
  crewName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  inviterName: {
    fontSize: 16,
    color: '#555',
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  acceptButton: {
    marginRight: 20,
  },
  declineButton: {},
});
