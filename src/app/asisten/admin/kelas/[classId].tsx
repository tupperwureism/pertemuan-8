import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import {
  useClassMembers,
  useLabs,
  useSessions,
  useUserProfiles,
  useVisibleClasses,
} from '@/hooks/use-firestore-data';
import { formatSessionTime, parseDateTime, toDateInput, toTimeInput } from '@/lib/format';
import { getErrorMessage } from '@/services/authService';
import { createSession, deleteSession, updateSession } from '@/services/sessionService';
import type { SessionDoc } from '@/types/firebase';

type Dialog =
  | { type: 'session'; session: SessionDoc | null }
  | { type: 'deleteSession'; session: SessionDoc }
  | null;

const EMPTY_SESSION_FORM = {
  judul: '',
  ruangan: '',
  labId: null as string | null,
  tanggal: '',
  mulai: '08:00',
  selesai: '10:00',
  catatan: '',
};

/** Detail kelas untuk Asprak: peserta bersifat baca-saja, pengelolaan fokus pada sesi praktikum. */
export default function AdminClassDetailScreen() {
  const params = useLocalSearchParams<{ classId: string }>();
  const classId = Array.isArray(params.classId) ? params.classId[0] : params.classId;

  const { data: classes, loading, error, retry } = useVisibleClasses('asisten');
  const { data: members, error: membersError } = useClassMembers(classId);
  const { data: allSessions, loading: sessionsLoading, error: sessionsError, retry: retrySessions } = useSessions();
  const { data: labs, loading: labsLoading, error: labsError, retry: retryLabs } = useLabs();
  const profiles = useUserProfiles((members ?? []).map((m) => m.uid));

  const cls = classes?.find((c) => c.id === classId);
  const sessions = useMemo(
    () => (allSessions ?? []).filter((s) => s.classId === classId),
    [allSessions, classId],
  );

  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [sessionForm, setSessionForm] = useState(EMPTY_SESSION_FORM);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/asisten/admin' as Href));

  const openDialog = (next: Dialog) => {
    setDialogError('');
    setDialog(next);
  };

  const run = async (action: () => Promise<void>, afterSuccess?: () => void) => {
    setBusy(true);
    setDialogError('');
    try {
      await action();
      setDialog(null);
      afterSuccess?.();
    } catch (e) {
      setDialogError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Detail Kelas" onBack={goBack} />
        <LoadingState label="Memuat kelas..." />
      </SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Detail Kelas" onBack={goBack} />
        <ErrorState message={getErrorMessage(error)} onRetry={retry} />
      </SafeAreaView>
    );
  }
  if (!cls) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Detail Kelas" onBack={goBack} />
        <EmptyState icon="?" title="Kelas tidak ditemukan" subtitle="Kelas mungkin sudah dihapus." />
      </SafeAreaView>
    );
  }

  const startSessionForm = (session: SessionDoc | null) => {
    setSessionForm(
      session
        ? {
            judul: session.judul,
            ruangan: session.ruangan,
            labId: session.labId ?? null,
            tanggal: toDateInput(session.startsAt),
            mulai: toTimeInput(session.startsAt),
            selesai: toTimeInput(session.endsAt, '10:00'),
            catatan: session.catatan,
          }
        : { ...EMPTY_SESSION_FORM, tanggal: toDateInput(null) },
    );
    openDialog({ type: 'session', session });
  };

  const saveSession = (editing: SessionDoc | null) => {
    const availableLabs = labs ?? [];
    const hasLabs = availableLabs.length > 0;
    const selectedLab = sessionForm.labId
      ? availableLabs.find((lab) => lab.id === sessionForm.labId) ?? null
      : null;

    if (sessionForm.labId && !selectedLab) {
      setDialogError('Laboratorium yang dipilih tidak ditemukan. Pilih ulang laboratorium.');
      return;
    }
    if (hasLabs && !editing && !selectedLab) {
      setDialogError('Pilih laboratorium untuk sesi ini.');
      return;
    }

    const resolvedRuangan = selectedLab ? selectedLab.nama : sessionForm.ruangan.trim();
    if (!sessionForm.judul.trim() || !resolvedRuangan) {
      setDialogError(hasLabs ? 'Judul dan laboratorium wajib diisi.' : 'Judul dan ruangan wajib diisi.');
      return;
    }
    const startsAt = parseDateTime(sessionForm.tanggal, sessionForm.mulai);
    const endsAt = parseDateTime(sessionForm.tanggal, sessionForm.selesai);
    if (!startsAt || !endsAt) {
      setDialogError('Format tanggal harus YYYY-MM-DD dan jam HH:mm (contoh 2026-11-12 dan 08:00).');
      return;
    }
    if (endsAt <= startsAt) {
      setDialogError('Jam selesai harus setelah jam mulai.');
      return;
    }
    const base = {
      judul: sessionForm.judul,
      ruangan: resolvedRuangan,
      labId: selectedLab ? selectedLab.id : null,
      startsAt,
      endsAt,
      catatan: sessionForm.catatan,
    };
    void run(async () => {
      if (editing) await updateSession(editing.id, base);
      else await createSession({ ...base, classId: cls.id });
    });
  };

  const sessionDialog = dialog?.type === 'session' ? dialog : null;
  const availableLabs = labs ?? [];
  const hasLabs = availableLabs.length > 0;
  const editingLegacySession = Boolean(sessionDialog?.session && !sessionDialog.session.labId);
  const missingSavedLab = Boolean(
    sessionDialog?.session?.labId &&
      !labsLoading &&
      !availableLabs.some((lab) => lab.id === sessionForm.labId),
  );
  const showManualRuangan = !hasLabs || (editingLegacySession && sessionForm.labId === null);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title={cls.kodeKelas} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>{cls.nama}</Text>
          <Text style={styles.muted}>{cls.mataPraktikum}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Peserta ({members?.length ?? 0})</Text>
            <View style={styles.readOnlyBadge}>
              <Text style={styles.readOnlyBadgeText}>Baca-saja</Text>
            </View>
          </View>
          <Text style={styles.readOnlyNote}>
            Distribusi dan perpindahan praktikan antar laboratorium dikelola oleh Aslab.
          </Text>
          {membersError ? <ErrorBanner message={getErrorMessage(membersError)} /> : null}
          {!membersError && (members ?? []).length === 0 ? (
            <Text style={styles.emptyText}>
              Belum ada peserta pada kelas ini. Hubungi Aslab untuk penempatan praktikan.
            </Text>
          ) : (
            (members ?? []).map((m) => {
              const p = profiles[m.uid];
              return (
                <View key={m.id} style={styles.itemRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.itemTitle}>{p?.nama ?? 'Memuat nama...'}</Text>
                    <Text style={styles.muted}>
                      {p?.nomorInduk || '-'} · {p?.email ?? ''}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Sesi ({sessions.length})</Text>
            <Pressable
              accessibilityRole="button"
              style={styles.smallButton}
              onPress={() => startSessionForm(null)}
            >
              <Text style={styles.smallButtonText}>+ Sesi</Text>
            </Pressable>
          </View>
          {sessionsError ? (
            <View style={styles.sessionErrorBox}>
              <ErrorBanner message={getErrorMessage(sessionsError)} />
              <Pressable accessibilityRole="button" onPress={retrySessions} style={styles.linkButton}>
                <Text style={styles.linkText}>Muat ulang daftar sesi</Text>
              </Pressable>
            </View>
          ) : sessionsLoading ? (
            <Text style={styles.emptyText}>Memuat sesi...</Text>
          ) : sessions.length === 0 ? (
            <Text style={styles.emptyText}>Belum ada sesi untuk kelas ini.</Text>
          ) : (
            sessions.map((s) => (
              <View key={s.id} style={styles.sessionItem}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/asisten/${s.id}` as Href)}
                  style={styles.flex1}
                >
                  <Text style={styles.itemTitle}>{s.judul}</Text>
                  <Text style={styles.muted}>{formatSessionTime(s.startsAt, s.endsAt)}</Text>
                  <Text style={styles.muted}>
                    {s.ruangan} · {s.status.replace('_', ' ')}
                  </Text>
                </Pressable>
                <View style={styles.sessionActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => startSessionForm(s)}
                    style={styles.linkButton}
                  >
                    <Text style={styles.linkText}>Ubah</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openDialog({ type: 'deleteSession', session: s })}
                    style={styles.dangerLink}
                  >
                    <Text style={styles.dangerLinkText}>Hapus</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <FormSheet
        visible={sessionDialog !== null}
        title={sessionDialog?.session ? 'Ubah Sesi' : 'Tambah Sesi'}
        onClose={() => setDialog(null)}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetForm}>
          <FormField
            label="Judul Sesi"
            maxLength={150}
            value={sessionForm.judul}
            onChangeText={(v) => setSessionForm((f) => ({ ...f, judul: v }))}
            placeholder="Contoh: Modul 1 - React Native Dasar"
          />

          <View style={styles.labFieldGroup}>
            <Text style={styles.labFieldLabel}>Laboratorium</Text>

            {labsError ? (
              <View style={styles.sessionErrorBox}>
                <ErrorBanner message={getErrorMessage(labsError)} />
                <Pressable accessibilityRole="button" onPress={retryLabs} style={styles.linkButton}>
                  <Text style={styles.linkText}>Muat ulang daftar laboratorium</Text>
                </Pressable>
              </View>
            ) : labsLoading ? (
              <Text style={styles.muted}>Memuat daftar laboratorium...</Text>
            ) : hasLabs ? (
              <View style={styles.labChipsWrap}>
                {availableLabs.map((lab) => {
                  const selected = sessionForm.labId === lab.id;
                  return (
                    <Pressable
                      key={lab.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setSessionForm((f) => ({
                          ...f,
                          labId: lab.id,
                          ruangan: lab.nama,
                        }))
                      }
                      style={[styles.labChip, selected && styles.labChipSelected]}
                    >
                      <Text style={[styles.labChipText, selected && styles.labChipTextSelected]}>
                        {lab.nama} ({lab.radiusMeter} m)
                      </Text>
                    </Pressable>
                  );
                })}
                {editingLegacySession ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: sessionForm.labId === null }}
                    onPress={() => setSessionForm((f) => ({ ...f, labId: null }))}
                    style={[styles.labChip, sessionForm.labId === null && styles.labChipSelected]}
                  >
                    <Text
                      style={[
                        styles.labChipText,
                        sessionForm.labId === null && styles.labChipTextSelected,
                      ]}
                    >
                      Tanpa Lab (Sesi Lama)
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.emptyLabNotice}>
                <Text style={styles.emptyLabNoticeText}>
                  Belum ada data laboratorium. Hubungi Aslab untuk menambahkan laboratorium agar validasi lokasi aktif.
                </Text>
              </View>
            )}

            {missingSavedLab ? (
              <Text style={styles.labWarningText}>
                Laboratorium sesi ini sebelumnya sudah dihapus. Pilih ulang laboratorium di atas.
              </Text>
            ) : null}
          </View>

          {showManualRuangan ? (
            <FormField
              label="Ruangan"
              maxLength={100}
              value={sessionForm.ruangan}
              onChangeText={(v) => setSessionForm((f) => ({ ...f, ruangan: v }))}
              placeholder="Contoh: Lab Mobile 1"
            />
          ) : null}

          <FormField
            label="Tanggal (YYYY-MM-DD)"
            value={sessionForm.tanggal}
            onChangeText={(v) => setSessionForm((f) => ({ ...f, tanggal: v }))}
            placeholder="2026-11-12"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.row}>
            <View style={styles.flex1}>
              <FormField
                label="Mulai (HH:mm)"
                value={sessionForm.mulai}
                onChangeText={(v) => setSessionForm((f) => ({ ...f, mulai: v }))}
                placeholder="08:00"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.flex1}>
              <FormField
                label="Selesai (HH:mm)"
                value={sessionForm.selesai}
                onChangeText={(v) => setSessionForm((f) => ({ ...f, selesai: v }))}
                placeholder="10:00"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          <FormField
            label="Catatan (opsional)"
            maxLength={500}
            value={sessionForm.catatan}
            onChangeText={(v) => setSessionForm((f) => ({ ...f, catatan: v }))}
            multiline
            placeholder="Instruksi untuk praktikan"
          />
          {dialogError && sessionDialog ? <ErrorBanner message={dialogError} /> : null}
          <PrimaryButton
            label={sessionDialog?.session ? 'Simpan Perubahan' : 'Buat Sesi'}
            tone="asisten"
            onPress={() => saveSession(sessionDialog?.session ?? null)}
            loading={busy}
          />
        </ScrollView>
      </FormSheet>

      <ConfirmSheet
        visible={dialog?.type === 'deleteSession'}
        title="Hapus sesi ini?"
        message={`Sesi "${dialog?.type === 'deleteSession' ? dialog.session.judul : ''}" beserta data presensi dan pengajuan izin pada sesi ini akan dihapus permanen.${dialogError && dialog?.type === 'deleteSession' ? `\n\n${dialogError}` : ''}`}
        confirmLabel="Ya, Hapus Sesi"
        loading={busy}
        onConfirm={() => dialog?.type === 'deleteSession' && void run(() => deleteSession(dialog.session.id))}
        onCancel={() => setDialog(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  muted: { fontSize: 12, color: '#475569', lineHeight: 18 },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1, minWidth: 0 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.label },
  readOnlyBadge: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  readOnlyBadgeText: { fontSize: 11, fontWeight: '800', color: '#5B21B6' },
  readOnlyNote: { fontSize: 12, color: '#475569', lineHeight: 18 },
  smallButton: {
    minHeight: 40,
    backgroundColor: colors.asisten,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  smallButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  emptyText: { fontSize: 13, color: '#475569', lineHeight: 19 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  sessionItem: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sessionActions: { justifyContent: 'center', gap: 6, alignItems: 'flex-end' },
  sessionErrorBox: { gap: 6, alignItems: 'flex-start' },
  linkButton: { minHeight: 36, paddingVertical: 6, paddingHorizontal: 8, justifyContent: 'center' },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.asisten },
  dangerLink: { minHeight: 36, paddingVertical: 6, paddingHorizontal: 8, justifyContent: 'center' },
  dangerLinkText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  sheetForm: { gap: 14, paddingBottom: 8 },
  labFieldGroup: { gap: 8 },
  labFieldLabel: { fontSize: 13, fontWeight: '600', color: colors.label },
  labChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  labChip: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.bg,
    justifyContent: 'center',
  },
  labChipSelected: {
    borderColor: colors.asisten,
    backgroundColor: '#EDE9FE',
  },
  labChipText: { fontSize: 13, fontWeight: '600', color: colors.label },
  labChipTextSelected: { color: '#5B21B6', fontWeight: '700' },
  emptyLabNotice: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    padding: 12,
    gap: 4,
    alignItems: 'flex-start',
  },
  emptyLabNoticeText: { fontSize: 12, color: colors.label, lineHeight: 18 },
  labWarningText: { fontSize: 12, fontWeight: '600', color: colors.dangerText },
});
