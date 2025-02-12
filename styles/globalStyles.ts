import { StyleSheet } from 'react-native';
import Colors from '@/styles/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

export const useGlobalStyles = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  return StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      backgroundColor: Colors.background,
      paddingBottom: insets.bottom - tabBarHeight,
      paddingTop: insets.top,
    },
    containerWithHeader: {
      flex: 1,
      padding: 16,
      backgroundColor: Colors.background,
      paddingBottom: insets.bottom - tabBarHeight,
    },
  });
};

export default useGlobalStyles;
