import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BulkReviewList } from '@/components/aslab/bulk-review-list';
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
import { useSubscription } from '@/hooks/use-subscription';
import {
  downloadOrShareCsvTemplate,
  getCsvDemoSample,
  parseCsvRows,
  type CsvReviewRow,
} from '@/lib/csv';
import {
  bulkCreateLabsForCourse,
  createLabWithPolicy,
  deleteLabAslab,
  formatRupiah,
  subscribeAllLabs,
  updateLabWithPolicy,
  type BulkOperationSummary,
} from '@/services/aslabService';
import { getErrorMessage } from '@/services/authService';
import { getCurrentFix, LocationError, openAppSettings } from '@/services/locationService';
import type { LabDoc } from '@/types/firebase';

type Mode = 'list' | 'bulk';
type Dialog = { type: 'form'; lab: LabDoc | null } | { type: 'delete'; lab: LabDoc } | null;

const EMPTY_FORM = {
  mataKuliah: '',
  nama: '',
  gedung: '',
  deskripsi: '',
  latitude: '',
  longitude: '',
  radiusMeter: '100',
  gracePeriodMinutes: '15',
  fineAmount: '10000',
};

function parseDecimal(raw: string): number {
  const cleaned = raw.trim().replace(',', '.');
  return cleaned ? Number(cleaned) : Number.NaN;
}

/** Manajemen laboratorium Aslab (SRS-32): Single Insert/Edit + Bulk Insert per 1 Mata Kuliah. */
export default function AslabLabsScreen() {
  const subscribeLabs = useCallback(
    (cb: Parameters<typeof subscribeAllLabs>[0], err: Parameters<typeof subscribeAllLabs>[1]) =>
      subscribeAllLabs(cb, err),
    [],
  );
  const { data: labs, loading, error, retry } = useSubscription(subscribeLabs);

  const [mode, setMode] = useState<Mode>('list');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [dialogError, setDialogError] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationBlocked, setLocationBlocked] = useState(false);

  // State Bulk Insert Lab (per 1 mata kuliah)
  const [bulkCourse, setBulkCourse] = useState('');
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [bulkRows, setBulkRows] = useState<CsvReviewRow[]>([]);
  const [bulkError, setBulkError] = useState('');
  const [bulkNotice, setBulkNotice] = useState('');
  const [bulkSummary, setBulkSummary] = useState<BulkOperationSummary | null>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/aslab' as Href));

  const openForm = (lab: LabDoc | null) => {
    setForm(
      lab
        ? {
            mataKuliah: lab.mataKuliah ?? '',
            nama: lab.nama,
            gedung: lab.gedung,
            deskripsi: lab.deskripsi,
            latitude: String(lab.latitude),
            longitude: String(lab.longitude),
            radiusMeter: String(lab.radiusMeter),
            gracePeriodMinutes: String(lab.gracePeriodMinutes ?? 15),
            fineAmount: String(lab.fineAmount ?? 10000),
          }
        : EMPTY_FORM,
    );
    setDialogError('');
    setLocating(false);
    setLocationBlocked(false);
    setDialog({ type: 'form', lab });
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

  const handleSaveSingle = async () => {
    const editingLab = dialog?.type === 'form' ? dialog.lab : null;
    const payload = {
      mataKuliah: form.mataKuliah,
      nama: form.nama,
      gedung: form.gedung,
      deskripsi: form.deskripsi,
      latitude: parseDecimal(form.latitude),
      longitude: parseDecimal(form.longitude),
      radiusMeter: parseDecimal(form.radiusMeter),
      gracePeriodMinutes: parseDecimal(form.gracePeriodMinutes),
      fineAmount: parseDecimal(form.fineAmount),
    };

    setSaving(true);
    setDialogError('');
    try {
      if (editingLab) {
        await updateLabWithPolicy(editingLab.id, payload);
      } else {
        await createLabWithPolicy(payload);
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
      await deleteLabAslab(dialog.lab.id);
      setDialog(null);
    } catch (e) {
      setDialogError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setBulkError('');
    setBulkNotice('');
    try {
      const res = await downloadOrShareCsvTemplate('labs');
      setBulkNotice(
        res === 'url'
          ? 'Template CSV Lab dibuka lewat browser.'
          : 'Template CSV Lab dibagikan (fallback offline).',
      );
    } catch (e) {
      setBulkError(getErrorMessage(e));
    }
  };

  const handleParseBulk = () => {
    setBulkError('');
    setBulkSummary(null);
    const parsed = parseCsvRows(bulkCsvText, 'labs');
    if (parsed.length === 0) {
      setBulkError('Masukkan minimal 1 baris data CSV laboratorium terlebih dahulu.');
      setBulkRows([]);
      return;
    }
    setBulkRows(parsed);
  };

  const handleSubmitBulk = async (acceptedRows: CsvReviewRow[]) => {
    if (!bulkCourse.trim()) {
      setBulkError('Nama mata kuliah wajib diisi untuk bulk insert laboratorium.');
      return;
    }
    setSaving(true);
    setBulkError('');
    setBulkSummary(null);
    try {
      const mapped = acceptedRows.map((r) => ({
        nama: r.values.nama ?? '',
        gedung: r.values.gedung ?? '',
        deskripsi: r.values.deskripsi ?? '',
        latitude: parseDecimal(r.values.latitude ?? ''),
        longitude: parseDecimal(r.values.longitude ?? ''),
        radiusMeter: parseDecimal(r.values.radiusMeter ?? ''),
        gracePeriodMinutes: parseDecimal(r.values.gracePeriodMinutes ?? ''),
        fineAmount: parseDecimal(r.values.fineAmount ?? ''),
      }));
      const summary = await bulkCreateLabsForCourse(bulkCourse, mapped);
      setBulkSummary(summary);
      if (summary.failed.length === 0) {
        setBulkRows([]);
        setBulkCsvText('');
      }
    } catch (e) {
      setBulkError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: LabDoc }) => (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.badgesWrap}>
          {item.mataKuliah ? (
            <View style={styles.courseBadge}>
              <Text style={styles.courseBadgeText}>{item.mataKuliah}</Text>
            </View>
          ) : null}
          <View style={styles.radiusBadge}>
            <Text style={styles.radiusBadgeText}>{item.radiusMeter} m</Text>
          </View>
          <View style={styles.policyBadge}>
            <Text style={styles.policyBadgeText}>
              Telat {item.gracePeriodMinutes ?? 15} mnt · {formatRupiah(item.fineAmount ?? 10000)}
            </Text>
          </View>
        </View>
        <View style={styles.cardActions}>
          <Pressable accessibilityRole="button" onPress={() => openForm(item)} style={styles.linkButton}>
            <Text style={styles.linkText}>Ubah</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDialogError('');
              setDialog({ type: 'delete', lab: item });
            }}
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

  const renderListMode = () => {
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
            subtitle="Tambahkan laboratorium secara single atau bulk berdasarkan mata kuliah."
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

  const renderBulkMode = () => (
    <ScrollView contentContainerStyle={styles.bulkContent} keyboardShouldPersistTaps="handled">
      <View style={styles.bulkCard}>
        <Text style={styles.bulkTitle}>Bulk Insert Lab (1 Mata Kuliah)</Text>
        <Text style={styles.helperNote}>
          Membuat sejumlah laboratorium sekaligus untuk satu mata kuliah beserta kelas pendampingnya.
        </Text>

        <FormField
          label="Mata Kuliah"
          value={bulkCourse}
          onChangeText={setBulkCourse}
          placeholder="Contoh: Pemrograman Perangkat Keras"
          maxLength={100}
        />

        <View style={styles.actionRow}>
          <View style={styles.flex1}>
            <PrimaryButton
              label="Unduh Template CSV Lab"
              tone="neutral"
              onPress={() => void handleDownloadTemplate()}
            />
          </View>
          <View style={styles.flex1}>
            <PrimaryButton
              label="Muat Contoh CSV"
              tone="neutral"
              onPress={() => {
                setBulkCsvText(getCsvDemoSample('labs'));
                setBulkError('');
              }}
            />
          </View>
        </View>

        {bulkNotice ? <Text style={styles.noticeText}>ℹ️ {bulkNotice}</Text> : null}

        <Text style={styles.fieldLabel}>Tempel Isi CSV Laboratorium</Text>
        <TextInput
          multiline
          value={bulkCsvText}
          onChangeText={setBulkCsvText}
          placeholder="nama,gedung,deskripsi,latitude,longitude,radiusMeter,gracePeriodMinutes,fineAmount"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          style={styles.csvInput}
        />

        <PrimaryButton
          label="Muat ke Daftar Preview"
          tone="asisten"
          onPress={handleParseBulk}
        />

        {bulkError ? <ErrorBanner message={bulkError} /> : null}
        {bulkSummary ? (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>
              Hasil Simpan: {bulkSummary.succeeded} berhasil · {bulkSummary.failed.length} gagal
            </Text>
            {bulkSummary.failed.map((f, i) => (
              <Text key={`${f.label}-${i}`} style={styles.summaryFailItem}>
                • {f.label}: {f.reason}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {bulkRows.length > 0 ? (
        <BulkReviewList
          type="labs"
          rows={bulkRows}
          saving={saving}
          submitLabelPrefix="Simpan"
          onChangeRows={setBulkRows}
          onSubmit={(accepted) => void handleSubmitBulk(accepted)}
        />
      ) : null}
    </ScrollView>
  );

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

      <View style={styles.modeTabs}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMode('list')}
          style={[styles.modeTab, mode === 'list' && styles.modeTabActive]}
        >
          <Text style={[styles.modeTabText, mode === 'list' && styles.modeTabTextActive]}>
            Daftar &amp; Single ({labs?.length ?? 0})
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMode('bulk')}
          style={[styles.modeTab, mode === 'bulk' && styles.modeTabActive]}
        >
          <Text style={[styles.modeTabText, mode === 'bulk' && styles.modeTabTextActive]}>
            Bulk Lab (CSV)
          </Text>
        </Pressable>
      </View>

      {mode === 'list' ? renderListMode() : renderBulkMode()}

      <FormSheet
        visible={formDialog !== null}
        title={formDialog?.lab ? 'Ubah Laboratorium' : 'Tambah Laboratorium'}
        onClose={() => setDialog(null)}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetForm}>
          <FormField
            label="Mata Kuliah"
            maxLength={100}
            value={form.mataKuliah}
            onChangeText={(v) => setForm((f) => ({ ...f, mataKuliah: v }))}
            placeholder="Contoh: Pemrograman Perangkat Keras"
          />
          <FormField
            label="Nama Laboratorium"
            maxLength={100}
            value={form.nama}
            onChangeText={(v) => setForm((f) => ({ ...f, nama: v }))}
            placeholder="Contoh: Lab Mobile 1"
          />
          <FormField
            label="Gedung / Lokasi"
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
              <Text style={styles.fieldLabel}>Koordinat Titik Pusat Lab</Text>
              <Text style={styles.helperNote}>
                Ambil koordinat GPS saat ini atau isi manual.
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
                label="Latitude (-90..90)"
                value={form.latitude}
                onChangeText={(v) => setForm((f) => ({ ...f, latitude: v }))}
                placeholder="-7.050000"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.flex1}>
              <FormField
                label="Longitude (-180..180)"
                value={form.longitude}
                onChangeText={(v) => setForm((f) => ({ ...f, longitude: v }))}
                placeholder="110.440000"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <FormField
            label="Cakupan Lokasi Presensi (meter, 10..1000)"
            value={form.radiusMeter}
            onChangeText={(v) => setForm((f) => ({ ...f, radiusMeter: v }))}
            placeholder="100"
            keyboardType="numeric"
          />

          <View style={styles.row}>
            <View style={styles.flex1}>
              <FormField
                label="Toleransi Telat (menit, 0..180)"
                value={form.gracePeriodMinutes}
                onChangeText={(v) => setForm((f) => ({ ...f, gracePeriodMinutes: v }))}
                placeholder="15"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.flex1}>
              <FormField
                label="Denda Tetap (Rp, 0..500000)"
                value={form.fineAmount}
                onChangeText={(v) => setForm((f) => ({ ...f, fineAmount: v }))}
                placeholder="10000"
                keyboardType="numeric"
              />
            </View>
          </View>

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
            onPress={() => void handleSaveSingle()}
            loading={saving}
            disabled={locating}
          />
        </ScrollView>
      </FormSheet>

      <ConfirmSheet
        visible={deleteDialog !== null}
        title="Hapus laboratorium ini?"
        message={`Laboratorium "${deleteDialog?.lab.nama ?? ''}" dan daftar anggota lab-nya akan dihapus.${dialogError && deleteDialog ? `\n\n${dialogError}` : ''}`}
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
  addButton: {
    backgroundColor: colors.asisten,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  modeTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
  },
  modeTabActive: { backgroundColor: colors.asisten },
  modeTabText: { fontSize: 13, fontWeight: '700', color: colors.label },
  modeTabTextActive: { color: '#FFFFFF' },
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgesWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  courseBadge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  courseBadgeText: { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },
  radiusBadge: {
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  radiusBadgeText: { fontSize: 11, fontWeight: '800', color: '#6D28D9' },
  policyBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  policyBadgeText: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  cardActions: { flexDirection: 'row', gap: 8 },
  linkButton: { paddingVertical: 4, paddingHorizontal: 4 },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.asisten },
  dangerLinkText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardSubtitle: { fontSize: 13, fontWeight: '600', color: colors.label },
  cardDescription: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  coordText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  bulkContent: { padding: 16, gap: 14, paddingBottom: 32 },
  bulkCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  bulkTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  actionRow: { flexDirection: 'row', gap: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.label },
  helperNote: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  noticeText: { fontSize: 12, fontWeight: '600', color: colors.praktikan },
  csvInput: {
    minHeight: 110,
    maxHeight: 180,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    padding: 12,
    fontSize: 12,
    color: colors.text,
    textAlignVertical: 'top',
  },
  summaryBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  summaryTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  summaryFailItem: { fontSize: 12, color: colors.dangerText },
  sheetForm: { gap: 12, paddingBottom: 8 },
  locationHeader: { gap: 8 },
  locationCopy: { gap: 2 },
  errorStack: { gap: 6, alignItems: 'flex-start' },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
});
