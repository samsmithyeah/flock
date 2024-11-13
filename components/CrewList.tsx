// components/CrewList.tsx

import React from 'react';
import {
  FlatList,
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FastImage from 'react-native-fast-image';
import { Crew } from '../types/Crew'; // Assuming you have a Crew type
import { User } from '../types/User';
import { useNavigation, NavigationProp } from '@react-navigation/native';

type CrewListProps = {
  crews: Crew[];
  usersCache: { [key: string]: User };
};

const CrewList: React.FC<CrewListProps> = ({ crews, usersCache }) => {
  const navigation = useNavigation<NavigationProp<any>>();
  return (
    <View style={styles.container}>
      <FlatList
        data={crews}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const memberNames = item.memberIds
            .map(
              (uid) =>
                usersCache[uid]?.displayName ||
                usersCache[uid]?.firstName ||
                'Unknown',
            )
            .filter((name) => name) // Remove any undefined or empty names
            .reduce((acc, name, index, array) => {
              if (index === 0) {
                return name;
              } else if (index === array.length - 1) {
                return `${acc} and ${name}`;
              } else {
                return `${acc}, ${name}`;
              }
            }, '');

          return (
            <TouchableOpacity
              style={styles.crewItem}
              onPress={() =>
                navigation.navigate('CrewsStack', {
                  screen: 'Crew',
                  params: { crewId: item.id },
                  initial: false,
                })
              }
            >
              {/* Crew Image */}
              {item.iconUrl ? (
                <FastImage
                  source={{ uri: item.iconUrl }}
                  style={styles.crewImage}
                />
              ) : (
                <View style={styles.placeholderImage}>
                  <Ionicons name="people-outline" size={24} color="#888" />
                </View>
              )}
              {/* Crew Details */}
              <View style={styles.crewDetails}>
                {/* Crew Name */}
                <Text style={styles.crewText}>{item.name}</Text>
                {/* Member Names */}
                <Text style={styles.memberText}>{memberNames}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No crews found</Text>
        }
        contentContainerStyle={crews.length === 0 && styles.emptyContainer}
      />
    </View>
  );
};

export default CrewList;

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
  },
  crewItem: {
    flexDirection: 'row', // Arrange image and text horizontally
    alignItems: 'center', // Vertically center items
    padding: 12,
    borderWidth: 2,
    borderColor: '#f0f0f0',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 8,
  },
  crewImage: {
    width: 50, // Adjust size as needed
    height: 50,
    borderRadius: 25,
    marginRight: 16, // Space between image and text
  },
  placeholderImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  crewDetails: {
    flex: 1, // Take up remaining space
  },
  crewText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
    color: '#333',
  },
  memberText: {
    fontSize: 14,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#888',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
