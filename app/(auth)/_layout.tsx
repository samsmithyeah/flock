import { useEffect } from 'react';
import { Slot, useRouter } from 'expo-router';
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

  return <Slot />;
}
