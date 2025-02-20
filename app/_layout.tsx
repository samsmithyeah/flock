// app/_layout.tsx
import { ReactNode } from 'react';
import { Slot } from 'expo-router';
import { StyleSheet, View, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import Toast, {
  BaseToast,
  ErrorToast,
  InfoToast,
  ToastProps,
} from 'react-native-toast-message';
import { UserProvider } from '@/context/UserContext';
import { ContactsProvider } from '@/context/ContactsContext';
import { CrewsProvider } from '@/context/CrewsContext';
import { InvitationsProvider } from '@/context/InvitationsContext';
import { CrewDateChatProvider } from '@/context/CrewDateChatContext';
import { DirectMessagesProvider } from '@/context/DirectMessagesContext';
import { BadgeCountProvider } from '@/context/BadgeCountContext';

// If you need to ignore any log warnings:
LogBox.ignoreLogs([
  'Sending `onAnimatedValueUpdate` with no listeners registered.',
]);

// Your custom toast config:
const toastConfig = {
  success: (props: ToastProps) => (
    <BaseToast
      {...props}
      text1Style={{ fontSize: 15, fontWeight: '400' }}
      text2Style={{ fontSize: 13 }}
      style={{ borderLeftColor: '#008000' }}
    />
  ),
  error: (props: ToastProps) => (
    <ErrorToast
      {...props}
      text1Style={{ fontSize: 15, fontWeight: '400' }}
      text2Style={{ fontSize: 13 }}
      style={{ borderLeftColor: '#FF0000' }}
    />
  ),
  info: (props: ToastProps) => (
    <InfoToast
      {...props}
      text1Style={{ fontSize: 15, fontWeight: '400' }}
      text2Style={{ fontSize: 13 }}
      style={{ borderLeftColor: '#FFA500' }}
    />
  ),
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <UserProvider>
      <ContactsProvider>
        <CrewsProvider>
          <InvitationsProvider>
            <CrewDateChatProvider>
              <DirectMessagesProvider>
                <BadgeCountProvider>{children}</BadgeCountProvider>
              </DirectMessagesProvider>
            </CrewDateChatProvider>
          </InvitationsProvider>
        </CrewsProvider>
      </ContactsProvider>
    </UserProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Providers>
        <View style={styles.container}>
          <Slot />
        </View>
      </Providers>
      <StatusBar style="dark" />
      <Toast config={toastConfig} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
