import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { LoadingState } from '@/components/screen-kit';
import { AuthProvider, useAuth } from '@/context/AuthContext';

/**
 * Guard route berdasarkan status auth (bukan sekadar menyembunyikan tombol):
 * - signedOut      -> hanya login/register
 * - profileMissing / profileError -> hanya akun-bermasalah
 * - ready          -> aplikasi; guard role ada di asisten/_layout.tsx dan praktikan/_layout.tsx
 */
function RootNavigator() {
  const { status, initializing, registering } = useAuth();

  // Loader layar penuh hanya saat cold start dan saat profil dimuat setelah login. Selama registrasi,
  // layar daftar tetap tampil agar kegagalan (mis. rules menolak) dapat ditampilkan ke pengguna.
  if (initializing || (status === 'loading' && !registering)) {
    return <LoadingState label="Memeriksa sesi login…" />;
  }

  const signedOut = status === 'signedOut' || (status === 'loading' && registering);
  const needsAttention = status === 'profileMissing' || status === 'profileError';
  const ready = status === 'ready';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F8FAFC' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Protected guard={signedOut}>
        <Stack.Screen name="login" options={{ title: 'Masuk' }} />
        <Stack.Screen name="register" options={{ title: 'Daftar Praktikan' }} />
      </Stack.Protected>

      <Stack.Protected guard={needsAttention}>
        <Stack.Screen name="akun-bermasalah" options={{ title: 'Akun Bermasalah' }} />
      </Stack.Protected>

      <Stack.Protected guard={ready}>
        <Stack.Screen name="index" options={{ title: 'Beranda' }} />
        <Stack.Screen name="jadwal/index" options={{ title: 'Daftar Jadwal' }} />
        <Stack.Screen name="asisten" />
        <Stack.Screen name="praktikan" />
        <Stack.Screen name="explore" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <RootNavigator />
      </ThemeProvider>
    </AuthProvider>
  );
}
