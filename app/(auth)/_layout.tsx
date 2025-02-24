import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useUser } from '@/context/UserContext';

export default function AuthLayout() {
  const { user } = useUser();
  const router = useRouter();

  // If a user is present (i.e. logged in), redirect out of the auth stack.
  useEffect(() => {
    if (user) {
      router.replace('/(main)/crews');
    }
  }, [user, router]);

  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" options={{ headerShown: false }} />
      <Stack.Screen
        name="forgot-password"
        options={{ title: 'Forgot password' }}
      />
      <Stack.Screen
        name="phone-verification"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}
