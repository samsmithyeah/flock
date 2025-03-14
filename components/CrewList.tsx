// components/CrewList.tsx

import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Crew } from '@/types/Crew';
import { User } from '@/types/User';
import { router } from 'expo-router';

type CrewListProps = {
  crews: Crew[];
  usersCache: { [key: string]: User };
  currentDate?: string;
  orderEditable?: boolean;
  onOrderChange?: (newCrews: Crew[]) => void;
};

const CrewList: React.FC<CrewListProps> = ({
  crews,
  usersCache,
  currentDate,
  orderEditable = false,
  onOrderChange,
}) => {
  const handlePress = (crew: Crew) => {
    console.log('handlePress, crew:', crew);
    console.log('handlePress, currentDate:', currentDate);
    if (currentDate) {
      console.log('navigate to calendar');
      router.push(
        {
          pathname: '/crews/[crewId]/calendar',
          params: { crewId: crew.id, date: currentDate },
        },
        { withAnchor: true },
      );
      return;
    }
    router.push(
      {
        pathname: '/crews/[crewId]',
        params: { crewId: crew.id },
      },
      { withAnchor: true },
    );
  };

  return (
    <View style={styles.container}>
      <DraggableFlatList
        data={crews}
        onDragEnd={({ data }) => onOrderChange?.(data)}
        keyExtractor={(item) => item.id}
        renderItem={({ item, drag, isActive }) => {
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
              }
              if (index === array.length - 1) {
                return `${acc} and ${name}`;
              }
              return `${acc}, ${name}`;
            }, '');

          return (
            <ScaleDecorator>
              <TouchableOpacity
                style={[styles.crewItem, isActive && styles.draggingItem]}
                onLongPress={orderEditable ? drag : undefined}
                onPress={() => handlePress(item)}
                disabled={isActive}
                accessibilityLabel={`Navigate to ${item.name} Crew`}
                accessibilityHint={`Opens the ${item.name} Crew screen for the selected date`}
              >
                {/* Crew Image */}
                {item.iconUrl ? (
                  <Image
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
                  <Text style={styles.crewText}>{item.name}</Text>
                  <Text style={styles.memberText}>{memberNames}</Text>
                </View>
                {orderEditable ? (
                  <MaterialIcons
                    name="drag-indicator"
                    size={24}
                    color="#D3D3D3"
                    style={styles.dragHandle}
                  />
                ) : (
                  <View style={styles.dragHandlePlaceholder} />
                )}
              </TouchableOpacity>
            </ScaleDecorator>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No crews found</Text>
        }
        contentContainerStyle={[
          styles.listContent,
          crews.length === 0 && styles.emptyContainer,
        ]}
      />
    </View>
  );
};

export default CrewList;

const styles = StyleSheet.create({
  crewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 8,
  },
  crewImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
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
    flex: 1,
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
    justifyContent: 'center',
  },
  draggingItem: {
    opacity: 0.5,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  dragHandle: {
    paddingHorizontal: 10,
    width: 44, // Fixed width to match the icon + padding
  },
  dragHandlePlaceholder: {
    width: 44, // Same width as dragHandle
  },
  container: {
    flex: 1,
    marginTop: 16,
  },
  listContent: {
    flexGrow: 1,
    minHeight: '100%',
  },
});
