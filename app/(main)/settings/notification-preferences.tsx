import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useGlobalStyles } from '@/styles/globalStyles';
import ScreenTitle from '@/components/ScreenTitle';
import Colors from '@/styles/colors';
import {
  NotificationSettings,
  NOTIFICATION_CATEGORIES,
} from '@/types/NotificationSettings';
import { useNotificationSettings } from '@/context/NotificationSettingsContext';

const NotificationPreferencesScreen: React.FC = () => {
  const globalStyles = useGlobalStyles();
  const { settings, loading, updateSettings } = useNotificationSettings();

  const handleToggleCategory = async (category: keyof NotificationSettings) => {
    try {
      await updateSettings({
        [category]: !settings[category],
      });

      Toast.show({
        type: 'success',
        text1: 'Settings saved',
        text2: 'Your notification preferences have been updated',
      });
    } catch (error) {
      console.error('Error saving notification settings:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to save notification preferences',
      });
    }
  };

  const renderCategoryItem = (categoryKey: keyof NotificationSettings) => {
    const category = NOTIFICATION_CATEGORIES[categoryKey];

    if (!category) return null;

    return (
      <View key={categoryKey} style={styles.categoryItem}>
        <View style={styles.categoryLeft}>
          <View style={styles.categoryIconContainer}>
            <Ionicons
              name={category.icon}
              size={24}
              color={settings[categoryKey] ? Colors.primary : Colors.gray}
            />
          </View>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryTitle}>{category.title}</Text>
            <Text style={styles.categoryDescription}>
              {category.description}
            </Text>
          </View>
        </View>
        <Switch
          value={settings[categoryKey]}
          onValueChange={() => handleToggleCategory(categoryKey)}
          trackColor={{ false: Colors.lightGray, true: Colors.primaryLight }}
          thumbColor={settings[categoryKey] ? Colors.primary : Colors.gray}
          ios_backgroundColor={Colors.lightGray}
        />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={globalStyles.container}>
        <ScreenTitle title="Notification Preferences" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading preferences...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={globalStyles.containerWithHeader}>
      <ScrollView style={styles.scrollView}>
        {/* Categories Section */}
        <View style={styles.categoriesSection}>
          {Object.keys(NOTIFICATION_CATEGORIES).map((categoryKey) =>
            renderCategoryItem(categoryKey as keyof NotificationSettings),
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default NotificationPreferencesScreen;

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  categoriesSection: {
    marginBottom: 24,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  categoryDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
