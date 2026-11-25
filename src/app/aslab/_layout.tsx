import { Redirect, Stack, type Href } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

/** Guard role: seluruh route di bawah /aslab hanya untuk role aslab. */
export default function AslabLayout() {
  const { role } = useAuth();

  if (role !== 'aslab') {
    return <Redirect href={'/' as Href} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F8FAFC' },
        animation: 'slide_from_right',
      }}
    />
  );
}
