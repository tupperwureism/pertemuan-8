import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  colors,
  ConfirmSheet,
  EmptyState,
  ErrorBanner,
  ErrorState,
  FormField,
  FormSheet,
  LoadingState,
  PrimaryButton,
  ScreenHeader,
} from '@/components/screen-kit';
import { useLabs } from '@/hooks/use-firestore-data';
import { getErrorMessage } from '@/services/authService';
import { createLab, deleteLab, updateLab } from '@/services/labService';
import { getCurrentFix, LocationError, openAppSettings } from '@/services/locationService';
import type { LabDoc } from '@/types/firebase';

type Dialog =
  | { type: 'form'; lab: LabDoc | null }
  | { type: 'delete'; lab: LabDoc }
  | null;

const EMPTY_FORM = {
  nama: '',
  gedung: '',
  deskripsi: '',
  latitude: '',
  longitude: '',
  radiusMeter: '100',
};

function parseDecimal(raw: string): number {
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) return Number.NaN;
  return Number(cleaned);
}

/** Kelola lokasi & radius laboratorium (khusus asisten). Guard role ada di asisten/_layout.tsx. */
export default function AdminLabsScreen() {
  const { data: labs, loading, error, retry } = useLabs();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [dialogError, setDialogError] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationBlocked, setLocationBlocked] = useState(false);

  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace('/asisten/admin' as Href);

  const openForm = (lab: LabDoc | null) => {
    setForm(
      lab
        ? {
            nama: lab.nama,
            gedung: lab.gedung,
            deskripsi: lab.deskripsi,
            latitude: String(lab.latitude),
            longitude: String(lab.longitude),
            radiusMeter: String(lab.radiusMeter),
          }
        : EMPTY_FORM,
    );
    setDialogError('');
    setLocating(false);
    setLocationBlocked(false);
    setDialog({ type: 'form', lab });
  };

  const openDelete = (lab: LabDoc) => {
    setDialogError('');
    setDialog({ type: 'delete', lab });
  };

  const handleUseMyLocation = async () => {
    setLocating(true);
    setDialogError('');
    setLocationBlocked(false);
    try {
      const fix = await getCurrentFix();
      setForm((f) => ({
        ...f,
        latitude: fix.latitude.toFixed(6),
        longitude: fix.longitude.toFixed(6),
      }));
    } catch (e) {
      if (e instanceof LocationError) {
        setDialogError(e.message);
        setLocationBlocked(e.reason === 'PERMISSION_BLOCKED');
      } else {
        setDialogError(getErrorMessage(e));
      }
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    const editingLab = dialog?.type === 'form' ? dialog.lab : null;
    const latitude = parseDecimal(form.latitude);
    const longitude = parseDecimal(form.longitude);
    const radiusMeter = parseDecimal(form.radiusMeter);

    if (!Number.isFinite(latitude)) {
      setDialogError('Koordinat latitude wajib diisi dengan angka yang valid.');
      return;
    }
    if (!Number.isFinite(longitude)) {
      setDialogError('Koordinat longitude wajib diisi dengan angka yang valid.');
      return;
    }
    if (!Number.isFinite(radiusMeter)) {
      setDialogError('Radius wajib diisi dengan angka antara 10 sampai 1000 meter.');
      return;
    }

    setSaving(true);
    setDialogError('');
    try {
      const payload = {
        nama: form.nama,
        gedung: form.gedung,
        deskripsi: form.deskripsi,
        latitude,
        longitude,
        radiusMeter,
      };
      if (editingLab) {
        await updateLab(editingLab.id, payload);
      } else {
        await createLab(payload);
      }
      setDialog(null);
    } catch (e) {
      setDialogError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (dialog?.type !== 'delete') return;
    setSaving(true);
    setDialogError('');
    try {
      await deleteLab(dialog.lab.id);
      setDialog(null);
    } catch (e) {
      setDialogError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: LabDoc }) => (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.radiusBadge}>
          <Text style={styles.radiusBadgeText}>Radius {item.radiusMeter} m</Text>
        </View>
        <View style={styles.cardActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => openForm(item)}
            style={styles.linkButton}
          >
            <Text style={styles.linkText}>Ubah</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => openDelete(item)}
            style={styles.linkButton}
          >
            <Text style={styles.dangerLinkText}>Hapus</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.cardTitle}>{item.nama}</Text>
      <Text style={styles.cardSubtitle}>{item.gedung}</Text>
      {item.deskripsi ? <Text style={styles.cardDescription}>{item.deskripsi}</Text> : null}
      <Text style={styles.coordText}>
        Koordinat: {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
      </Text>
    </View>
  );

  const renderBody = () => {
    if (loading) return <LoadingState label="Memuat laboratorium…" />;
    if (error) return <ErrorState message={getErrorMessage(error)} onRetry={retry} />;
    return (
      <FlatList
        data={labs ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="📍"
            title="Belum ada laboratorium"
            subtitle="Tambahkan lokasi dan radius laboratorium sebagai acuan validasi presensi."
            action={
              <PrimaryButton
                label="Tambah Laboratorium"
                tone="asisten"
                onPress={() => openForm(null)}
              />
            }
          />
        }
      />
    );
  };

  const formDialog = dialog?.type === 'form' ? dialog : null;
  const deleteDialog = dialog?.type === 'delete' ? dialog : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title="Kelola Laboratorium"
        onBack={goBack}
        right={
          <Pressable
            accessibilityRole="button"
            onPress={() => openForm(null)}
            style={styles.addButton}
          >
            <Text style={styles.addButtonText}>+ Lab</Text>
          </Pressable>
        }
      />
      {renderBody()}

      <FormSheet
        visible={formDialog !== null}
        title={formDialog?.lab ? 'Ubah Laboratorium' : 'Tambah Laboratorium'}
        onClose={() => setDialog(null)}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetForm}>
          <FormField
            label="Nama Laboratorium"
            maxLength={100}
            value={form.nama}
            onChangeText={(v) => setForm((f) => ({ ...f, nama: v }))}
            placeholder="Contoh: Lab Mobile 1"
          />
          <FormField
            label="Gedung"
            maxLength={100}
            value={form.gedung}
            onChangeText={(v) => setForm((f) => ({ ...f, gedung: v }))}
            placeholder="Contoh: Gedung Informatika Lt. 2"
          />
          <FormField
            label="Deskripsi (opsional)"
            maxLength={500}
            value={form.deskripsi}
            onChangeText={(v) => setForm((f) => ({ ...f, deskripsi: v }))}
            placeholder="Keterangan singkat ruang praktikum"
            multiline
          />

          <View style={styles.locationHeader}>
            <View style={styles.locationCopy}>
              <Text style={styles.locationLabel}>Koordinat Titik Pusat Lab</Text>
              <Text style={styles.helperNote}>
                Ambil koordinat GPS perangkat saat ini atau isi manual.
              </Text>
            </View>
            <PrimaryButton
              label="Ambil lokasi saya"
              tone="neutral"
              onPress={() => void handleUseMyLocation()}
              loading={locating}
              disabled={saving}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.flex1}>
              <FormField
                label="Latitude (-90 s.d. 90)"
                value={form.latitude}
                onChangeText={(v) => setForm((f) => ({ ...f, latitude: v }))}
                placeholder="-7.050000"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.flex1}>
              <FormField
                label="Longitude (-180 s.d. 180)"
                value={form.longitude}
                onChangeText={(v) => setForm((f) => ({ ...f, longitude: v }))}
                placeholder="110.440000"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <FormField
            label="Radius Presensi (meter, 10 s.d. 1000)"
            value={form.radiusMeter}
            onChangeText={(v) => setForm((f) => ({ ...f, radiusMeter: v }))}
            placeholder="100"
            keyboardType="numeric"
          />

          {dialogError && formDialog ? (
            <View style={styles.errorStack}>
              <ErrorBanner message={dialogError} />
              {locationBlocked ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void openAppSettings()}
                  style={styles.linkButton}
                >
                  <Text style={styles.linkText}>Buka pengaturan aplikasi →</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <PrimaryButton
            label={formDialog?.lab ? 'Simpan Perubahan' : 'Simpan Laboratorium'}
            tone="asisten"
            onPress={() => void handleSave()}
            loading={saving}
            disabled={locating}
          />
        </ScrollView>
      </FormSheet>

      <ConfirmSheet
        visible={deleteDialog !== null}
        title="Hapus laboratorium ini?"
        message={`Laboratorium "${deleteDialog?.lab.nama ?? ''}" akan dihapus permanen. Sesi praktikum yang masih memakai laboratorium ini tidak akan bisa dipresensi sampai asisten memilih ulang laboratorium pada sesi tersebut.${dialogError && deleteDialog ? `\n\n${dialogError}` : ''}`}
        confirmLabel="Ya, Hapus Lab"
        loading={saving}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDialog(null)}
      />
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
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  radiusBadge: {
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  radiusBadgeText: { fontSize: 12, fontWeight: '800', color: '#6D28D9' },
  cardActions: { flexDirection: 'row', gap: 10 },
  linkButton: { paddingVertical: 4, paddingHorizontal: 6 },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.asisten },
  dangerLinkText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardSubtitle: { fontSize: 13, fontWeight: '600', color: colors.label },
  cardDescription: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  coordText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  addButton: {
    backgroundColor: colors.asisten,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  sheetForm: { gap: 14, paddingBottom: 8 },
  locationHeader: { gap: 8 },
  locationCopy: { gap: 2 },
  locationLabel: { fontSize: 13, fontWeight: '600', color: colors.label },
  helperNote: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  errorStack: { gap: 6, alignItems: 'flex-start' },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },
});
