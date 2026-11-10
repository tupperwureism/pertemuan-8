import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
  analyzeSentiment,
  type SentimentAnalysisResult,
} from '@/services/aiService';
import { subscribeClassById } from '@/services/attendanceService';
import { friendlyError } from '@/services/authService';
import {
  retryPermissionAi,
  submitPermission,
  subscribeMySessionPermission,
  toSentimentResultFromDoc,
  type PermissionDocWithMeta,
} from '@/services/permissionService';
import { subscribeSession } from '@/services/sessionService';
import type {
  ClassDoc,
  PermissionStatus,
  SessionDoc,
} from '@/types/firebase';

const PERMISSION_STATUS_META: Record<
  PermissionStatus,
  { label: string; background: string; color: string }
> = {
  PENDING: { label: 'Menunggu pemeriksaan', background: '#FEF3C7', color: '#92400E' },
  APPROVED: { label: 'Diterima', background: '#DCFCE7', color: '#166534' },
  REJECTED: { label: 'Ditolak', background: '#FEE2E2', color: '#991B1B' },
};

export default function PraktikanPermissionFormScreen() {
  const { sessionId: rawSessionId } = useLocalSearchParams<{
    sessionId?: string | string[];
  }>();
  const sessionId = (Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId) ?? '';
  const { uid, profile, status: authStatus } = useAuth();

  const [session, setSession] = useState<SessionDoc | null>(null);
  const [classDoc, setClassDoc] = useState<ClassDoc | null>(null);
  const [existingPermission, setExistingPermission] = useState<PermissionDocWithMeta | null>(null);

  const [alasan, setAlasan] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retryingAi, setRetryingAi] = useState(false);
  const [aiResult, setAiResult] = useState<SentimentAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubscribe = Boolean(sessionId && uid);

  useEffect(() => {
    if (!canSubscribe || !uid) {
      return;
    }

    let sessionDone = false;
    let permDone = false;
    const checkDone = () => {
      if (sessionDone && permDone) setLoading(false);
    };

    const unsubSession = subscribeSession(
      sessionId,
      (nextSession) => {
        setSession(nextSession);
        setErrorMessage(null);
        sessionDone = true;
        checkDone();
      },
      (err) => {
        setErrorMessage(friendlyError(err));
        setLoading(false);
      },
    );

    const unsubPerm = subscribeMySessionPermission(
      sessionId,
      uid,
      (nextPerm) => {
        setExistingPermission(nextPerm);
        if (nextPerm) {
          setAiResult(toSentimentResultFromDoc(nextPerm));
        }
        permDone = true;
        checkDone();
      },
      (err) => {
        setErrorMessage(friendlyError(err));
        setLoading(false);
      },
    );

    return () => {
      unsubSession();
      unsubPerm();
    };
  }, [canSubscribe, sessionId, uid]);

  useEffect(() => {
    if (!session?.classId || !uid) {
      return;
    }
    return subscribeClassById(session.classId, (nextClass) => {
      setClassDoc(nextClass);
    });
  }, [session?.classId, uid]);

  const dummyFallback = !uid ? DUMMY_SESSIONS.find((s) => s.id === sessionId) : undefined;
  const sessionTitle = classDoc
    ? `${classDoc.mataPraktikum} — ${session?.judul ?? ''}`
    : (session?.judul ?? dummyFallback?.namaPraktikum ?? `Sesi ${sessionId}`);
  const classCode = classDoc?.kodeKelas ?? classDoc?.nama ?? dummyFallback?.kelas ?? '-';

  async function handleAnalyzeSentiment() {
    if (!alasan.trim()) {
      Alert.alert('Validasi', 'Alasan izin harus diisi.');
      return;
    }

    setAnalyzing(true);
    try {
      const result = await analyzeSentiment(alasan);
      setAiResult(result);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSubmitPermission() {
    const cleanedReason = alasan.trim();

    if (!cleanedReason) {
      Alert.alert('Validasi', 'Alasan izin harus diisi.');
      return;
    }
    if (cleanedReason.length < 3) {
      Alert.alert('Validasi', 'Alasan izin minimal 3 karakter.');
      return;
    }
    if (cleanedReason.length > 1000) {
      Alert.alert('Validasi', 'Alasan izin maksimal 1000 karakter.');
      return;
    }

    setAnalyzing(true);
    setSubmitting(true);
    setErrorMessage(null);

    try {
      // Analisis kembali alasan terbaru sebelum menyimpan
      const latestAIResult = await analyzeSentiment(cleanedReason);
      setAiResult(latestAIResult);

      if (!uid) {
        Alert.alert(
          'Analisis Lokal Berhasil (Belum Login)',
          'Hasil analisis sentimen telah ditampilkan. Silakan login menggunakan akun praktikan untuk menyimpan pengajuan izin ke Cloud Firestore.',
        );
        return;
      }

      const output = await submitPermission({
        sessionId,
        classId: session?.classId,
        alasan: cleanedReason,
      });
      setAiResult(output.aiResult);

      Alert.alert('Berhasil', 'Pengajuan izin berhasil dikirim.');
    } catch (error) {
      console.error('Submit permission failed:', error);
      const msg =
        error instanceof Error && !('code' in error)
          ? error.message
          : friendlyError(error);
      setErrorMessage(msg);
      Alert.alert('Gagal', msg || 'Pengajuan izin belum berhasil disimpan.');
    } finally {
      setAnalyzing(false);
      setSubmitting(false);
    }
  }

  async function handleRetryAi() {
    if (!existingPermission) return;
    setRetryingAi(true);
    try {
      const updated = await retryPermissionAi(
        existingPermission.id,
        existingPermission.alasan,
      );
      setAiResult(updated);
    } catch (error) {
      Alert.alert('Gagal', friendlyError(error));
    } finally {
      setRetryingAi(false);
    }
  }

  if (authStatus === 'loading' || (canSubscribe && loading)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Memuat data pengajuan izin...</Text>
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
              <Text style={styles.eyebrow}>MODUL PRAKTIKAN · IZIN</Text>
              <Text style={styles.pageTitle}>Pengajuan izin praktikum</Text>
            </View>
          </View>

          <View style={styles.sessionBanner}>
            <Text style={styles.sessionBannerCode}>
              {classCode} · {sessionId.toUpperCase()}
            </Text>
            <Text style={styles.sessionBannerTitle}>{sessionTitle}</Text>
            <Text style={styles.sessionBannerStudent}>
              Pemohon: {profile?.nama ?? 'Praktikan'} ({profile?.nomorInduk ?? '-'})
            </Text>
          </View>

          {errorMessage ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Pemberitahuan</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {existingPermission ? (
            <View style={styles.existingCard}>
              <View style={styles.existingHeader}>
                <Text style={styles.existingTitle}>Pengajuan Izin Tercatat</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        PERMISSION_STATUS_META[existingPermission.status].background,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color: PERMISSION_STATUS_META[existingPermission.status].color,
                      },
                    ]}>
                    {PERMISSION_STATUS_META[existingPermission.status].label}
                  </Text>
                </View>
              </View>

              <Text style={styles.fieldLabel}>Alasan Izin:</Text>
              <View style={styles.reasonBox}>
                <Text style={styles.reasonBoxText}>{existingPermission.alasan}</Text>
              </View>

              <SentimentResultCard
                result={aiResult ?? toSentimentResultFromDoc(existingPermission)}
              />

              {existingPermission.status === 'PENDING' &&
              existingPermission.aiStatus === 'FAILED' ? (
                <Pressable
                  style={styles.retryButton}
                  onPress={handleRetryAi}
                  disabled={retryingAi}>
                  {retryingAi ? (
                    <ActivityIndicator color="#1D4ED8" />
                  ) : (
                    <Text style={styles.retryButtonText}>Coba Analisis Sentimen Lagi</Text>
                  )}
                </Pressable>
              ) : null}

              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push('/praktikan/izin' as never)}>
                <Text style={styles.secondaryButtonText}>Lihat Semua Riwayat Izin Saya</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Alasan Izin</Text>
              <Text style={styles.fieldHelper}>
                Tuliskan alasan ketidakhadiran Anda dengan jelas (3–1000 karakter).
              </Text>
              <TextInput
                accessibilityLabel="Alasan izin"
                editable={!analyzing && !submitting}
                maxLength={1000}
                multiline
                onChangeText={setAlasan}
                placeholder="Contoh: Saya sedang sakit demam dan perlu beristirahat sesuai saran dokter."
                placeholderTextColor="#94A3B8"
                style={styles.input}
                textAlignVertical="top"
                value={alasan}
              />
              <Text style={styles.charCount}>{alasan.trim().length}/1000</Text>

              <Pressable
                style={styles.analyzeButton}
                onPress={handleAnalyzeSentiment}
                disabled={analyzing || submitting}>
                {analyzing && !submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.analyzeButtonText}>Analisis Sentimen</Text>
                )}
              </Pressable>

              <SentimentResultCard result={aiResult} />

              <Pressable
                style={[
                  styles.submitButton,
                  (analyzing || submitting) && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmitPermission}
                disabled={analyzing || submitting}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Kirim Pengajuan Izin</Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F5F7FB' },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: { color: '#475569', fontSize: 14, fontWeight: '600' },
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
  sessionBanner: {
    backgroundColor: '#172E73',
    borderRadius: 20,
    gap: 6,
    padding: 18,
  },
  sessionBannerCode: {
    color: '#B9C8FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  sessionBannerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', lineHeight: 24 },
  sessionBannerStudent: { color: '#DBEAFE', fontSize: 12, fontWeight: '600', marginTop: 2 },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  errorTitle: { color: '#991B1B', fontSize: 13, fontWeight: '800' },
  errorText: { color: '#7F1D1D', fontSize: 12, lineHeight: 18, marginTop: 4 },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  fieldLabel: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  fieldHelper: { color: '#64748B', fontSize: 12, lineHeight: 18 },
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 14,
    borderWidth: 1,
    color: '#0F172A',
    fontSize: 15,
    minHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  charCount: { color: '#94A3B8', fontSize: 11, textAlign: 'right' },
  analyzeButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  analyzeButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  submitButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  existingCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  existingHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  existingTitle: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '800' },
  reasonBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  reasonBoxText: { color: '#1E293B', fontSize: 14, lineHeight: 21 },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  retryButtonText: { color: '#1D4ED8', fontSize: 13, fontWeight: '800' },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  secondaryButtonText: { color: '#1E293B', fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});

