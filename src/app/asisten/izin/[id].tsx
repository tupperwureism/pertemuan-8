import { getDoc } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SentimentResultCard from '@/components/SentimentResultCard';
import { useAuth } from '@/context/AuthContext';
import { subscribeClassById } from '@/services/attendanceService';
import { friendlyError } from '@/services/authService';
import { userRef } from '@/services/firebase';
import {
  reviewPermission,
  subscribePermissionById,
  toSentimentResultFromDoc,
  type PermissionDocWithMeta,
} from '@/services/permissionService';
import { subscribeSession } from '@/services/sessionService';
import { toUserDoc } from '@/services/userService';
import type {
  ClassDoc,
  FirestoreTimestamp,
  PermissionStatus,
  SessionDoc,
  UserDoc,
} from '@/types/firebase';

const STATUS_DISPLAY: Record<
  PermissionStatus,
  { label: string; background: string; color: string }
> = {
  PENDING: { label: 'Menunggu pemeriksaan', background: '#FEF3C7', color: '#92400E' },
  APPROVED: { label: 'Diterima', background: '#DCFCE7', color: '#166534' },
  REJECTED: { label: 'Ditolak', background: '#FEE2E2', color: '#991B1B' },
};

function formatTime(ts: FirestoreTimestamp | null | undefined): string {
  if (!ts) return '-';
  return `${new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ts.toDate())} WIB`;
}

function getSentimentSummaryText(perm: PermissionDocWithMeta): string {
  if (perm.aiLabel) {
    return `Sentimen ${perm.aiLabel}`;
  }
  if (perm.aiRaw?.status === 'unknown_vocabulary') {
    return 'Teks belum dapat dikenali model';
  }
  if (perm.aiRaw?.status === 'empty_input') {
    return 'Alasan masih kosong';
  }
  return 'Analisis tidak tersedia';
}

export default function AsistenPermissionDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const permissionId = (Array.isArray(rawId) ? rawId[0] : rawId) ?? '';
  const { uid, role, status: authStatus } = useAuth();

  const [permission, setPermission] = useState<PermissionDocWithMeta | null>(null);
  const [student, setStudent] = useState<UserDoc | null>(null);
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [classDoc, setClassDoc] = useState<ClassDoc | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<
    Extract<PermissionStatus, 'APPROVED' | 'REJECTED'> | null
  >(null);

  const canSubscribe = Boolean(permissionId && uid && role === 'asisten');

  useEffect(() => {
    if (!canSubscribe) {
      return;
    }

    return subscribePermissionById(
      permissionId,
      (nextPerm) => {
        setPermission(nextPerm);
        setErrorMessage(null);
        setLoading(false);
      },
      (err) => {
        setErrorMessage(friendlyError(err));
        setLoading(false);
      },
    );
  }, [canSubscribe, permissionId]);

  useEffect(() => {
    if (!permission?.sessionId || !uid) return;
    return subscribeSession(
      permission.sessionId,
      (nextSession) => setSession(nextSession),
      () => undefined,
    );
  }, [permission?.sessionId, uid]);

  useEffect(() => {
    if (!permission?.classId || !uid) return;
    return subscribeClassById(permission.classId, (nextClass) => setClassDoc(nextClass));
  }, [permission?.classId, uid]);

  useEffect(() => {
    const praktikanUid = permission?.praktikanUid;
    if (!praktikanUid || !uid || role !== 'asisten') return;
    let cancelled = false;

    void getDoc(userRef(praktikanUid))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          setStudent(toUserDoc(snap.id, snap.data() as Record<string, unknown>));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [permission?.praktikanUid, role, uid]);

  const handleConfirmDecision = async () => {
    if (!permission || !pendingDecision) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await reviewPermission(permission.id, pendingDecision);
      setPendingDecision(null);
      Alert.alert(
        'Keputusan Tersimpan',
        pendingDecision === 'APPROVED'
          ? 'Pengajuan izin praktikan telah diterima.'
          : 'Pengajuan izin praktikan telah ditolak.',
      );
    } catch (error) {
      const msg = friendlyError(error);
      setErrorMessage(msg);
      Alert.alert('Gagal Menyimpan Keputusan', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (authStatus === 'loading' || (canSubscribe && loading)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Memuat detail pengajuan izin...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!uid || role !== 'asisten') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Akses Dibatasi</Text>
          <Text style={styles.emptyText}>
            Hanya asisten yang dapat memeriksa dan memberikan keputusan izin.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/jadwal'))}>
            <Text style={styles.primaryButtonText}>Kembali</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Pengajuan Izin Tidak Ditemukan</Text>
          <Text style={styles.emptyText}>
            Dokumen izin dengan ID &ldquo;{permissionId}&rdquo; tidak ditemukan di Firestore.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/jadwal'))}>
            <Text style={styles.primaryButtonText}>Kembali</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const statusMeta = STATUS_DISPLAY[permission.status];
  const isPending = permission.status === 'PENDING';
  const courseName = classDoc
    ? `${classDoc.mataPraktikum} (${classDoc.kodeKelas})`
    : permission.classId;
  const sessionTitle = session?.judul ?? permission.sessionId;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
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
            <Text style={styles.eyebrow}>MODUL ASISTEN · DETAIL IZIN</Text>
            <Text style={styles.pageTitle}>Pemeriksaan izin</Text>
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Terjadi Kendala</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.studentBlock}>
              <Text style={styles.studentName}>{student?.nama ?? 'Praktikan'}</Text>
              <Text style={styles.studentNim}>
                NIM: {student?.nomorInduk ?? permission.praktikanUid}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusMeta.background }]}>
              <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>
                {statusMeta.label}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.metaLine}>Kelas: {courseName}</Text>
          <Text style={styles.metaLine}>Sesi: {sessionTitle}</Text>
          <Text style={styles.metaLine}>Waktu pengajuan: {formatTime(permission.createdAt)}</Text>
        </View>

        {/* Tampilan Detail Sesuai Instruksi PM Bagian 7 */}
        <View style={styles.detailCard}>
          <View style={styles.detailBlock}>
            <Text style={styles.detailHeading}>Alasan:</Text>
            <Text style={styles.detailBody}>{permission.alasan}</Text>
          </View>

          <View style={styles.detailBlock}>
            <Text style={styles.detailHeading}>Analisis AI:</Text>
            <Text style={styles.detailBodyHighlight}>
              {getSentimentSummaryText(permission)}
            </Text>
          </View>

          <View style={styles.detailBlock}>
            <Text style={styles.detailHeading}>Status:</Text>
            <Text style={styles.detailBody}>{statusMeta.label}</Text>
          </View>

          <View style={styles.noteBanner}>
            <Text style={styles.noteHeading}>Catatan:</Text>
            <Text style={styles.noteBody}>
              Hasil AI hanya informasi pendukung. Keputusan tetap dilakukan asisten.
            </Text>
          </View>
        </View>

        <SentimentResultCard result={toSentimentResultFromDoc(permission)} />

        {isPending ? (
          <View style={styles.decisionCard}>
            <Text style={styles.decisionTitle}>Keputusan Manual Asisten</Text>
            <Text style={styles.decisionSubtitle}>
              Periksa alasan praktikan di atas, lalu pilih keputusan akhir di bawah ini.
            </Text>
            <View style={styles.decisionButtonsRow}>
              <Pressable
                disabled={submitting}
                onPress={() => setPendingDecision('REJECTED')}
                style={({ pressed }) => [
                  styles.rejectButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.rejectButtonText}>Tolak Izin</Text>
              </Pressable>

              <Pressable
                disabled={submitting}
                onPress={() => setPendingDecision('APPROVED')}
                style={({ pressed }) => [
                  styles.approveButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.approveButtonText}>Terima Izin</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.decidedInfoCard}>
            <Text style={styles.decidedInfoTitle}>
              Keputusan Telah Disimpan ({statusMeta.label})
            </Text>
            <Text style={styles.decidedInfoText}>
              Diperiksa pada {formatTime(permission.reviewedAt)} oleh{' '}
              {permission.reviewedBy ?? '-'}.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setPendingDecision(null)}
        transparent
        visible={pendingDecision !== null}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {pendingDecision === 'APPROVED'
                ? 'Konfirmasi Terima Izin?'
                : 'Konfirmasi Tolak Izin?'}
            </Text>
            <Text style={styles.modalDescription}>
              {pendingDecision === 'APPROVED'
                ? 'Anda akan menyetujui pengajuan izin ini. Status akan langsung diperbarui secara real-time di akun praktikan.'
                : 'Anda akan menolak pengajuan izin ini. Keputusan yang sudah disimpan tidak dapat diubah kembali.'}
            </Text>

            <View style={styles.modalReasonPreview}>
              <Text style={styles.modalReasonLabel}>Alasan Praktikan:</Text>
              <Text style={styles.modalReasonText}>“{permission.alasan}”</Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                disabled={submitting}
                onPress={() => setPendingDecision(null)}
                style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </Pressable>

              <Pressable
                disabled={submitting}
                onPress={handleConfirmDecision}
                style={[
                  styles.modalConfirmBtn,
                  pendingDecision === 'APPROVED'
                    ? styles.approveBg
                    : styles.rejectBg,
                ]}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>
                    {pendingDecision === 'APPROVED' ? 'Ya, Terima' : 'Ya, Tolak'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F7FB' },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: { color: '#475569', fontSize: 14, fontWeight: '600' },
  emptyTitle: { color: '#0F172A', fontSize: 19, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: '#64748B', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 46,
    paddingHorizontal: 20,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
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
  pageTitle: { color: '#101828', fontSize: 23, fontWeight: '800', marginTop: 2 },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  errorTitle: { color: '#991B1B', fontSize: 13, fontWeight: '800' },
  errorText: { color: '#7F1D1D', fontSize: 12, lineHeight: 18, marginTop: 4 },
  summaryCard: {
    backgroundColor: '#172E73',
    borderRadius: 20,
    gap: 8,
    padding: 18,
  },
  summaryHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  studentBlock: { flex: 1, gap: 3 },
  studentName: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  studentNim: { color: '#DBEAFE', fontSize: 12, fontWeight: '600' },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  divider: { backgroundColor: 'rgba(255,255,255,0.16)', height: 1, marginVertical: 4 },
  metaLine: { color: '#E2E8F0', fontSize: 13, fontWeight: '600' },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  detailBlock: { gap: 4 },
  detailHeading: { color: '#475569', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  detailBody: { color: '#0F172A', fontSize: 15, lineHeight: 22 },
  detailBodyHighlight: {
    color: '#1E293B',
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  noteBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  noteHeading: { color: '#92400E', fontSize: 12, fontWeight: '800' },
  noteBody: { color: '#78350F', fontSize: 13, lineHeight: 19 },
  decisionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  decisionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  decisionSubtitle: { color: '#64748B', fontSize: 13, lineHeight: 19 },
  decisionButtonsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  rejectButton: {
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  rejectButtonText: { color: '#B91C1C', fontSize: 14, fontWeight: '800' },
  approveButton: {
    alignItems: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  approveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  decidedInfoCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 16,
  },
  decidedInfoTitle: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  decidedInfoText: { color: '#475569', fontSize: 12, lineHeight: 18 },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    gap: 14,
    maxWidth: 420,
    padding: 22,
    width: '100%',
  },
  modalTitle: { color: '#0F172A', fontSize: 19, fontWeight: '800' },
  modalDescription: { color: '#475569', fontSize: 13, lineHeight: 20 },
  modalReasonPreview: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  modalReasonLabel: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  modalReasonText: { color: '#0F172A', fontSize: 13, fontStyle: 'italic', lineHeight: 19 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalCancelBtn: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  modalCancelBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
  modalConfirmBtn: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  approveBg: { backgroundColor: '#16A34A' },
  rejectBg: { backgroundColor: '#DC2626' },
  modalConfirmBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});

