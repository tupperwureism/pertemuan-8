import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SentimentResultCard from '@/components/SentimentResultCard';
import { useAuth } from '@/context/AuthContext';
import { getClassById } from '@/services/attendanceService';
import { friendlyError } from '@/services/authService';
import {
  retryPermissionAi,
  subscribePermissionsForUser,
  toSentimentResultFromDoc,
  type PermissionDocWithMeta,
} from '@/services/permissionService';
import { subscribeSessions } from '@/services/sessionService';
import type {
  ClassDoc,
  FirestoreTimestamp,
  PermissionStatus,
  SessionDoc,
} from '@/types/firebase';

const STATUS_BADGE: Record<
  PermissionStatus,
  { label: string; background: string; color: string }
> = {
  PENDING: { label: 'Menunggu pemeriksaan', background: '#FEF3C7', color: '#92400E' },
  APPROVED: { label: 'Diterima', background: '#DCFCE7', color: '#166534' },
  REJECTED: { label: 'Ditolak', background: '#FEE2E2', color: '#991B1B' },
};

function formatTime(ts: FirestoreTimestamp | null | undefined): string {
  if (!ts) return 'Baru saja';
  return `${new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ts.toDate())} WIB`;
}

export default function PraktikanPermissionListScreen() {
  const { uid, status: authStatus } = useAuth();

  const [permissions, setPermissions] = useState<PermissionDocWithMeta[]>([]);
  const [sessionMap, setSessionMap] = useState<Record<string, SessionDoc>>({});
  const [classMap, setClassMap] = useState<Record<string, ClassDoc>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      return;
    }

    const unsubPermissions = subscribePermissionsForUser(
      uid,
      (items) => {
        setPermissions(items);
        setErrorMessage(null);
        setLoading(false);
      },
      (err) => {
        setErrorMessage(friendlyError(err));
        setLoading(false);
      },
    );

    const unsubSessions = subscribeSessions(
      (sessions) => {
        const next: Record<string, SessionDoc> = {};
        sessions.forEach((s) => {
          next[s.id] = s;
        });
        setSessionMap(next);
      },
      () => undefined,
    );

    return () => {
      unsubPermissions();
      unsubSessions();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || permissions.length === 0) return;
    let cancelled = false;
    const uniqueClassIds = Array.from(
      new Set(permissions.map((p) => p.classId).filter(Boolean)),
    );

    void Promise.all(
      uniqueClassIds.map(async (cid) => {
        const cls = await getClassById(cid).catch(() => null);
        return [cid, cls] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, ClassDoc> = {};
      entries.forEach(([cid, cls]) => {
        if (cls) next[cid] = cls;
      });
      setClassMap((prev) => ({ ...prev, ...next }));
    });

    return () => {
      cancelled = true;
    };
  }, [permissions, uid]);

  const handleRetry = async (item: PermissionDocWithMeta) => {
    setRetryingId(item.id);
    try {
      await retryPermissionAi(item.id, item.alasan);
    } catch (err) {
      Alert.alert('Gagal', friendlyError(err));
    } finally {
      setRetryingId(null);
    }
  };

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
            <Text style={styles.eyebrow}>MODUL PRAKTIKAN</Text>
            <Text style={styles.pageTitle}>Riwayat & status izin</Text>
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Gagal memuat data izin</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {authStatus === 'loading' || (Boolean(uid) && loading) ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Memuat daftar pengajuan izin...</Text>
          </View>
        ) : !uid ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Anda belum login</Text>
            <Text style={styles.emptyText}>
              Silakan login dengan akun praktikan untuk memantau status pengajuan izin secara real-time, atau uji form analisis sentimen pada sesi sampel.
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push('/praktikan/izin/sesi-1' as never)}>
              <Text style={styles.primaryButtonText}>Uji Form Izin & Sentimen AI</Text>
            </Pressable>
          </View>
        ) : permissions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Belum ada pengajuan izin</Text>
            <Text style={styles.emptyText}>
              Anda belum pernah mengajukan izin ketidakhadiran. Buka detail sesi praktikum dari halaman jadwal untuk mengajukan izin.
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.replace('/jadwal')}>
              <Text style={styles.primaryButtonText}>Lihat Jadwal Praktikum</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {permissions.map((item) => {
              const sess = sessionMap[item.sessionId];
              const cls = classMap[item.classId];
              const title = cls
                ? `${cls.mataPraktikum}${sess ? ` - ${sess.judul}` : ''}`
                : (sess?.judul ?? `Sesi ${item.sessionId}`);
              const kelasCode = cls?.kodeKelas ?? cls?.nama ?? item.classId;
              const badge = STATUS_BADGE[item.status];

              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleGroup}>
                      <Text style={styles.cardMeta}>
                        {kelasCode} · {item.sessionId.toUpperCase()}
                      </Text>
                      <Text style={styles.cardTitle}>{title}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: badge.background }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.color }]}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.reasonContainer}>
                    <Text style={styles.reasonLabel}>Alasan Izin:</Text>
                    <Text style={styles.reasonValue}>{item.alasan}</Text>
                  </View>

                  <SentimentResultCard result={toSentimentResultFromDoc(item)} />

                  {item.status === 'PENDING' && item.aiStatus === 'FAILED' ? (
                    <Pressable
                      style={styles.retryButton}
                      onPress={() => handleRetry(item)}
                      disabled={retryingId === item.id}>
                      {retryingId === item.id ? (
                        <ActivityIndicator color="#1D4ED8" />
                      ) : (
                        <Text style={styles.retryButtonText}>Coba Analisis Sentimen Lagi</Text>
                      )}
                    </Pressable>
                  ) : null}

                  <View style={styles.cardFooter}>
                    <Text style={styles.footerTime}>
                      Diajukan: {formatTime(item.createdAt)}
                    </Text>
                    {item.reviewedAt ? (
                      <Text style={styles.footerTime}>
                        Diperiksa: {formatTime(item.reviewedAt)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  pageTitle: { color: '#101828', fontSize: 24, fontWeight: '800', marginTop: 2 },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  errorTitle: { color: '#991B1B', fontSize: 13, fontWeight: '800' },
  errorText: { color: '#7F1D1D', fontSize: 12, lineHeight: 18, marginTop: 4 },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E7EC',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    paddingVertical: 40,
  },
  loadingText: { color: '#475569', fontSize: 13, fontWeight: '600' },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 20,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 10,
    padding: 28,
  },
  emptyTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: '#64748B', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 46,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  list: { gap: 14 },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  cardTitleGroup: { flex: 1, gap: 3 },
  cardMeta: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  cardTitle: { color: '#0F172A', fontSize: 16, fontWeight: '800', lineHeight: 22 },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  reasonContainer: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  reasonLabel: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  reasonValue: { color: '#0F172A', fontSize: 14, lineHeight: 20 },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  retryButtonText: { color: '#1D4ED8', fontSize: 13, fontWeight: '800' },
  cardFooter: {
    borderTopColor: '#F1F5F9',
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  footerTime: { color: '#64748B', fontSize: 11, fontWeight: '600' },
  pressed: { opacity: 0.72 },
});

