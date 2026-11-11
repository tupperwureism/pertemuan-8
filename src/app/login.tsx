import { Link, type Href } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, ErrorBanner, FormField, PrimaryButton } from '@/components/screen-kit';
import { useAuth } from '@/context/AuthContext';
import { friendlyError } from '@/services/authService';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Email dan kata sandi wajib diisi.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      // Navigasi otomatis: Stack.Protected memindahkan pengguna ke jadwal setelah profil termuat.
      await signIn(email, password);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Presensi Praktikum</Text>
            <Text style={styles.subtitle}>Masuk dengan akun Anda. Tampilan menyesuaikan peran akun.</Text>
          </View>

          <View style={styles.card}>
            <FormField
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              placeholder="nama@email.com"
            />
            <FormField
              label="Kata Sandi"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              placeholder="Kata sandi"
              onSubmitEditing={handleLogin}
            />
            {error ? <ErrorBanner message={error} /> : null}
            <PrimaryButton label="Masuk" onPress={handleLogin} loading={submitting} />
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Belum punya akun praktikan?</Text>
            <Link href={'/register' as Href} style={styles.footerLink}>
              Daftar
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: 20, gap: 16, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', gap: 4 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  footerText: { fontSize: 14, color: colors.textMuted },
  footerLink: { fontSize: 14, fontWeight: '700', color: colors.praktikan },
});
