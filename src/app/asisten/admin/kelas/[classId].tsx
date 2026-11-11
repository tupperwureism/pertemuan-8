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
import { useClassMembers, useSessions, useUserProfiles, useVisibleClasses } from '@/hooks/use-firestore-data';
import { formatSessionTime, parseDateTime, toDateInput, toTimeInput } from '@/lib/format';
import { friendlyError } from '@/services/authService';
import { addClassMember, deleteClass, removeClassMember, updateClass } from '@/services/classService';
import { createSession, deleteSession, updateSession } from '@/services/sessionService';
import { findPraktikanByEmail } from '@/services/userService';
import type { SessionDoc } from '@/types/firebase';

type Dialog =
  | { type: 'editClass' }
  | { type: 'deleteClass' }
  | { type: 'addMember' }
  | { type: 'removeMember'; uid: string; nama: string }
  | { type: 'session'; session: SessionDoc | null }
  | { type: 'deleteSession'; session: SessionDoc }
  | null;

const EMPTY_SESSION_FORM = { judul: '', ruangan: '', tanggal: '', mulai: '08:00', selesai: '10:00', catatan: '' };

/** Detail kelas: info, peserta (membership), dan sesi. Semua perubahan real-time lewat Firestore. */
export default function AdminClassDetailScreen() {
  const params = useLocalSearchParams<{ classId: string }>();
  const classId = Array.isArray(params.classId) ? params.classId[0] : params.classId;

  const { data: classes, loading, error, retry } = useVisibleClasses('asisten');
  const { data: members, error: membersError } = useClassMembers(classId);
  const { data: allSessions } = useSessions();
  const profiles = useUserProfiles((members ?? []).map((m) => m.uid));

  const cls = classes?.find((c) => c.id === classId);
  const sessions = useMemo(
    () => (allSessions ?? []).filter((s) => s.classId === classId),
    [allSessions, classId],
  );

  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [classForm, setClassForm] = useState({ nama: '', mataPraktikum: '', kodeKelas: '' });
  const [memberEmail, setMemberEmail] = useState('');
  const [sessionForm, setSessionForm] = useState(EMPTY_SESSION_FORM);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/asisten/admin' as Href));

  const openDialog = (next: Dialog) => {
    setDialogError('');
    setDialog(next);
  };

  /** Menjalankan aksi tulis: menutup dialog bila sukses, menampilkan pesan ramah bila gagal. */
  const run = async (action: () => Promise<void>, afterSuccess?: () => void) => {
    setBusy(true);
    setDialogError('');
    try {
      await action();
      setDialog(null);
      afterSuccess?.();
    } catch (e) {
      setDialogError(e instanceof Error && e.message && !('code' in e) ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Detail Kelas" onBack={goBack} />
        <LoadingState label="Memuat kelas…" />
      </SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Detail Kelas" onBack={goBack} />
        <ErrorState message={error.message} onRetry={retry} />
      </SafeAreaView>
    );
  }
  if (!cls) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Detail Kelas" onBack={goBack} />
        <EmptyState icon="🔎" title="Kelas tidak ditemukan" subtitle="Kelas mungkin sudah dihapus." />
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------ handlers

  const startEditClass = () => {
    setClassForm({ nama: cls.nama, mataPraktikum: cls.mataPraktikum, kodeKelas: cls.kodeKelas });
    openDialog({ type: 'editClass' });
  };

  const saveClass = () => {
    if (!classForm.nama.trim() || !classForm.mataPraktikum.trim() || !classForm.kodeKelas.trim()) {
      setDialogError('Semua field kelas wajib diisi.');
      return;
    }
    void run(() => updateClass(cls.id, classForm));
  };

  const confirmDeleteClass = () =>
    void run(
      () => deleteClass(cls.id),
      () => router.replace('/asisten/admin' as Href),
    );

  const submitMember = () => {
    const email = memberEmail.trim().toLowerCase();
    if (!email) {
      setDialogError('Masukkan email praktikan.');
      return;
    }
    void run(
      async () => {
        const user = await findPraktikanByEmail(email);
        if (!user) throw new Error('Praktikan dengan email tersebut tidak ditemukan. Pastikan sudah mendaftar.');
        if ((members ?? []).some((m) => m.uid === user.uid)) throw new Error('Praktikan sudah menjadi anggota kelas ini.');
        await addClassMember(cls.id, user.uid, 'praktikan');
      },
      () => setMemberEmail(''),
    );
  };

  const startSessionForm = (session: SessionDoc | null) => {
    setSessionForm(
      session
        ? {
            judul: session.judul,
            ruangan: session.ruangan,
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
    if (!sessionForm.judul.trim() || !sessionForm.ruangan.trim()) {
      setDialogError('Judul dan ruangan wajib diisi.');
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
      ruangan: sessionForm.ruangan,
      startsAt,
      endsAt,
      catatan: sessionForm.catatan,
    };
    void run(async () => {
      if (editing) await updateSession(editing.id, base);
      else await createSession({ ...base, classId: cls.id });
    });
  };

  // -------------------------------------------------------------- render

  const sessionDialog = dialog?.type === 'session' ? dialog : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title={cls.kodeKelas} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Info kelas */}
        <View style={styles.card}>
          <Text style={styles.title}>{cls.nama}</Text>
          <Text style={styles.muted}>{cls.mataPraktikum}</Text>
          <View style={styles.row}>
            <View style={styles.flex1}>
              <PrimaryButton label="Ubah Kelas" tone="neutral" onPress={startEditClass} />
            </View>
            <View style={styles.flex1}>
              <PrimaryButton label="Hapus Kelas" tone="danger" onPress={() => openDialog({ type: 'deleteClass' })} />
            </View>
          </View>
        </View>

        {/* Peserta */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Peserta ({members?.length ?? 0})</Text>
            <Pressable accessibilityRole="button" style={styles.smallButton} onPress={() => openDialog({ type: 'addMember' })}>
              <Text style={styles.smallButtonText}>+ Peserta</Text>
            </Pressable>
          </View>
          {membersError ? <ErrorBanner message={membersError.message} /> : null}
          {!membersError && (members ?? []).length === 0 ? (
            <Text style={styles.emptyText}>Belum ada peserta. Tambahkan praktikan lewat email akun mereka.</Text>
          ) : (
            (members ?? []).map((m) => {
              const p = profiles[m.uid];
              return (
                <View key={m.id} style={styles.itemRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.itemTitle}>{p?.nama ?? 'Memuat nama…'}</Text>
                    <Text style={styles.muted}>
                      {p?.nomorInduk || '-'} • {p?.email ?? ''}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Hapus ${p?.nama ?? 'peserta'} dari kelas`}
                    style={styles.dangerLink}
                    onPress={() => openDialog({ type: 'removeMember', uid: m.uid, nama: p?.nama ?? 'peserta ini' })}
                  >
                    <Text style={styles.dangerLinkText}>Keluarkan</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        {/* Sesi */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Sesi ({sessions.length})</Text>
            <Pressable accessibilityRole="button" style={styles.smallButton} onPress={() => startSessionForm(null)}>
              <Text style={styles.smallButtonText}>+ Sesi</Text>
            </Pressable>
          </View>
          {sessions.length === 0 ? (
            <Text style={styles.emptyText}>Belum ada sesi untuk kelas ini.</Text>
          ) : (
            sessions.map((s) => (
              <View key={s.id} style={styles.sessionItem}>
                <Pressable accessibilityRole="button" onPress={() => router.push(`/asisten/${s.id}` as Href)} style={styles.flex1}>
                  <Text style={styles.itemTitle}>{s.judul}</Text>
                  <Text style={styles.muted}>{formatSessionTime(s.startsAt, s.endsAt)}</Text>
                  <Text style={styles.muted}>
                    {s.ruangan} • {s.status.replace('_', ' ')}
                  </Text>
                </Pressable>
                <View style={styles.sessionActions}>
                  <Pressable accessibilityRole="button" onPress={() => startSessionForm(s)} style={styles.linkButton}>
                    <Text style={styles.linkText}>Ubah</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => openDialog({ type: 'deleteSession', session: s })} style={styles.dangerLink}>
                    <Text style={styles.dangerLinkText}>Hapus</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Dialog: ubah kelas */}
      <FormSheet visible={dialog?.type === 'editClass'} title="Ubah Kelas" onClose={() => setDialog(null)}>
        <FormField label="Nama Kelas" value={classForm.nama} onChangeText={(v) => setClassForm((f) => ({ ...f, nama: v }))} />
        <FormField label="Mata Praktikum" value={classForm.mataPraktikum} onChangeText={(v) => setClassForm((f) => ({ ...f, mataPraktikum: v }))} />
        <FormField label="Kode Kelas" value={classForm.kodeKelas} onChangeText={(v) => setClassForm((f) => ({ ...f, kodeKelas: v }))} autoCapitalize="characters" />
        {dialogError && dialog?.type === 'editClass' ? <ErrorBanner message={dialogError} /> : null}
        <PrimaryButton label="Simpan Perubahan" tone="asisten" onPress={saveClass} loading={busy} />
      </FormSheet>

      {/* Dialog: tambah peserta */}
      <FormSheet visible={dialog?.type === 'addMember'} title="Tambah Peserta" onClose={() => setDialog(null)}>
        <FormField
          label="Email Praktikan"
          value={memberEmail}
          onChangeText={setMemberEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="praktikan@email.com"
        />
        {dialogError && dialog?.type === 'addMember' ? <ErrorBanner message={dialogError} /> : null}
        <PrimaryButton label="Tambahkan" tone="asisten" onPress={submitMember} loading={busy} />
      </FormSheet>

      {/* Dialog: form sesi */}
      <FormSheet
        visible={sessionDialog !== null}
        title={sessionDialog?.session ? 'Ubah Sesi' : 'Tambah Sesi'}
        onClose={() => setDialog(null)}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetForm}>
          <FormField label="Judul Sesi" value={sessionForm.judul} onChangeText={(v) => setSessionForm((f) => ({ ...f, judul: v }))} placeholder="Contoh: Modul 1 - React Native Dasar" />
          <FormField label="Ruangan" value={sessionForm.ruangan} onChangeText={(v) => setSessionForm((f) => ({ ...f, ruangan: v }))} placeholder="Contoh: Lab Mobile 1" />
          <FormField label="Tanggal (YYYY-MM-DD)" value={sessionForm.tanggal} onChangeText={(v) => setSessionForm((f) => ({ ...f, tanggal: v }))} placeholder="2026-11-12" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
          <View style={styles.row}>
            <View style={styles.flex1}>
              <FormField label="Mulai (HH:mm)" value={sessionForm.mulai} onChangeText={(v) => setSessionForm((f) => ({ ...f, mulai: v }))} placeholder="08:00" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.flex1}>
              <FormField label="Selesai (HH:mm)" value={sessionForm.selesai} onChangeText={(v) => setSessionForm((f) => ({ ...f, selesai: v }))} placeholder="10:00" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <FormField label="Catatan (opsional)" value={sessionForm.catatan} onChangeText={(v) => setSessionForm((f) => ({ ...f, catatan: v }))} multiline placeholder="Instruksi untuk praktikan" />
          {dialogError && sessionDialog ? <ErrorBanner message={dialogError} /> : null}
          <PrimaryButton
            label={sessionDialog?.session ? 'Simpan Perubahan' : 'Buat Sesi'}
            tone="asisten"
            onPress={() => saveSession(sessionDialog?.session ?? null)}
            loading={busy}
          />
        </ScrollView>
      </FormSheet>

      {/* Konfirmasi destruktif */}
      <ConfirmSheet
        visible={dialog?.type === 'deleteClass'}
        title="Hapus kelas ini?"
        message={`Kelas "${cls.nama}" beserta seluruh peserta dan sesinya akan dihapus permanen dan tidak dapat dikembalikan.${dialogError && dialog?.type === 'deleteClass' ? `\n\n${dialogError}` : ''}`}
        confirmLabel="Ya, Hapus Kelas"
        loading={busy}
        onConfirm={confirmDeleteClass}
        onCancel={() => setDialog(null)}
      />
      <ConfirmSheet
        visible={dialog?.type === 'removeMember'}
        title="Keluarkan peserta?"
        message={`${dialog?.type === 'removeMember' ? dialog.nama : ''} tidak akan lagi melihat jadwal kelas ini.${dialogError && dialog?.type === 'removeMember' ? `\n\n${dialogError}` : ''}`}
        confirmLabel="Ya, Keluarkan"
        loading={busy}
        onConfirm={() => dialog?.type === 'removeMember' && void run(() => removeClassMember(cls.id, dialog.uid))}
        onCancel={() => setDialog(null)}
      />
      <ConfirmSheet
        visible={dialog?.type === 'deleteSession'}
        title="Hapus sesi ini?"
        message={`Sesi "${dialog?.type === 'deleteSession' ? dialog.session.judul : ''}" akan dihapus permanen. Data presensi yang sudah tercatat tidak ikut dihapus.${dialogError && dialog?.type === 'deleteSession' ? `\n\n${dialogError}` : ''}`}
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
  muted: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.label },
  smallButton: { backgroundColor: colors.asisten, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  smallButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  emptyText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
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
  linkButton: { paddingVertical: 4, paddingHorizontal: 6 },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.asisten },
  dangerLink: { paddingVertical: 4, paddingHorizontal: 6 },
  dangerLinkText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  sheetForm: { gap: 14, paddingBottom: 8 },
});
