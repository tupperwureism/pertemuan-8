import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  colors,
  EmptyState,
  ErrorBanner,
  ErrorState,
  FormField,
  FormSheet,
  LoadingState,
  PrimaryButton,
  ScreenHeader,
} from '@/components/screen-kit';
import { useVisibleClasses } from '@/hooks/use-firestore-data';
import { friendlyError } from '@/services/authService';
import { createClass } from '@/services/classService';
import type { ClassDoc } from '@/types/firebase';

const EMPTY_FORM = { nama: '', mataPraktikum: '', kodeKelas: '' };

/** Daftar kelas milik asisten + pembuatan kelas baru. Guard role ada di asisten/_layout.tsx. */
export default function AdminClassesScreen() {
  const { data: classes, loading, error, retry } = useVisibleClasses('asisten');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/jadwal' as Href));

  const openForm = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const handleCreate = async () => {
    if (!form.nama.trim() || !form.mataPraktikum.trim() || !form.kodeKelas.trim()) {
      setFormError('Nama kelas, mata praktikum, dan kode kelas wajib diisi.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await createClass(form);
      setFormOpen(false);
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: ClassDoc }) => (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push(`/asisten/admin/kelas/${item.id}` as Href)}
    >
      <View style={styles.kodeBadge}>
        <Text style={styles.kodeBadgeText}>{item.kodeKelas}</Text>
      </View>
      <Text style={styles.cardTitle}>{item.nama}</Text>
      <Text style={styles.cardSubtitle}>{item.mataPraktikum}</Text>
      <Text style={styles.cardAction}>Kelola peserta &amp; sesi →</Text>
    </Pressable>
  );

  const renderBody = () => {
    if (loading) return <LoadingState label="Memuat kelas…" />;
    if (error) return <ErrorState message={error.message} onRetry={retry} />;
    return (
      <FlatList
        data={classes ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="🏫"
            title="Belum ada kelas"
            subtitle="Buat kelas pertama, lalu tambahkan peserta dan sesi praktikum."
            action={<PrimaryButton label="Tambah Kelas" tone="asisten" onPress={openForm} />}
          />
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title="Kelola Kelas"
        onBack={goBack}
        right={
          <Pressable accessibilityRole="button" onPress={openForm} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ Kelas</Text>
          </Pressable>
        }
      />
      {renderBody()}

      <FormSheet visible={formOpen} title="Tambah Kelas" onClose={() => setFormOpen(false)}>
        <FormField label="Nama Kelas" value={form.nama} onChangeText={(v) => setForm((f) => ({ ...f, nama: v }))} placeholder="Contoh: Informatika A" />
        <FormField label="Mata Praktikum" value={form.mataPraktikum} onChangeText={(v) => setForm((f) => ({ ...f, mataPraktikum: v }))} placeholder="Contoh: Pemrograman Bergerak" />
        <FormField label="Kode Kelas" value={form.kodeKelas} onChangeText={(v) => setForm((f) => ({ ...f, kodeKelas: v }))} placeholder="Contoh: IF-A" autoCapitalize="characters" />
        {formError ? <ErrorBanner message={formError} /> : null}
        <PrimaryButton label="Simpan Kelas" tone="asisten" onPress={handleCreate} loading={saving} />
      </FormSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  kodeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  kodeBadgeText: { fontSize: 12, fontWeight: '800', color: '#6D28D9' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardSubtitle: { fontSize: 13, color: colors.textMuted },
  cardAction: { fontSize: 13, fontWeight: '700', color: colors.asisten, marginTop: 4 },
  addButton: { backgroundColor: colors.asisten, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  addButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
