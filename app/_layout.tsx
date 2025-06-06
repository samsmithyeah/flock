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
import { CrewChatProvider } from '@/context/CrewChatContext';
import { BadgeCountProvider } from '@/context/BadgeCountContext';
import { SignalProvider } from '@/context/SignalContext';
import GlobalSetup from './GlobalSetup';

// Import background location task to register it
import '@/services/BackgroundLocationTask';

LogBox.ignoreLogs([
  'Sending `onAnimatedValueUpdate` with no listeners registered.',
]);

const toastConfig = {
  success: (props: ToastProps) => (
    <BaseToast
      {...props}
      text1Style={{ fontSize: 15, fontWeight: '400' }}
      text2Style={{ fontSize: 13 }}
      text2NumberOfLines={2}
      style={{ borderLeftColor: '#008000' }}
    />
  ),
  error: (props: ToastProps) => (
    <ErrorToast
      {...props}
      text1Style={{ fontSize: 15, fontWeight: '400' }}
      text2Style={{ fontSize: 13 }}
      text2NumberOfLines={2}
      style={{ borderLeftColor: '#FF0000' }}
    />
  ),
  info: (props: ToastProps) => (
    <InfoToast
      {...props}
      text1Style={{ fontSize: 15, fontWeight: '400' }}
      text2Style={{ fontSize: 13 }}
      text2NumberOfLines={2}
      style={{ borderLeftColor: '#FFA500' }}
    />
  ),
  notification: (props: ToastProps) => (
    <InfoToast
      {...props}
      text1Style={{ fontSize: 15, fontWeight: '400' }}
      text2Style={{ fontSize: 13 }}
      text2NumberOfLines={2}
      style={{ borderLeftColor: '#9D00FF' }}
    />
  ),
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <UserProvider>
      <ContactsProvider>
        <CrewsProvider>
          <SignalProvider>
            <InvitationsProvider>
              <CrewDateChatProvider>
                <DirectMessagesProvider>
                  <CrewChatProvider>
                    <BadgeCountProvider>{children}</BadgeCountProvider>
                  </CrewChatProvider>
                </DirectMessagesProvider>
              </CrewDateChatProvider>
            </InvitationsProvider>
          </SignalProvider>
        </CrewsProvider>
      </ContactsProvider>
    </UserProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Providers>
        <GlobalSetup />
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
