import React from 'react';
import { StyleSheet, View, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CustomSearchInputProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

const CustomSearchInput: React.FC<CustomSearchInputProps> = ({
  searchQuery,
  onSearchQueryChange,
}) => {
  return (
    <View style={styles.searchContainer}>
      <Ionicons
        name="search"
        size={20}
        color="#888"
        style={styles.searchIcon}
      />
      <TextInput
        style={styles.searchInput}
        placeholder="Search"
        value={searchQuery}
        onChangeText={onSearchQueryChange}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
};

export default CustomSearchInput;

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6e6e6',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
});
