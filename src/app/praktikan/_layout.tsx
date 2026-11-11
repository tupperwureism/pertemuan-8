import { Redirect, Stack, type Href } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

/**
 * Guard role: seluruh route di bawah /praktikan (termasuk route izin yang ditambah kemudian)
 * hanya untuk role praktikan. Layout ini ditambahkan Programmer 1 semata untuk guard;
 * file route praktikan lainnya tetap milik Programmer 2.
 */
export default function PraktikanLayout() {
  const { role } = useAuth();

  if (role !== 'praktikan') {
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
