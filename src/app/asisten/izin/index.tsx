import { getDoc } from '@react-native-firebase/firestore';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { friendlyError } from '@/services/authService';
import { subscribeClasses } from '@/services/classService';
import { userRef } from '@/services/firebase';
import {
  subscribeAllPermissions,
  type PermissionDocWithMeta,
} from '@/services/permissionService';
import { subscribeSessions } from '@/services/sessionService';
import { toUserDoc } from '@/services/userService';
import type {
  ClassDoc,
  FirestoreTimestamp,
  PermissionStatus,
  SessionDoc,
  UserDoc,
} from '@/types/firebase';

type FilterStatus = 'SEMUA' | PermissionStatus;

const STATUS_BADGE: Record<
  PermissionStatus,
  { label: string; background: string; color: string }
> = {
  PENDING: { label: 'Menunggu pemeriksaan', background: '#FEF3C7', color: '#92400E' },
  APPROVED: { label: 'Diterima', background: '#DCFCE7', color: '#166534' },
  REJECTED: { label: 'Ditolak', background: '#FEE2E2', color: '#991B1B' },
};

const SENTIMENT_BADGE: Record<string, { label: string; background: string; color: string }> = {
  positif: { label: 'Sentimen positif', background: '#DCFCE7', color: '#15803D' },
  netral: { label: 'Sentimen netral', background: '#F1F5F9', color: '#475569' },
  negatif: { label: 'Sentimen negatif', background: '#FEE2E2', color: '#B91C1C' },
};

function formatTime(ts: FirestoreTimestamp | null | undefined): string {
  if (!ts) return 'Baru saja';
  return `${new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ts.toDate())} WIB`;
}

export default function AsistenPermissionListScreen() {
  const { uid, role, status: authStatus } = useAuth();

  const [permissions, setPermissions] = useState<PermissionDocWithMeta[]>([]);
  const [sessionMap, setSessionMap] = useState<Record<string, SessionDoc>>({});
  const [classMap, setClassMap] = useState<Record<string, ClassDoc>>({});
  const [userMap, setUserMap] = useState<Record<string, UserDoc>>({});
  const [selectedFilter, setSelectedFilter] = useState<FilterStatus>('SEMUA');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubscribe = Boolean(uid && role === 'asisten');

  useEffect(() => {
    if (!canSubscribe) {
      return;
    }

    const unsubPermissions = subscribeAllPermissions(
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

    const unsubClasses = subscribeClasses(
      (classes) => {
        const next: Record<string, ClassDoc> = {};
        classes.forEach((c) => {
          next[c.id] = c;
        });
        setClassMap(next);
      },
      () => undefined,
    );

    return () => {
      unsubPermissions();
      unsubSessions();
      unsubClasses();
    };
  }, [canSubscribe]);

  // Ambil profil praktikan untuk setiap praktikanUid pada daftar izin
  useEffect(() => {
    if (!uid || role !== 'asisten' || permissions.length === 0) return;
    let cancelled = false;
    const uniqueUids = Array.from(
      new Set(permissions.map((p) => p.praktikanUid).filter(Boolean)),
    );

    void Promise.all(
      uniqueUids.map(async (targetUid) => {
        try {
          const snap = await getDoc(userRef(targetUid));
          if (!snap.exists()) return [targetUid, null] as const;
          return [
            targetUid,
            toUserDoc(snap.id, snap.data() as Record<string, unknown>),
          ] as const;
        } catch {
          return [targetUid, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, UserDoc> = {};
      entries.forEach(([targetUid, docData]) => {
        if (docData) next[targetUid] = docData;
      });
      setUserMap((prev) => ({ ...prev, ...next }));
    });

    return () => {
      cancelled = true;
    };
  }, [permissions, role, uid]);

  const filteredPermissions = useMemo(() => {
    if (selectedFilter === 'SEMUA') return permissions;
    return permissions.filter((item) => item.status === selectedFilter);
  }, [permissions, selectedFilter]);

  if (authStatus === 'loading' || (canSubscribe && loading)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Memuat daftar pengajuan izin...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Role guard: tolak akses bila bukan asisten
  if (!uid || role !== 'asisten') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <Text style={styles.unauthorizedTitle}>Akses Dibatasi</Text>
          <Text style={styles.unauthorizedText}>
            Halaman pemeriksaan izin hanya dapat diakses oleh pengguna dengan peran Asisten.
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
            <Text style={styles.eyebrow}>MODUL ASISTEN · IZIN</Text>
            <Text style={styles.pageTitle}>Pemeriksaan pengajuan izin</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {(['SEMUA', 'PENDING', 'APPROVED', 'REJECTED'] as FilterStatus[]).map((filter) => {
            const active = selectedFilter === filter;
            const label =
              filter === 'SEMUA'
                ? 'Semua'
                : filter === 'PENDING'
                  ? 'Menunggu'
                  : filter === 'APPROVED'
                    ? 'Diterima'
                    : 'Ditolak';
            return (
              <Pressable
                key={filter}
                onPress={() => setSelectedFilter(filter)}
                style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Gagal memuat daftar izin</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {filteredPermissions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Tidak ada pengajuan izin</Text>
            <Text style={styles.emptyText}>
              Belum ada pengajuan izin praktikan untuk filter yang dipilih saat ini.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredPermissions.map((item) => {
              const student = userMap[item.praktikanUid];
              const sess = sessionMap[item.sessionId];
              const cls = classMap[item.classId];
              const studentName = student?.nama ?? 'Praktikan';
              const studentNim = student?.nomorInduk ?? item.praktikanUid.slice(0, 8);
              const sessionLabel = cls
                ? `${cls.mataPraktikum}${sess ? ` - ${sess.judul}` : ''}`
                : (sess?.judul ?? `Sesi ${item.sessionId}`);
              const classCode = cls?.kodeKelas ?? cls?.nama ?? item.classId;
              const statusMeta = STATUS_BADGE[item.status];
              const aiMeta = item.aiLabel ? SENTIMENT_BADGE[item.aiLabel] : null;

              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/asisten/izin/${item.id}` as never)}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.studentInfo}>
                      <Text style={styles.studentName}>{studentName}</Text>
                      <Text style={styles.studentNim}>{studentNim}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusMeta.background },
                      ]}>
                      <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>
                        {statusMeta.label}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.sessionMeta}>
                    {classCode} · {sessionLabel}
                  </Text>

                  <View style={styles.reasonBox}>
                    <Text style={styles.reasonText} numberOfLines={2}>
                      “{item.alasan}”
                    </Text>
                  </View>

                  <View style={styles.cardFooter}>
                    <View
                      style={[
                        styles.aiBadge,
                        {
                          backgroundColor: aiMeta?.background ?? '#F1F5F9',
                        },
                      ]}>
                      <Text
                        style={[
                          styles.aiBadgeText,
                          { color: aiMeta?.color ?? '#64748B' },
                        ]}>
                        AI (Pendukung):{' '}
                        {aiMeta?.label ??
                          (item.aiRaw?.status === 'unknown_vocabulary'
                            ? 'Belum dikenali model'
                            : 'Tidak tersedia')}
                      </Text>
                    </View>
                    <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
                  </View>
                </Pressable>
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
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: { color: '#475569', fontSize: 14, fontWeight: '600' },
  unauthorizedTitle: { color: '#0F172A', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  unauthorizedText: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
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
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#1E293B',
  },
  filterChipText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: '#FFFFFF' },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  errorTitle: { color: '#991B1B', fontSize: 13, fontWeight: '800' },
  errorText: { color: '#7F1D1D', fontSize: 12, lineHeight: 18, marginTop: 4 },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 20,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 8,
    padding: 28,
  },
  emptyTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: '#64748B', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  list: { gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  studentInfo: { flex: 1, gap: 2 },
  studentName: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  studentNim: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  sessionMeta: { color: '#334155', fontSize: 13, fontWeight: '700' },
  reasonBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  reasonText: { color: '#1E293B', fontSize: 13, fontStyle: 'italic', lineHeight: 19 },
  cardFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  aiBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  aiBadgeText: { fontSize: 11, fontWeight: '700' },
  timeText: { color: '#64748B', fontSize: 11, fontWeight: '600' },
  pressed: { opacity: 0.72 },
});

