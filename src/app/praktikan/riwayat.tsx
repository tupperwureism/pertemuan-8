import { router, type Href } from 'expo-router';
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

import { colors } from '@/components/screen-kit';
import { useAuth } from '@/context/AuthContext';
import { useMyFines } from '@/hooks/use-payments';
import { getClassById, subscribeMyAttendances } from '@/services/attendanceService';
import { getErrorMessage } from '@/services/authService';
import { formatRupiah } from '@/services/paymentService';
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
  const { data: myFines } = useMyFines(uid);

  const [attendances, setAttendances] = useState<AttendanceDoc[]>([]);
  const [sessionMap, setSessionMap] = useState<Record<string, SessionDoc>>({});
  const [classMap, setClassMap] = useState<Record<string, ClassDoc>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const unpaidSummary = useMemo(() => {
    const unpaid = (myFines ?? []).filter((fine) => fine.status === 'UNPAID');
    return {
      count: unpaid.length,
      total: unpaid.reduce((sum, fine) => sum + fine.amount, 0),
    };
  }, [myFines]);

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
        setErrorMessage(getErrorMessage(err));
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
        // Jangan gagalkan layar riwayat bila metadata sesi belum termuat.
      },
    );

    return () => {
      unsubAttendances();
      unsubSessions();
    };
  }, [uid]);

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

        <View style={styles.shortcutRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/praktikan/denda' as Href)}
            style={({ pressed }) => [
              styles.shortcutBtn,
              unpaidSummary.count > 0 ? styles.finesAlertBtn : styles.finesShortcutBtn,
              pressed && styles.pressed,
            ]}>
            <Text
              style={[
                styles.shortcutTitle,
                unpaidSummary.count > 0 ? styles.finesAlertTitle : styles.finesShortcutTitle,
              ]}>
              Tagihan &amp; Denda
            </Text>
            <Text
              style={[
                styles.shortcutSub,
                unpaidSummary.count > 0 ? styles.finesAlertSub : styles.finesShortcutSub,
              ]}>
              {unpaidSummary.count > 0
                ? `${unpaidSummary.count} belum dibayar (${formatRupiah(unpaidSummary.total)})`
                : 'Cek tagihan & riwayat'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/praktikan/izin' as Href)}
            style={({ pressed }) => [styles.shortcutBtn, styles.permissionSwitchBtn, pressed && styles.pressed]}>
            <Text style={styles.permissionSwitchText}>Status Izin</Text>
            <Text style={styles.permissionSwitchSub}>Riwayat pengajuan izin</Text>
          </Pressable>
        </View>

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
            <ActivityIndicator size="large" color={colors.praktikan} />
            <Text style={styles.loadingText}>Memuat catatan kehadiran dari Firestore...</Text>
          </View>
        ) : !uid ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>0</Text>
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
              <Text style={styles.emptyIconText}>0</Text>
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
                ? `${cls.mataPraktikum} - ${sess ? sess.judul : ''}`
                : (sess?.judul ?? `Sesi ${item.sessionId}`);
              const kelasLabel = cls?.kodeKelas ?? cls?.nama ?? item.classId;
              const isLate = item.timeliness === 'TERLAMBAT';
              const lateMins = item.lateMinutes ?? 0;
              const badgeLabel = isLate
                ? lateMins > 0
                  ? `Terlambat (+${lateMins} mnt)`
                  : 'Terlambat'
                : 'Tepat Waktu';

              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/praktikan/${item.sessionId}` as Href)}
                  style={({ pressed }) => [styles.historyCard, pressed && styles.pressed]}>
                  <View style={styles.timelineColumn}>
                    <View style={[styles.checkCircle, isLate && styles.lateCircle]}>
                      <Text style={[styles.checkText, isLate && styles.lateCircleText]}>
                        {isLate ? '!' : '✓'}
                      </Text>
                    </View>
                    {index < attendances.length - 1 ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={styles.historyContent}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyTitle}>{title}</Text>
                      <View style={[styles.presentBadge, isLate && styles.lateBadge]}>
                        <Text style={[styles.presentBadgeText, isLate && styles.lateBadgeText]}>
                          {badgeLabel}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.historyMeta}>
                      {kelasLabel} · {item.sessionId.toUpperCase()}
                    </Text>
                    <View style={styles.divider} />
                    <View style={styles.historyFooter}>
                      <View style={styles.timeBlock}>
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

                    {isLate ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push('/praktikan/denda' as Href)}
                        style={({ pressed }) => [styles.fineLinkRow, pressed && styles.pressed]}>
                        <Text style={styles.fineLinkText}>Lihat &amp; bayar tagihan denda</Text>
                      </Pressable>
                    ) : null}
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
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 720,
    paddingBottom: 40,
    paddingHorizontal: 16,
    paddingTop: 14,
    width: '100%',
  },
  topBar: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  backButtonText: { color: colors.text, fontSize: 34, lineHeight: 36, marginTop: -3 },
  topBarCopy: { flex: 1 },
  eyebrow: { color: '#475569', fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  pageTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#172E73',
    borderRadius: 20,
    flexDirection: 'row',
    padding: 18,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarText: { color: '#1E40AF', fontSize: 14, fontWeight: '900' },
  profileCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  profileName: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  profileNim: { color: '#DBEAFE', fontSize: 12, marginTop: 3 },
  totalBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    minWidth: 56,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  totalNumber: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  totalLabel: { color: '#DBEAFE', fontSize: 10, fontWeight: '700' },
  shortcutRow: {
    flexDirection: 'row',
    gap: 10,
  },
  shortcutBtn: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 2,
  },
  finesShortcutBtn: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  finesAlertBtn: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  shortcutTitle: { fontSize: 13, fontWeight: '800' },
  shortcutSub: { fontSize: 11, fontWeight: '600' },
  finesShortcutTitle: { color: colors.text },
  finesShortcutSub: { color: '#475569' },
  finesAlertTitle: { color: '#9A3412' },
  finesAlertSub: { color: '#9A3412' },
  permissionSwitchBtn: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  permissionSwitchText: { color: '#1E40AF', fontSize: 13, fontWeight: '800' },
  permissionSwitchSub: { color: '#1E40AF', fontSize: 11, fontWeight: '600' },
  errorCard: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  errorTitle: { color: colors.dangerText, fontSize: 13, fontWeight: '800' },
  errorText: { color: colors.dangerText, fontSize: 12, lineHeight: 18, marginTop: 4 },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    paddingVertical: 40,
  },
  loadingText: { color: '#475569', fontSize: 13, fontWeight: '600' },
  sectionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sectionEyebrow: { color: colors.praktikan, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 2 },
  itemCount: { color: '#475569', fontSize: 12, fontWeight: '700' },
  list: { gap: 12 },
  historyCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 16,
  },
  timelineColumn: { alignItems: 'center', marginRight: 13 },
  checkCircle: {
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  lateCircle: {
    backgroundColor: '#FFEDD5',
  },
  checkText: { color: '#166534', fontSize: 15, fontWeight: '900' },
  lateCircleText: { color: '#9A3412' },
  timelineLine: { backgroundColor: colors.border, flex: 1, marginTop: 7, minHeight: 22, width: 2 },
  historyContent: { flex: 1, minWidth: 0 },
  historyHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  historyTitle: { color: colors.text, flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 21 },
  presentBadge: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  lateBadge: {
    backgroundColor: '#FFEDD5',
    borderColor: '#FDBA74',
  },
  presentBadgeText: { color: '#166534', fontSize: 10, fontWeight: '800' },
  lateBadgeText: { color: '#9A3412' },
  historyMeta: { color: '#475569', fontSize: 12, marginTop: 5 },
  divider: { backgroundColor: colors.border, height: 1, marginVertical: 12 },
  historyFooter: { flexDirection: 'row', gap: 16 },
  timeBlock: { flex: 1, minWidth: 0 },
  footerLabel: { color: '#475569', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  footerValue: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  noteBlock: { flex: 1, minWidth: 0 },
  noteValue: { color: '#334155', fontSize: 12, lineHeight: 17, marginTop: 4 },
  fineLinkRow: {
    marginTop: 10,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FDBA74',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fineLinkText: {
    color: '#9A3412',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.inputBorder,
    borderRadius: 20,
    borderStyle: 'dashed',
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  emptyIconText: { color: colors.praktikan, fontSize: 28, fontWeight: '800' },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 16, textAlign: 'center' },
  emptyText: { color: '#475569', fontSize: 14, lineHeight: 21, marginTop: 7, textAlign: 'center' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.praktikan,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 48,
    paddingHorizontal: 22,
  },
  primaryButtonPressed: { backgroundColor: '#1D4ED8', transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.78 },
});
