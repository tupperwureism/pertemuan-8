import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  evaluateLocationCheck,
  LocationCheckCard,
} from '@/components/location-check-card';
import {
  colors,
  EmptyState,
  ErrorBanner,
  ErrorState,
  LoadingState,
  PrimaryButton,
  ScreenHeader,
} from '@/components/screen-kit';
import { useAuth } from '@/context/AuthContext';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useLabs, useSession } from '@/hooks/use-firestore-data';
import { useSubscription } from '@/hooks/use-subscription';
import { formatClock, formatSessionTime } from '@/lib/format';
import {
  recordAttendance,
  subscribeClassById,
  subscribeMySessionAttendance,
  type AttendanceLocation,
} from '@/services/attendanceService';
import { getErrorMessage } from '@/services/authService';
import {
  subscribeMySessionPermission,
  type PermissionDocWithMeta,
} from '@/services/permissionService';
import type {
  AttendanceDoc,
  ClassDoc,
  ErrorCallback,
  FirestoreTimestamp,
  SessionStatus,
} from '@/types/firebase';

const STATUS_META: Record<SessionStatus, { label: string; background: string; color: string }> = {
  BELUM_DIBUKA: { label: 'Belum dibuka', background: '#FFF4D6', color: '#8A5A00' },
  DIBUKA: { label: 'Sedang dibuka', background: '#DDF8E8', color: '#146C43' },
  DITUTUP: { label: 'Sesi ditutup', background: '#FFE1E1', color: '#A12727' },
};

function formatAttendedDateTime(ts: FirestoreTimestamp | null | undefined, fallback?: Date): string {
  if (!ts) {
    if (!fallback) return formatClock(ts);
    return `${new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(fallback)} WIB`;
  }
  return `${new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ts.toDate())} WIB`;
}

export default function PraktikanAttendanceScreen() {
  const { sessionId: rawSessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const sessionId = (Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId) ?? '';
  return <PraktikanAttendanceContent key={sessionId} sessionId={sessionId} />;
}

function PraktikanAttendanceContent({ sessionId }: { sessionId: string }) {
  const { uid, profile, status: authStatus } = useAuth();

  const {
    data: session,
    loading: sessionLoading,
    error: sessionError,
    retry: retrySession,
  } = useSession(sessionId || undefined);

  const {
    data: labs,
    loading: labsLoading,
    error: labsError,
    retry: retryLabs,
  } = useLabs();

  const location = useDeviceLocation({ watch: true });

  const subscribeAttendance = useCallback(
    (cb: (item: AttendanceDoc | null) => void, onError: ErrorCallback) =>
      subscribeMySessionAttendance(sessionId, uid, cb, onError),
    [sessionId, uid],
  );
  const {
    data: attendance,
    loading: attendanceLoading,
    error: attendanceError,
    retry: retryAttendance,
  } = useSubscription(sessionId && uid ? subscribeAttendance : null);

  const subscribePermission = useCallback(
    (cb: (item: PermissionDocWithMeta | null) => void, onError: ErrorCallback) =>
      subscribeMySessionPermission(sessionId, uid, cb, onError),
    [sessionId, uid],
  );
  const {
    data: permission,
    loading: permissionLoading,
  } = useSubscription(sessionId && uid ? subscribePermission : null);

  const targetClassId = session?.classId ?? '';
  const subscribeClass = useCallback(
    (cb: (item: ClassDoc | null) => void, onError: ErrorCallback) =>
      subscribeClassById(targetClassId, cb, onError),
    [targetClassId],
  );
  const { data: classDoc } = useSubscription(targetClassId && uid ? subscribeClass : null);

  const [catatan, setCatatan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedMeta, setSubmittedMeta] = useState<{
    distanceMeter: number | null;
    submittedAt: Date;
  } | null>(null);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (sessionId) {
      router.replace(`/praktikan/${sessionId}` as Href);
    } else {
      router.replace('/jadwal' as Href);
    }
  };

  if (authStatus === 'loading' || sessionLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Presensi Sesi" onBack={goBack} />
        <View style={styles.flexCenter}>
          <LoadingState label="Memuat data sesi presensi…" />
        </View>
      </SafeAreaView>
    );
  }

  if (sessionError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Presensi Sesi" onBack={goBack} />
        <View style={styles.flexCenter}>
          <ErrorState message={getErrorMessage(sessionError)} onRetry={retrySession} />
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Presensi Sesi" onBack={goBack} />
        <View style={styles.flexCenter}>
          <EmptyState
            icon="🔎"
            title="Sesi tidak ditemukan"
            subtitle={`Sesi dengan ID "${sessionId}" tidak tersedia atau Anda bukan anggota kelas ini.`}
            action={<PrimaryButton label="Kembali ke Jadwal" onPress={() => router.replace('/jadwal' as Href)} />}
          />
        </View>
      </SafeAreaView>
    );
  }

  const sessionLabId = typeof session.labId === 'string' && session.labId.trim().length > 0
    ? session.labId
    : null;
  const lab = sessionLabId ? (labs?.find((item) => item.id === sessionLabId) ?? null) : null;

  const locationCheck = evaluateLocationCheck({
    sessionLabId,
    lab,
    labsLoading,
    labsError,
    locationStatus: location.status,
    fix: location.fix,
    locationError: location.error,
  });

  const statusMeta = STATUS_META[session.status];
  const isSessionOpen = session.status === 'DIBUKA';
  const hasBlockingPermission = Boolean(permission && permission.status !== 'REJECTED');
  const isAlreadyAttended = Boolean(attendance);

  const canAttend = Boolean(
    uid &&
      isSessionOpen &&
      !isAlreadyAttended &&
      !attendanceLoading &&
      !attendanceError &&
      !permissionLoading &&
      !hasBlockingPermission &&
      locationCheck.canAttendByLocation &&
      !submitting,
  );

  let disabledReason: string | null = null;
  if (!canAttend && !submitting) {
    if (!uid) {
      disabledReason = 'Silakan masuk menggunakan akun praktikan terlebih dahulu.';
    } else if (isAlreadyAttended) {
      disabledReason = 'Presensi Anda sudah tercatat pada sesi ini.';
    } else if (attendanceLoading || permissionLoading) {
      disabledReason = 'Sedang memeriksa status kehadiran dan izin Anda.';
    } else if (attendanceError) {
      disabledReason = 'Status presensi gagal dimuat. Coba muat ulang terlebih dahulu.';
    } else if (hasBlockingPermission) {
      disabledReason =
        permission?.status === 'APPROVED'
          ? 'Presensi tidak tersedia karena izin Anda pada sesi ini sudah diterima.'
          : 'Presensi tidak tersedia karena pengajuan izin Anda sedang menunggu pemeriksaan.';
    } else if (session.status === 'BELUM_DIBUKA') {
      disabledReason = 'Sesi praktikum belum dibuka oleh asisten.';
    } else if (session.status === 'DITUTUP') {
      disabledReason = 'Sesi praktikum sudah ditutup.';
    } else if (!locationCheck.canAttendByLocation) {
      disabledReason = locationCheck.disabledReason;
    }
  }

  const handleSubmitAttendance = async () => {
    if (!canAttend || !uid) return;

    let locationPayload: AttendanceLocation | undefined;
    if (sessionLabId) {
      if (!location.fix) {
        setSubmitError('Lokasi perangkat belum tersedia. Perbarui lokasi lalu coba lagi.');
        return;
      }
      locationPayload = {
        latitude: location.fix.latitude,
        longitude: location.fix.longitude,
        accuracy: location.fix.accuracy,
      };
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await recordAttendance(sessionId, uid, catatan.trim() || undefined, locationPayload);
      setSubmittedMeta({
        distanceMeter: locationCheck.distanceMeter,
        submittedAt: new Date(),
      });
    } catch (err) {
      setSubmitError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const courseTitle = classDoc
    ? `${classDoc.mataPraktikum} — ${session.judul}`
    : session.judul;
  const classLabel = classDoc?.kodeKelas ?? classDoc?.nama ?? '-';
  const labDisplayName = lab?.nama ?? session.ruangan;
  const recordedDistance =
    typeof attendance?.distanceMeter === 'number'
      ? attendance.distanceMeter
      : submittedMeta?.distanceMeter ?? null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Presensi Sesi" onBack={goBack} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sessionCard}>
            <View style={styles.sessionTopRow}>
              <View style={[styles.statusBadge, { backgroundColor: statusMeta.background }]}>
                <View style={[styles.statusDot, { backgroundColor: statusMeta.color }]} />
                <Text style={[styles.statusText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
              <Text style={styles.studentTag}>
                {profile?.nama ?? 'Praktikan'}
              </Text>
            </View>

            <Text style={styles.sessionTitle}>{courseTitle}</Text>

            <View style={styles.metaGrid}>
              <MetaItem label="Kelas" value={classLabel} />
              <MetaItem label="Lab / Ruangan" value={labDisplayName} />
              <MetaItem
                label="Waktu"
                value={formatSessionTime(session.startsAt, session.endsAt)}
                wide
              />
            </View>

            {sessionLabId ? (
              <View style={styles.labInfoBox}>
                <Text style={styles.labInfoTitle}>
                  Titik Laboratorium: {lab ? lab.nama : 'Memuat…'}
                </Text>
                <Text style={styles.labInfoSub}>
                  {lab
                    ? `${lab.gedung} · Radius presensi ${lab.radiusMeter} m`
                    : 'Memeriksa informasi gedung dan radius laboratorium…'}
                </Text>
              </View>
            ) : (
              <View style={styles.labInfoBox}>
                <Text style={styles.labInfoTitle}>Ruangan: {session.ruangan}</Text>
                <Text style={styles.labInfoSub}>
                  Sesi ini tidak memiliki titik koordinat laboratorium.
                </Text>
              </View>
            )}
          </View>

          {attendanceError ? (
            <View style={styles.errorCard}>
              <ErrorBanner message={getErrorMessage(attendanceError)} />
              <PrimaryButton label="Muat ulang status presensi" tone="neutral" onPress={retryAttendance} />
            </View>
          ) : null}

          {isAlreadyAttended ? (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <View style={styles.resultIcon}>
                  <Text style={styles.resultIconText}>✓</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.resultTitle}>Presensi berhasil tercatat</Text>
                  <Text style={styles.resultSub}>
                    Kehadiran Anda pada sesi ini sudah tersimpan di Firestore.
                  </Text>
                </View>
              </View>

              <View style={styles.resultStatsRow}>
                <View style={styles.resultStatBox}>
                  <Text style={styles.resultStatLabel}>Waktu hadir</Text>
                  <Text style={styles.resultStatValue}>
                    {formatAttendedDateTime(attendance?.attendedAt, submittedMeta?.submittedAt)}
                  </Text>
                </View>
                {recordedDistance !== null ? (
                  <View style={styles.resultStatBox}>
                    <Text style={styles.resultStatLabel}>Jarak ke lab</Text>
                    <Text style={styles.resultStatValue}>{recordedDistance} m</Text>
                  </View>
                ) : null}
              </View>

              {attendance?.catatan ? (
                <Text style={styles.resultNote}>Catatan: “{attendance.catatan}”</Text>
              ) : null}

              <View style={styles.resultActionsRow}>
                <View style={styles.flex}>
                  <PrimaryButton
                    label="Riwayat kehadiran"
                    tone="praktikan"
                    onPress={() => router.push('/praktikan/riwayat' as Href)}
                  />
                </View>
                <View style={styles.flex}>
                  <PrimaryButton label="Kembali" tone="neutral" onPress={goBack} />
                </View>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>VERIFIKASI LOKASI</Text>
                <LocationCheckCard
                  evaluation={locationCheck}
                  lab={lab}
                  locationError={location.error}
                  labsErrorMessage={labsError ? getErrorMessage(labsError) : null}
                  onRefreshLocation={location.refresh}
                  onOpenSettings={location.openSettings}
                  onRetryLabs={retryLabs}
                />
              </View>

              <View style={styles.noteCard}>
                <Text style={styles.noteLabel}>Catatan kehadiran (opsional)</Text>
                <TextInput
                  accessibilityLabel="Catatan kehadiran"
                  editable={canAttend}
                  maxLength={120}
                  multiline
                  onChangeText={setCatatan}
                  placeholder={
                    canAttend
                      ? 'Contoh: Hadir tepat waktu'
                      : 'Catatan dapat diisi saat syarat presensi terpenuhi'
                  }
                  placeholderTextColor="#94A3B8"
                  style={[styles.noteInput, !canAttend && styles.noteInputDisabled]}
                  textAlignVertical="top"
                  value={catatan}
                />
                <Text style={styles.charCount}>{catatan.length}/120</Text>
              </View>
            </>
          )}

          {submitError ? (
            <View style={styles.errorCard}>
              <ErrorBanner message={submitError} />
              <PrimaryButton
                label="Coba lagi"
                tone="neutral"
                onPress={() => {
                  if (canAttend) {
                    void handleSubmitAttendance();
                  } else {
                    setSubmitError(null);
                    location.refresh();
                  }
                }}
              />
            </View>
          ) : null}

          {disabledReason ? (
            <View style={styles.disabledReasonBox}>
              <Text style={styles.disabledReasonText}>{disabledReason}</Text>
            </View>
          ) : null}

          <PrimaryButton
            label={isAlreadyAttended ? 'Presensi sudah tercatat' : 'Presensi sekarang'}
            tone="praktikan"
            disabled={!canAttend}
            loading={submitting}
            onPress={() => void handleSubmitAttendance()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MetaItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.metaItem, wide && styles.metaItemWide]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexCenter: { flex: 1, justifyContent: 'center' },
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 720,
    paddingBottom: 40,
    paddingHorizontal: 16,
    paddingTop: 16,
    width: '100%',
  },
  sessionCard: {
    backgroundColor: '#172E73',
    borderRadius: 20,
    gap: 14,
    padding: 18,
  },
  sessionTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusDot: { borderRadius: 4, height: 8, width: 8 },
  statusText: { fontSize: 12, fontWeight: '800' },
  studentTag: { color: '#C7D7FE', fontSize: 12, fontWeight: '700' },
  sessionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 27,
  },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaItem: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 120,
    padding: 11,
  },
  metaItemWide: { flexBasis: '100%' },
  metaLabel: {
    color: '#B9C8FF',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metaValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginTop: 4 },
  labInfoBox: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    gap: 2,
    padding: 12,
  },
  labInfoTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  labInfoSub: { color: '#DBEAFE', fontSize: 12, lineHeight: 18 },
  sectionBlock: { gap: 8 },
  sectionLabel: {
    color: colors.praktikan,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  noteCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  noteLabel: { color: colors.label, fontSize: 13, fontWeight: '800', marginBottom: 8 },
  noteInput: {
    backgroundColor: colors.bg,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 84,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteInputDisabled: { backgroundColor: '#F1F5F9', color: '#94A3B8' },
  charCount: { color: '#94A3B8', fontSize: 11, marginTop: 6, textAlign: 'right' },
  resultCard: {
    backgroundColor: '#ECFDF3',
    borderColor: '#ABEFC6',
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  resultHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  resultIcon: {
    alignItems: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  resultIconText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  resultTitle: { color: '#065F46', fontSize: 17, fontWeight: '800' },
  resultSub: { color: '#166534', fontSize: 13, lineHeight: 19, marginTop: 2 },
  resultStatsRow: { flexDirection: 'row', gap: 10 },
  resultStatBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1FADF',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: 12,
  },
  resultStatLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  resultStatValue: { color: '#0F172A', fontSize: 14, fontWeight: '800', marginTop: 4 },
  resultNote: { color: '#334155', fontSize: 13, fontStyle: 'italic' },
  resultActionsRow: { flexDirection: 'row', gap: 10 },
  errorCard: { gap: 10 },
  disabledReasonBox: {
    backgroundColor: '#FFF7E8',
    borderColor: '#FDE68A',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  disabledReasonText: {
    color: '#7A4D00',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
});
