import { Link, type Href } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, ErrorBanner, FormField, PrimaryButton } from '@/components/screen-kit';
import { useAuth } from '@/context/AuthContext';
import { friendlyError } from '@/services/authService';

type Errors = Partial<Record<'nama' | 'nomorInduk' | 'email' | 'password' | 'confirm', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(v: { nama: string; nomorInduk: string; email: string; password: string; confirm: string }): Errors {
  const errors: Errors = {};
  if (!v.nama.trim()) errors.nama = 'Nama lengkap wajib diisi.';
  else if (v.nama.trim().length > 100) errors.nama = 'Nama maksimal 100 karakter.';
  if (!v.nomorInduk.trim()) errors.nomorInduk = 'NIM wajib diisi.';
  else if (v.nomorInduk.trim().length > 30) errors.nomorInduk = 'NIM maksimal 30 karakter.';
  if (!EMAIL_RE.test(v.email.trim())) errors.email = 'Format email tidak valid.';
  if (v.password.length < 6) errors.password = 'Kata sandi minimal 6 karakter.';
  if (v.confirm !== v.password) errors.confirm = 'Konfirmasi kata sandi tidak sama.';
  return errors;
}

/** Registrasi publik: tidak ada pilihan role; akun baru selalu praktikan. */
export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({ nama: '', nomorInduk: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleRegister = async () => {
    const found = validate(form);
    setErrors(found);
    setSubmitError('');
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        nama: form.nama,
        nomorInduk: form.nomorInduk,
      });
      // Berhasil: pengguna sudah login dan diarahkan otomatis oleh guard route.
    } catch (e) {
      setSubmitError(friendlyError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Daftar Praktikan</Text>
            <Text style={styles.subtitle}>
              Akun asisten dibuat oleh admin. Pendaftaran di sini selalu sebagai praktikan.
            </Text>
          </View>

          <View style={styles.card}>
            <FormField label="Nama Lengkap" value={form.nama} onChangeText={set('nama')} error={errors.nama} placeholder="Nama lengkap" autoComplete="name" />
            <FormField
              label="Nomor Induk Mahasiswa (NIM)"
              value={form.nomorInduk}
              onChangeText={set('nomorInduk')}
              error={errors.nomorInduk}
              placeholder="Contoh: 2301001"
              autoCapitalize="none"
            />
            <FormField
              label="Email"
              value={form.email}
              onChangeText={set('email')}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              placeholder="nama@email.com"
            />
            <FormField
              label="Kata Sandi"
              value={form.password}
              onChangeText={set('password')}
              error={errors.password}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="Minimal 6 karakter"
            />
            <FormField
              label="Konfirmasi Kata Sandi"
              value={form.confirm}
              onChangeText={set('confirm')}
              error={errors.confirm}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Ulangi kata sandi"
              onSubmitEditing={handleRegister}
            />
            {submitError ? <ErrorBanner message={submitError} /> : null}
            <PrimaryButton label="Daftar" onPress={handleRegister} loading={submitting} />
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Sudah punya akun?</Text>
            <Link href={'/login' as Href} style={styles.footerLink}>
              Masuk
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
