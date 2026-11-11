import { Redirect, Stack, type Href } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

/**
 * Guard role: seluruh route di bawah /asisten (termasuk route baru seperti asisten/izin/*)
 * hanya untuk role asisten. Role dibaca dari profil Firestore, bukan dari route param.
 */
export default function AsistenLayout() {
  const { role } = useAuth();

  if (role !== 'asisten') {
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
