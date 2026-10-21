import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F8FAFC' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Pilih Peran' }} />
        <Stack.Screen name="jadwal/index" options={{ title: 'Daftar Jadwal' }} />
        <Stack.Screen name="asisten/[id]" options={{ title: 'Kelola Sesi Asisten' }} />
        <Stack.Screen name="praktikan/[id]" options={{ title: 'Presensi Praktikan' }} />
        <Stack.Screen name="praktikan/riwayat" options={{ title: 'Riwayat Kehadiran' }} />
      </Stack>
    </ThemeProvider>
  );
}
