// app/(main)/dashboard/_layout.tsx
import { Stack } from 'expo-router';

export default function DashboardStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
