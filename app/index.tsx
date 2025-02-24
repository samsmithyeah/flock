// app/index.tsx
import React from 'react';
import { useRootNavigationState, Redirect } from 'expo-router';
import { useUser } from '@/context/UserContext';

export default function Index() {
  const { user } = useUser();
  const rootNavigationState = useRootNavigationState();

  // Wait until the navigation is fully initialized.
  if (!rootNavigationState?.key) return null;

  // Redirect based on the auth state.
  return user ? (
    <Redirect href="/(main)/crews" />
  ) : (
    <Redirect href="/(auth)/login" />
  );
}
