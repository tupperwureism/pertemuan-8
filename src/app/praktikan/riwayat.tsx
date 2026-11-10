import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { getClassById, subscribeMyAttendances } from '@/services/attendanceService';
import { friendlyError } from '@/services/authService';
import { subscribeSessions } from '@/services/sessionService';
import type {
  AttendanceDoc,
  ClassDoc,
  FirestoreTimestamp,
  SessionDoc,
} from '@/types/firebase';

function formatAttendedTime(ts: FirestoreTimestamp | null | undefined): string {
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'PR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export default function AttendanceHistoryScreen() {
  const { uid, profile, status: authStatus } = useAuth();

  const [attendances, setAttendances] = useState<AttendanceDoc[]>([]);
  const [sessionMap, setSessionMap] = useState<Record<string, SessionDoc>>({});
  const [classMap, setClassMap] = useState<Record<string, ClassDoc>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      return;
    }

    const unsubAttendances = subscribeMyAttendances(
      uid,
      (items) => {
        setAttendances(items);
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
        const nextMap: Record<string, SessionDoc> = {};
        sessions.forEach((s) => {
          nextMap[s.id] = s;
        });
        setSessionMap(nextMap);
      },
      () => {
        // Jangan gagalkan layar riwayat bila metadata sesi belum termuat
      },
    );

    return () => {
      unsubAttendances();
      unsubSessions();
    };
  }, [uid]);

  // Ambil detail kelas untuk classId yang muncul di daftar presensi
  useEffect(() => {
    if (!uid || attendances.length === 0) return;
    let cancelled = false;
    const uniqueClassIds = Array.from(new Set(attendances.map((a) => a.classId).filter(Boolean)));

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
  }, [attendances, uid]);

  const displayName = profile?.nama ?? (uid ? 'Praktikan' : 'Belum Login');
  const displayNim = profile?.nomorInduk ?? (uid ? uid.slice(0, 8) : '-');

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
            <Text style={styles.pageTitle}>Catatan kehadiran saya</Text>
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileNim}>{displayNim} · Praktikan</Text>
          </View>
          <View style={styles.totalBadge}>
            <Text style={styles.totalNumber}>{attendances.length}</Text>
            <Text style={styles.totalLabel}>Hadir</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/praktikan/izin' as never)}
          style={({ pressed }) => [styles.permissionSwitchBtn, pressed && styles.pressed]}>
          <Text style={styles.permissionSwitchText}>Lihat riwayat & status pengajuan izin saya →</Text>
        </Pressable>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Gagal memuat riwayat</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>RIWAYAT REAL-TIME</Text>
            <Text style={styles.sectionTitle}>Presensi tercatat</Text>
          </View>
          <Text style={styles.itemCount}>{attendances.length} catatan</Text>
        </View>

        {authStatus === 'loading' || (Boolean(uid) && loading) ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#2D5BDB" />
            <Text style={styles.loadingText}>Memuat catatan kehadiran dari Firestore...</Text>
          </View>
        ) : !uid ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>○</Text>
            </View>
            <Text style={styles.emptyTitle}>Anda belum login</Text>
            <Text style={styles.emptyText}>
              Silakan masuk menggunakan akun praktikan untuk melihat riwayat kehadiran yang tersimpan di Cloud Firestore.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>Ke halaman utama</Text>
            </Pressable>
          </View>
        ) : attendances.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>○</Text>
            </View>
            <Text style={styles.emptyTitle}>Belum ada catatan kehadiran</Text>
            <Text style={styles.emptyText}>
              Kehadiran yang berhasil dicatat pada sesi yang sedang dibuka akan muncul secara real-time di halaman ini.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/jadwal'))}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>Kembali ke jadwal</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {attendances.map((item, index) => {
              const sess = sessionMap[item.sessionId];
              const cls = classMap[item.classId];
              const title = cls
                ? `${cls.mataPraktikum}${sess ? ` - ${sess.judul}` : ''}`
                : (sess?.judul ?? `Sesi ${item.sessionId}`);
              const kelasLabel = cls?.kodeKelas ?? cls?.nama ?? item.classId;

              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/praktikan/${item.sessionId}` as never)}
                  style={({ pressed }) => [styles.historyCard, pressed && styles.pressed]}>
                  <View style={styles.timelineColumn}>
                    <View style={styles.checkCircle}>
                      <Text style={styles.checkText}>✓</Text>
                    </View>
                    {index < attendances.length - 1 ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={styles.historyContent}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyTitle}>{title}</Text>
                      <View style={styles.presentBadge}>
                        <Text style={styles.presentBadgeText}>Hadir</Text>
                      </View>
                    </View>
                    <Text style={styles.historyMeta}>
                      {kelasLabel} · {item.sessionId.toUpperCase()}
                    </Text>
                    <View style={styles.divider} />
                    <View style={styles.historyFooter}>
                      <View>
                        <Text style={styles.footerLabel}>Waktu tercatat</Text>
                        <Text style={styles.footerValue}>{formatAttendedTime(item.attendedAt)}</Text>
                      </View>
                      <View style={styles.noteBlock}>
                        <Text style={styles.footerLabel}>Catatan</Text>
                        <Text style={styles.noteValue} numberOfLines={2}>
                          {item.catatan || 'Hadir'}
                        </Text>
                      </View>
                    </View>
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
  content: {
    alignSelf: 'center',
    gap: 18,
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
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#172E73',
    borderRadius: 22,
    flexDirection: 'row',
    padding: 18,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#D9E2FF',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarText: { color: '#173E9A', fontSize: 14, fontWeight: '900' },
  profileCopy: { flex: 1, marginLeft: 12 },
  profileName: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  profileNim: { color: '#B9C8FF', fontSize: 12, marginTop: 3 },
  totalBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    minWidth: 56,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  totalNumber: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  totalLabel: { color: '#B9C8FF', fontSize: 10, fontWeight: '700' },
  permissionSwitchBtn: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderColor: '#C7D7FE',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  permissionSwitchText: { color: '#1D4ED8', fontSize: 13, fontWeight: '800' },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: 16,
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
  loadingText: { color: '#475467', fontSize: 13, fontWeight: '600' },
  sectionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sectionEyebrow: { color: '#2D5BDB', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  sectionTitle: { color: '#101828', fontSize: 21, fontWeight: '800', marginTop: 3 },
  itemCount: { color: '#667085', fontSize: 12, fontWeight: '700' },
  list: { gap: 12 },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E7EC',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 17,
  },
  timelineColumn: { alignItems: 'center', marginRight: 13 },
  checkCircle: {
    alignItems: 'center',
    backgroundColor: '#DDF8E8',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  checkText: { color: '#0E8C52', fontSize: 16, fontWeight: '900' },
  timelineLine: { backgroundColor: '#D0D5DD', flex: 1, marginTop: 7, minHeight: 22, width: 2 },
  historyContent: { flex: 1 },
  historyHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  historyTitle: { color: '#101828', flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 21 },
  presentBadge: { backgroundColor: '#ECFDF3', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  presentBadgeText: { color: '#067647', fontSize: 10, fontWeight: '800' },
  historyMeta: { color: '#667085', fontSize: 12, marginTop: 5 },
  divider: { backgroundColor: '#EAECF0', height: 1, marginVertical: 13 },
  historyFooter: { flexDirection: 'row', gap: 16 },
  footerLabel: { color: '#98A2B3', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  footerValue: { color: '#17233C', fontSize: 13, fontWeight: '800', marginTop: 4 },
  noteBlock: { flex: 1 },
  noteValue: { color: '#475467', fontSize: 12, lineHeight: 17, marginTop: 4 },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 22,
    borderStyle: 'dashed',
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 38,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  emptyIconText: { color: '#2D5BDB', fontSize: 38, lineHeight: 40 },
  emptyTitle: { color: '#101828', fontSize: 18, fontWeight: '800', marginTop: 17, textAlign: 'center' },
  emptyText: { color: '#667085', fontSize: 14, lineHeight: 21, marginTop: 7, textAlign: 'center' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2D5BDB',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 50,
    paddingHorizontal: 22,
  },
  primaryButtonPressed: { backgroundColor: '#2048B5', transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
