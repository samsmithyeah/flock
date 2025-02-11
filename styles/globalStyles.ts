import { Platform, StyleSheet } from 'react-native';
import Colors from '@/styles/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

export const useGlobalStyles = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const getPaddingBottom = () => {
    if (Platform.OS === 'ios') {
      return insets.bottom - tabBarHeight;
    }
    return tabBarHeight;
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      backgroundColor: Colors.background,
      paddingBottom: getPaddingBottom(),
      paddingTop: insets.top,
    },
    containerWithHeader: {
      flex: 1,
      padding: 16,
      backgroundColor: Colors.background,
      paddingBottom: insets.bottom - tabBarHeight,
    },
    listContainer: {
      marginTop: 16,
      paddingBottom: tabBarHeight,
    },
  });
};

export default useGlobalStyles;
