import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, EmptyState, PrimaryButton } from '@/components/screen-kit';
import { useAuth } from '@/context/AuthContext';

/** Ditampilkan bila login berhasil tetapi profil users/{uid} belum ada atau gagal dibaca. */
export default function AccountProblemScreen() {
  const { status, error, user, retryProfile, signOut } = useAuth();
  const missing = status === 'profileMissing';

  return (
    <SafeAreaView style={styles.safeArea}>
      <EmptyState
        icon={missing ? '🪪' : '📡'}
        title={missing ? 'Profil akun belum tersedia' : 'Profil tidak dapat dimuat'}
        subtitle={
          missing
            ? `Akun ${user?.email ?? ''} belum memiliki profil pengguna. Hubungi admin/PM untuk melengkapi profil, lalu coba lagi.`
            : (error ?? 'Periksa koneksi internet lalu coba lagi.')
        }
        action={
          <View style={styles.actions}>
            <PrimaryButton label="Coba lagi" onPress={retryProfile} />
            <PrimaryButton label="Keluar" tone="neutral" onPress={() => void signOut()} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
});
