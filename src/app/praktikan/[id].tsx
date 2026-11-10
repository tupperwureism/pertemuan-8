import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import SentimentResultCard from '@/components/SentimentResultCard';
import { useAuth } from '@/context/AuthContext';
import { DUMMY_SESSIONS } from '@/data/dummyData';
import {
  recordAttendance,
  subscribeClassById,
  subscribeMySessionAttendance,
} from '@/services/attendanceService';
import { friendlyError } from '@/services/authService';
import {
  subscribeMySessionPermission,
  toSentimentResultFromDoc,
  type PermissionDocWithMeta,
} from '@/services/permissionService';
import { subscribeSession } from '@/services/sessionService';
import type {
  AttendanceDoc,
  ClassDoc,
  FirestoreTimestamp,
  PermissionStatus,
  SessionDoc,
  SessionStatus,
} from '@/types/firebase';

const STATUS_META: Record<SessionStatus, { label: string; background: string; color: string }> = {
  BELUM_DIBUKA: { label: 'Belum dibuka', background: '#FFF4D6', color: '#8A5A00' },
  DIBUKA: { label: 'Sedang dibuka', background: '#DDF8E8', color: '#146C43' },
  DITUTUP: { label: 'Sesi ditutup', background: '#FFE1E1', color: '#A12727' },
};

const PERMISSION_STATUS_META: Record<
  PermissionStatus,
  { label: string; background: string; color: string }
> = {
  PENDING: { label: 'Menunggu pemeriksaan', background: '#FEF3C7', color: '#92400E' },
  APPROVED: { label: 'Izin diterima', background: '#DCFCE7', color: '#166534' },
  REJECTED: { label: 'Izin ditolak', background: '#FEE2E2', color: '#991B1B' },
};

function formatTimestamp(ts: FirestoreTimestamp | null | undefined): string {
  if (!ts) {
    return `${new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date())} WIB`;
  }
  const date = ts.toDate();
  return `${new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)} WIB`;
}

function formatSessionWindow(
  startsAt: FirestoreTimestamp | null | undefined,
  endsAt: FirestoreTimestamp | null | undefined,
): string {
  if (!startsAt) return '-';
  const start = startsAt.toDate();
  const dayDate = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(start);
  const startClock = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(start);

  if (!endsAt) return `${dayDate}, ${startClock} WIB`;
  const endClock = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(endsAt.toDate());
  return `${dayDate}, ${startClock} - ${endClock} WIB`;
}

export default function PraktikanSessionDetail() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const sessionId = (Array.isArray(id) ? id[0] : id) ?? '';
  const { uid, profile, status: authStatus } = useAuth();

  const [session, setSession] = useState<SessionDoc | null>(null);
  const [classDoc, setClassDoc] = useState<ClassDoc | null>(null);
  const [attendance, setAttendance] = useState<AttendanceDoc | null>(null);
  const [permission, setPermission] = useState<PermissionDocWithMeta | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [catatan, setCatatan] = useState<string>('');
  const [feedbackVisible, setFeedbackVisible] = useState<boolean>(false);

  const canSubscribe = Boolean(sessionId && uid);

  // Listener real-time untuk dokumen sesi, presensi praktikan, dan izin praktikan
  useEffect(() => {
    if (!canSubscribe || !uid) {
      return;
    }

    let sessionLoaded = false;
    let attendanceLoaded = false;
    const markReady = () => {
      if (sessionLoaded && attendanceLoaded) {
        setLoading(false);
      }
    };

    const unsubSession = subscribeSession(
      sessionId,
      (nextSession) => {
        setSession(nextSession);
        setErrorMessage(null);
        sessionLoaded = true;
        markReady();
      },
      (err) => {
        setErrorMessage(friendlyError(err));
        setLoading(false);
      },
    );

    const unsubAttendance = subscribeMySessionAttendance(
      sessionId,
      uid,
      (nextAttendance) => {
        setAttendance(nextAttendance);
        attendanceLoaded = true;
        markReady();
      },
      (err) => {
        setErrorMessage(friendlyError(err));
        setLoading(false);
      },
    );

    const unsubPermission = subscribeMySessionPermission(
      sessionId,
      uid,
      (nextPermission) => {
        setPermission(nextPermission);
      },
      () => {
        // Jangan blokir layar presensi bila listener izin gagal
      },
    );

    return () => {
      unsubSession();
      unsubAttendance();
      unsubPermission();
    };
  }, [canSubscribe, sessionId, uid]);

  // Listener informasi kelas untuk menampilkan nama praktikum dan kode kelas
  useEffect(() => {
    const targetClassId = session?.classId;
    if (!targetClassId || !uid) {
      return;
    }
    return subscribeClassById(targetClassId, (nextClass) => {
      setClassDoc(nextClass);
    });
  }, [session?.classId, uid]);

  // Fallback tampilan lokal bila belum login Firebase & membuka ID dummy Sprint 1
  const dummyFallback = !uid ? DUMMY_SESSIONS.find((s) => s.id === sessionId) : undefined;

  const effectiveStatus: SessionStatus =
    session?.status ?? dummyFallback?.status ?? 'BELUM_DIBUKA';
  const statusMeta = STATUS_META[effectiveStatus];

  const courseTitle = classDoc
    ? `${classDoc.mataPraktikum} — ${ session?.judul ?? '' }`
    : (session?.judul ?? dummyFallback?.namaPraktikum ?? 'Sesi Praktikum');
  const kodeKelas = classDoc?.kodeKelas ?? classDoc?.nama ?? dummyFallback?.kelas ?? '-';
  const ruangan = session?.ruangan ?? dummyFallback?.ruangan ?? '-';
  const waktuLabel = session
    ? formatSessionWindow(session.startsAt, session.endsAt)
    : (dummyFallback?.waktu ?? '-');
  const catatanAsisten = session?.catatan ?? dummyFallback?.catatanAsisten ?? '';

  const studentName = profile?.nama ?? (uid ? 'Praktikan' : 'Belum Login (Mode Pratinjau)');
  const studentNim = profile?.nomorInduk ?? (uid ? uid.slice(0, 8) : '-');

  const isSessionOpen = effectiveStatus === 'DIBUKA';
  const canAttend = Boolean(uid && session && isSessionOpen && !attendance && !submitting);

  const handleSubmitAttendance = async () => {
    if (!uid) {
      Alert.alert(
        'Perlu Login Firebase',
        'Silakan masuk menggunakan akun praktikan terlebih dahulu untuk mencatat presensi ke Firestore.',
      );
      return;
    }
    if (!canAttend) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await recordAttendance(sessionId, uid, catatan.trim() || undefined);
      setFeedbackVisible(true);
    } catch (err) {
      const msg =
        err instanceof Error && !('code' in err) ? err.message : friendlyError(err);
      setErrorMessage(msg);
      Alert.alert('Gagal Presensi', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const openHistory = () => {
    setFeedbackVisible(false);
    router.push('/praktikan/riwayat');
  };

  const openPermissionForm = () => {
    router.push(`/praktikan/izin/${sessionId}` as never);
  };

  const openPermissionList = () => {
    router.push('/praktikan/izin' as never);
  };

  if (authStatus === 'loading' || (canSubscribe && loading)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color="#2D5BDB" />
          <Text style={styles.loadingText}>Memuat data sesi dari Firestore...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (uid && !session && !errorMessage) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centeredContainer}>
          <Text style={styles.emptyTitle}>Sesi Tidak Ditemukan</Text>
          <Text style={styles.emptySubtitle}>
            Sesi dengan ID &ldquo;{sessionId}&rdquo; tidak tersedia atau Anda bukan anggota kelas ini.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/jadwal'))}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
            <Text style={styles.primaryButtonText}>Kembali ke Jadwal</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
              <Text style={styles.pageTitle}>Detail sesi & presensi</Text>
            </View>
          </View>

          {!uid ? (
            <View style={styles.warningBanner}>
              <Text style={styles.warningBannerTitle}>Mode Pratinjau (Belum Login Firebase)</Text>
              <Text style={styles.warningBannerText}>
                Anda sedang melihat data pratinjau. Login dengan akun praktikan untuk mencatat presensi ke Firestore, atau buka halaman Pengajuan Izin di bawah untuk menguji model AI sentimen lokal.
              </Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerTitle}>Terjadi Kendala</Text>
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View style={[styles.statusBadge, { backgroundColor: statusMeta.background }]}>
                <View style={[styles.statusDot, { backgroundColor: statusMeta.color }]} />
                <Text style={[styles.statusText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
              <Text style={styles.sessionCode}>{sessionId.toUpperCase()}</Text>
            </View>

            <Text style={styles.courseTitle}>{courseTitle}</Text>

            <View style={styles.detailGrid}>
              <DetailItem label="Kelas" value={kodeKelas} />
              <DetailItem label="Ruangan" value={ruangan} />
              <DetailItem label="Waktu" value={waktuLabel} wide />
            </View>
          </View>

          {catatanAsisten ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoIcon}>i</Text>
              <View style={styles.infoCopy}>
                <Text style={styles.infoTitle}>Catatan asisten</Text>
                <Text style={styles.infoText}>{catatanAsisten}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>PRESENSI</Text>
              <Text style={styles.sectionTitle}>Konfirmasi kehadiran</Text>
            </View>
            <Text style={styles.studentNim}>
              {studentName} · {studentNim}
            </Text>
          </View>

          {attendance ? (
            <View style={styles.successCard}>
              <View style={styles.successIcon}>
                <Text style={styles.successIconText}>✓</Text>
              </View>
              <View style={styles.successCopy}>
                <Text style={styles.successTitle}>Sudah presensi</Text>
                <Text style={styles.successText}>
                  Kehadiran {studentName} tercatat pada {formatTimestamp(attendance.attendedAt)}.
                </Text>
                {attendance.catatan ? (
                  <Text style={styles.successNote}>“{attendance.catatan}”</Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.inputLabel}>Catatan kehadiran (opsional)</Text>
              <TextInput
                accessibilityLabel="Catatan kehadiran"
                editable={isSessionOpen && !submitting}
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
                    {effectiveStatus === 'BELUM_DIBUKA'
                      ? 'Presensi belum tersedia karena sesi belum dibuka oleh asisten.'
                      : 'Presensi tidak tersedia karena sesi sudah ditutup.'}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={!canAttend}
            onPress={handleSubmitAttendance}
            style={({ pressed }) => [
              styles.primaryButton,
              !canAttend && styles.primaryButtonDisabled,
              pressed && canAttend && styles.primaryButtonPressed,
            ]}>
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text
                style={[
                  styles.primaryButtonText,
                  !canAttend && styles.primaryButtonTextDisabled,
                ]}>
                {attendance ? 'Presensi sudah tercatat' : 'Hadir sekarang'}
              </Text>
            )}
          </Pressable>

          {/* Bagian Pengajuan Izin (SRS-11 & SRS-12) */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>PENGAJUAN IZIN</Text>
              <Text style={styles.sectionTitle}>Berhalangan hadir?</Text>
            </View>
          </View>

          {permission ? (
            <View style={styles.permissionStatusCard}>
              <View style={styles.permissionStatusHeader}>
                <Text style={styles.permissionStatusTitle}>Status Izin Sesi Ini</Text>
                <View
                  style={[
                    styles.permissionBadge,
                    { backgroundColor: PERMISSION_STATUS_META[permission.status].background },
                  ]}>
                  <Text
                    style={[
                      styles.permissionBadgeText,
                      { color: PERMISSION_STATUS_META[permission.status].color },
                    ]}>
                    {PERMISSION_STATUS_META[permission.status].label}
                  </Text>
                </View>
              </View>
              <Text style={styles.permissionReasonLabel}>Alasan yang diajukan:</Text>
              <Text style={styles.permissionReasonText}>“{permission.alasan}”</Text>

              <SentimentResultCard result={toSentimentResultFromDoc(permission)} />

              <Pressable
                accessibilityRole="button"
                onPress={openPermissionList}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>Lihat semua status izin saya</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.permissionPromptCard}>
              <Text style={styles.permissionPromptText}>
                Jika Anda tidak dapat mengikuti sesi ini karena sakit atau keperluan mendesak, ajukan izin beserta alasannya.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={openPermissionForm}
                style={({ pressed }) => [styles.permissionActionBtn, pressed && styles.pressed]}>
                <Text style={styles.permissionActionBtnText}>Ajukan izin untuk sesi ini</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.bottomActionsRow}>
            <Pressable
              accessibilityRole="button"
              onPress={openHistory}
              style={({ pressed }) => [styles.secondaryButton, styles.flexButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>Riwayat kehadiran</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={openPermissionList}
              style={({ pressed }) => [styles.secondaryButton, styles.flexButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>Daftar izin saya</Text>
            </Pressable>
          </View>
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
              Kehadiranmu sudah tercatat di Firestore dan tidak dapat dikirim ulang untuk sesi ini.
            </Text>
            <View style={styles.modalTimeCard}>
              <Text style={styles.modalTimeLabel}>Waktu kehadiran</Text>
              <Text style={styles.modalTime}>{formatTimestamp(attendance?.attendedAt)}</Text>
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
  centeredContainer: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: { color: '#475467', fontSize: 14, fontWeight: '600' },
  emptyTitle: { color: '#101828', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  emptySubtitle: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
    textAlign: 'center',
  },
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
  warningBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  warningBannerTitle: { color: '#92400E', fontSize: 13, fontWeight: '800' },
  warningBannerText: { color: '#78350F', fontSize: 12, lineHeight: 18 },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  errorBannerTitle: { color: '#991B1B', fontSize: 13, fontWeight: '800' },
  errorBannerText: { color: '#7F1D1D', fontSize: 12, lineHeight: 18 },
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
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 29,
    marginTop: 18,
  },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
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
  sectionTitle: { color: '#101828', fontSize: 20, fontWeight: '800', marginTop: 3 },
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
    minHeight: 96,
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
  permissionPromptCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E7EC',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 17,
  },
  permissionPromptText: { color: '#475467', fontSize: 13, lineHeight: 20 },
  permissionActionBtn: {
    alignItems: 'center',
    backgroundColor: '#EFF4FF',
    borderColor: '#B2CCFF',
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
  },
  permissionActionBtnText: { color: '#1D4ED8', fontSize: 14, fontWeight: '800' },
  permissionStatusCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E7EC',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 17,
  },
  permissionStatusHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  permissionStatusTitle: { color: '#101828', fontSize: 15, fontWeight: '800' },
  permissionBadge: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  permissionBadgeText: { fontSize: 11, fontWeight: '800' },
  permissionReasonLabel: { color: '#667085', fontSize: 12, fontWeight: '700' },
  permissionReasonText: { color: '#101828', fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  bottomActionsRow: { flexDirection: 'row', gap: 10 },
  flexButton: { flex: 1 },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#C7D3F7',
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
  },
  secondaryButtonText: { color: '#244AA5', fontSize: 13, fontWeight: '800', textAlign: 'center' },
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
  modalTime: { color: '#17233C', fontSize: 18, fontWeight: '900', marginTop: 3 },
  modalLinkButton: { alignItems: 'center', paddingTop: 16 },
  modalLinkText: { color: '#2D5BDB', fontSize: 14, fontWeight: '800' },
});
