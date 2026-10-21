import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SessionStatus = 'BELUM_DIBUKA' | 'DIBUKA' | 'DITUTUP';

type AttendanceRecord = {
  id: string;
  sessionId: string;
  praktikanId: string;
  namaPraktikan: string;
  nim: string;
  waktuHadir: string;
  catatan?: string;
};

type PraktikumSession = {
  id: string;
  namaPraktikum: string;
  kelas: string;
  waktu: string;
  ruangan: string;
  status: SessionStatus;
  catatanAsisten?: string;
  daftarHadir: AttendanceRecord[];
};

const CURRENT_PRAKTIKAN = {
  id: 'prk-1',
  nama: 'Budi Santoso',
  nim: '2301001',
};

const SESSION_BY_ID: Record<string, PraktikumSession> = {
  'sesi-1': {
    id: 'sesi-1',
    namaPraktikum: 'Pemrograman Bergerak - Modul 1',
    kelas: 'IF-A',
    waktu: 'Senin, 08:00 - 10:00 WIB',
    ruangan: 'Lab Mobile 1',
    status: 'DIBUKA',
    catatanAsisten: 'Silakan presensi maksimal 15 menit pertama.',
    daftarHadir: [
      {
        id: 'abs-1',
        sessionId: 'sesi-1',
        praktikanId: 'prk-99',
        namaPraktikan: 'Andi Wijaya',
        nim: '2301099',
        waktuHadir: '08:03 WIB',
        catatan: 'Hadir tepat waktu',
      },
    ],
  },
  'sesi-2': {
    id: 'sesi-2',
    namaPraktikum: 'Pemrograman Bergerak - Modul 2',
    kelas: 'IF-A',
    waktu: 'Senin, 10:00 - 12:00 WIB',
    ruangan: 'Lab Mobile 1',
    status: 'BELUM_DIBUKA',
    catatanAsisten: '',
    daftarHadir: [],
  },
  'sesi-3': {
    id: 'sesi-3',
    namaPraktikum: 'Basis Data Lanjut - Modul 1',
    kelas: 'IF-B',
    waktu: 'Jumat, 13:00 - 15:00 WIB',
    ruangan: 'Lab Komputasi 2',
    status: 'DITUTUP',
    catatanAsisten: 'Sesi praktikum telah selesai.',
    daftarHadir: [
      {
        id: 'abs-2',
        sessionId: 'sesi-3',
        praktikanId: 'prk-1',
        namaPraktikan: 'Budi Santoso',
        nim: '2301001',
        waktuHadir: '13:02 WIB',
        catatan: 'Hadir',
      },
    ],
  },
};

const STATUS_META: Record<SessionStatus, { label: string; background: string; color: string }> = {
  BELUM_DIBUKA: { label: 'Belum dibuka', background: '#FFF4D6', color: '#8A5A00' },
  DIBUKA: { label: 'Sedang dibuka', background: '#DDF8E8', color: '#146C43' },
  DITUTUP: { label: 'Sesi ditutup', background: '#FFE1E1', color: '#A12727' },
};

function formatCurrentTime() {
  return `${new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())} WIB`;
}

export default function PraktikanSessionDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const sessionId = Array.isArray(id) ? id[0] : id ?? 'sesi-1';
  const session = SESSION_BY_ID[sessionId] ?? SESSION_BY_ID['sesi-1'];

  const initialAttendance = useMemo(
    () =>
      session.daftarHadir.find(
        (record) => record.praktikanId === CURRENT_PRAKTIKAN.id,
      ),
    [session],
  );

  const [attendance, setAttendance] = useState<AttendanceRecord | undefined>(initialAttendance);
  const [catatan, setCatatan] = useState('');
  const [feedbackVisible, setFeedbackVisible] = useState(false);

  const isSessionOpen = session.status === 'DIBUKA';
  const canAttend = isSessionOpen && !attendance;
  const statusMeta = STATUS_META[session.status];

  const submitAttendance = () => {
    if (!canAttend) return;

    const newAttendance: AttendanceRecord = {
      id: `abs-${Date.now()}`,
      sessionId: session.id,
      praktikanId: CURRENT_PRAKTIKAN.id,
      namaPraktikan: CURRENT_PRAKTIKAN.nama,
      nim: CURRENT_PRAKTIKAN.nim,
      waktuHadir: formatCurrentTime(),
      catatan: catatan.trim() || 'Hadir',
    };

    setAttendance(newAttendance);
    setFeedbackVisible(true);
  };

  const openHistory = () => {
    router.push({
      pathname: '/praktikan/riwayat',
      params: attendance
        ? {
            sessionId: attendance.sessionId,
            namaPraktikum: session.namaPraktikum,
            kelas: session.kelas,
            waktuHadir: attendance.waktuHadir,
            catatan: attendance.catatan ?? 'Hadir',
          }
        : undefined,
    });
    setFeedbackVisible(false);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kembali"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/jadwal'))}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Text style={styles.backButtonText}>‹</Text>
            </Pressable>
            <View style={styles.topBarCopy}>
              <Text style={styles.eyebrow}>MODUL PRAKTIKAN</Text>
              <Text style={styles.pageTitle}>Detail sesi</Text>
            </View>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View style={[styles.statusBadge, { backgroundColor: statusMeta.background }]}>
                <View style={[styles.statusDot, { backgroundColor: statusMeta.color }]} />
                <Text style={[styles.statusText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
              <Text style={styles.sessionCode}>{session.id.toUpperCase()}</Text>
            </View>

            <Text style={styles.courseTitle}>{session.namaPraktikum}</Text>

            <View style={styles.detailGrid}>
              <DetailItem label="Kelas" value={session.kelas} />
              <DetailItem label="Ruangan" value={session.ruangan} />
              <DetailItem label="Waktu" value={session.waktu} wide />
            </View>
          </View>

          {session.catatanAsisten ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoIcon}>i</Text>
              <View style={styles.infoCopy}>
                <Text style={styles.infoTitle}>Catatan asisten</Text>
                <Text style={styles.infoText}>{session.catatanAsisten}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>PRESENSI</Text>
              <Text style={styles.sectionTitle}>Konfirmasi kehadiran</Text>
            </View>
            <Text style={styles.studentNim}>{CURRENT_PRAKTIKAN.nim}</Text>
          </View>

          {attendance ? (
            <View style={styles.successCard}>
              <View style={styles.successIcon}>
                <Text style={styles.successIconText}>✓</Text>
              </View>
              <View style={styles.successCopy}>
                <Text style={styles.successTitle}>Sudah presensi</Text>
                <Text style={styles.successText}>
                  Kehadiran {CURRENT_PRAKTIKAN.nama} tercatat pada {attendance.waktuHadir}.
                </Text>
                {attendance.catatan ? (
                  <Text style={styles.successNote}>“{attendance.catatan}”</Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.inputLabel}>Catatan kehadiran</Text>
              <TextInput
                accessibilityLabel="Catatan kehadiran"
                editable={isSessionOpen}
                maxLength={120}
                multiline
                onChangeText={setCatatan}
                placeholder={
                  isSessionOpen
                    ? 'Contoh: Hadir tepat waktu'
                    : 'Form tersedia saat sesi dibuka'
                }
                placeholderTextColor="#98A2B3"
                style={[styles.input, !isSessionOpen && styles.inputDisabled]}
                textAlignVertical="top"
                value={catatan}
              />
              <Text style={styles.characterCount}>{catatan.length}/120</Text>

              {!isSessionOpen ? (
                <View style={styles.disabledNotice}>
                  <Text style={styles.disabledNoticeText}>
                    {session.status === 'BELUM_DIBUKA'
                      ? 'Presensi belum tersedia karena sesi belum dibuka.'
                      : 'Presensi tidak tersedia karena sesi sudah ditutup.'}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={!canAttend}
            onPress={submitAttendance}
            style={({ pressed }) => [
              styles.primaryButton,
              !canAttend && styles.primaryButtonDisabled,
              pressed && canAttend && styles.primaryButtonPressed,
            ]}>
            <Text
              style={[
                styles.primaryButtonText,
                !canAttend && styles.primaryButtonTextDisabled,
              ]}>
              {attendance ? 'Presensi sudah tercatat' : 'Hadir sekarang'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={openHistory}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>Lihat catatan kehadiran saya</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        animationType="fade"
        onRequestClose={() => setFeedbackVisible(false)}
        transparent
        visible={feedbackVisible}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Text style={styles.modalIconText}>✓</Text>
            </View>
            <Text style={styles.modalTitle}>Presensi berhasil</Text>
            <Text style={styles.modalText}>
              Kehadiranmu sudah tercatat dan tidak dapat dikirim ulang untuk sesi ini.
            </Text>
            <View style={styles.modalTimeCard}>
              <Text style={styles.modalTimeLabel}>Waktu kehadiran</Text>
              <Text style={styles.modalTime}>{attendance?.waktuHadir}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setFeedbackVisible(false)}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>Kembali ke detail</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={openHistory}
              style={({ pressed }) => [styles.modalLinkButton, pressed && styles.pressed]}>
              <Text style={styles.modalLinkText}>Buka riwayat kehadiran</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.detailItem, wide && styles.detailItemWide]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F5F7FB' },
  content: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 720,
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 14,
    width: '100%',
  },
  topBar: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E7EC',
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  backButtonText: { color: '#17233C', fontSize: 34, lineHeight: 36, marginTop: -3 },
  topBarCopy: { flex: 1 },
  eyebrow: { color: '#667085', fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
  pageTitle: { color: '#101828', fontSize: 25, fontWeight: '800', marginTop: 2 },
  heroCard: {
    backgroundColor: '#172E73',
    borderRadius: 24,
    overflow: 'hidden',
    padding: 22,
  },
  heroHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusDot: { borderRadius: 4, height: 8, width: 8 },
  statusText: { fontSize: 12, fontWeight: '800' },
  sessionCode: { color: '#B9C8FF', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  courseTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 31,
    marginTop: 22,
  },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  detailItem: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 120,
    padding: 13,
  },
  detailItemWide: { flexBasis: '100%' },
  detailLabel: { color: '#B9C8FF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  detailValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 5 },
  infoCard: {
    alignItems: 'flex-start',
    backgroundColor: '#EEF4FF',
    borderColor: '#C8D7FF',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  infoIcon: {
    backgroundColor: '#2D5BDB',
    borderRadius: 12,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    height: 24,
    lineHeight: 24,
    textAlign: 'center',
    width: 24,
  },
  infoCopy: { flex: 1 },
  infoTitle: { color: '#183B8F', fontSize: 13, fontWeight: '800' },
  infoText: { color: '#344054', fontSize: 13, lineHeight: 20, marginTop: 3 },
  sectionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sectionEyebrow: { color: '#2D5BDB', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  sectionTitle: { color: '#101828', fontSize: 21, fontWeight: '800', marginTop: 3 },
  studentNim: { color: '#667085', fontSize: 12, fontWeight: '700' },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E7EC',
    borderRadius: 20,
    borderWidth: 1,
    padding: 17,
  },
  inputLabel: { color: '#344054', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  input: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D0D5DD',
    borderRadius: 14,
    borderWidth: 1,
    color: '#101828',
    fontSize: 15,
    minHeight: 104,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputDisabled: { backgroundColor: '#F2F4F7', color: '#98A2B3' },
  characterCount: { color: '#98A2B3', fontSize: 11, marginTop: 7, textAlign: 'right' },
  disabledNotice: {
    backgroundColor: '#FFF7E8',
    borderRadius: 12,
    marginTop: 12,
    padding: 12,
  },
  disabledNoticeText: { color: '#7A4D00', fontSize: 13, lineHeight: 19 },
  successCard: {
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF3',
    borderColor: '#ABEFC6',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    padding: 18,
  },
  successIcon: {
    alignItems: 'center',
    backgroundColor: '#17B26A',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  successIconText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  successCopy: { flex: 1 },
  successTitle: { color: '#05603A', fontSize: 16, fontWeight: '800' },
  successText: { color: '#276749', fontSize: 13, lineHeight: 20, marginTop: 4 },
  successNote: { color: '#344054', fontSize: 13, fontStyle: 'italic', marginTop: 8 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2D5BDB',
    borderRadius: 15,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 18,
  },
  primaryButtonDisabled: { backgroundColor: '#E4E7EC' },
  primaryButtonPressed: { backgroundColor: '#2048B5', transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  primaryButtonTextDisabled: { color: '#98A2B3' },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#C7D3F7',
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
  },
  secondaryButtonText: { color: '#244AA5', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 15, 35, 0.6)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    maxWidth: 420,
    padding: 24,
    width: '100%',
  },
  modalIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#DDF8E8',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  modalIconText: { color: '#0E8C52', fontSize: 28, fontWeight: '900' },
  modalTitle: {
    color: '#101828',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 16,
    textAlign: 'center',
  },
  modalText: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  modalTimeCard: {
    alignItems: 'center',
    backgroundColor: '#F2F4F7',
    borderRadius: 14,
    marginBottom: 18,
    marginTop: 18,
    padding: 14,
  },
  modalTimeLabel: { color: '#667085', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  modalTime: { color: '#17233C', fontSize: 20, fontWeight: '900', marginTop: 3 },
  modalLinkButton: { alignItems: 'center', paddingTop: 16 },
  modalLinkText: { color: '#2D5BDB', fontSize: 14, fontWeight: '800' },
});
