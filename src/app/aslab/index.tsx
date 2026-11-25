import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  colors,
  ConfirmSheet,
  ErrorState,
  LoadingState,
} from '@/components/screen-kit';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/hooks/use-subscription';
import { formatSessionTime } from '@/lib/format';
import {
  formatRupiah,
  isInPeriod,
  subscribeAllFinesForAslab,
  subscribeAllLabs,
  subscribeAllPaymentTransactionsForAslab,
  subscribeAllSessionsForAslab,
  subscribeAllUsers,
  subscribeLabMembers,
  type DashboardPeriod,
} from '@/services/aslabService';
import { getErrorMessage } from '@/services/authService';
import { removePushToken } from '@/services/pushTokenService';
import type {
  FineDoc,
  FirestoreTimestamp,
  LabDoc,
  PaymentTransactionDoc,
  SessionDoc,
  UserDoc,
} from '@/types/firebase';

const dateTimeFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatDateTime(ts?: FirestoreTimestamp | null): string {
  return ts ? dateTimeFmt.format(ts.toDate()) : 'Menyimpan…';
}

const PERIOD_OPTIONS: { key: DashboardPeriod; label: string }[] = [
  { key: 'DAY', label: 'Hari' },
  { key: 'WEEK', label: 'Minggu' },
  { key: 'MONTH', label: 'Bulan' },
];

const TX_STATUS_BADGE: Record<
  PaymentTransactionDoc['status'],
  { label: string; bg: string; color: string }
> = {
  success: { label: 'Lunas', bg: '#DCFCE7', color: '#166534' },
  pending: { label: 'Pending', bg: '#FEF3C7', color: '#92400E' },
  failed: { label: 'Gagal', bg: '#FEE2E2', color: '#B91C1C' },
};

/** Dashboard Keberlangsungan Laboratorium & Riwayat Keuangan Denda (SRS-33). */
export default function AslabDashboardScreen() {
  const { profile, signOut } = useAuth();
  const [period, setPeriod] = useState<DashboardPeriod>('WEEK');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const subLabs = useCallback(
    (cb: Parameters<typeof subscribeAllLabs>[0], err: Parameters<typeof subscribeAllLabs>[1]) =>
      subscribeAllLabs(cb, err),
    [],
  );
  const subMembers = useCallback(
    (
      cb: Parameters<typeof subscribeLabMembers>[1],
      err: Parameters<typeof subscribeLabMembers>[2],
    ) => subscribeLabMembers(null, cb, err),
    [],
  );
  const subUsers = useCallback(
    (cb: Parameters<typeof subscribeAllUsers>[0], err: Parameters<typeof subscribeAllUsers>[1]) =>
      subscribeAllUsers(cb, err),
    [],
  );
  const subSessions = useCallback(
    (
      cb: Parameters<typeof subscribeAllSessionsForAslab>[0],
      err: Parameters<typeof subscribeAllSessionsForAslab>[1],
    ) => subscribeAllSessionsForAslab(cb, err),
    [],
  );
  const subFines = useCallback(
    (
      cb: Parameters<typeof subscribeAllFinesForAslab>[0],
      err: Parameters<typeof subscribeAllFinesForAslab>[1],
    ) => subscribeAllFinesForAslab(cb, err),
    [],
  );
  const subTxs = useCallback(
    (
      cb: Parameters<typeof subscribeAllPaymentTransactionsForAslab>[0],
      err: Parameters<typeof subscribeAllPaymentTransactionsForAslab>[1],
    ) => subscribeAllPaymentTransactionsForAslab(cb, err),
    [],
  );

  const { data: labs, loading: loadingLabs, error: errorLabs, retry: retryLabs } = useSubscription(subLabs);
  const { data: members } = useSubscription(subMembers);
  const { data: users } = useSubscription(subUsers);
  const { data: sessions, loading: loadingSessions, error: errorSessions, retry: retrySessions } =
    useSubscription(subSessions);
  const { data: fines } = useSubscription(subFines);
  const { data: transactions } = useSubscription(subTxs);

  const usersById = useMemo(() => {
    const map: Record<string, UserDoc> = {};
    (users ?? []).forEach((u) => {
      map[u.uid] = u;
    });
    return map;
  }, [users]);

  const labsById = useMemo(() => {
    const map: Record<string, LabDoc> = {};
    (labs ?? []).forEach((l) => {
      map[l.id] = l;
    });
    return map;
  }, [labs]);

  const uniquePraktikanCount = useMemo(() => {
    const fromMembers = new Set(
      (members ?? []).filter((m) => m.role === 'praktikan').map((m) => m.uid),
    );
    if (fromMembers.size > 0) return fromMembers.size;
    return (users ?? []).filter((u) => u.role === 'praktikan').length;
  }, [members, users]);

  const periodSessions = useMemo(
    () => (sessions ?? []).filter((s) => isInPeriod(s.startsAt?.toDate(), period)),
    [sessions, period],
  );

  const activeAndUpcomingSessions = useMemo(
    () =>
      periodSessions
        .filter((s) => s.status === 'DIBUKA' || s.status === 'BELUM_DIBUKA')
        .sort((a, b) => (a.startsAt?.toMillis() ?? 0) - (b.startsAt?.toMillis() ?? 0)),
    [periodSessions],
  );

  const pastSessions = useMemo(
    () => periodSessions.filter((s) => s.status === 'DITUTUP'),
    [periodSessions],
  );

  const latestTxByFineId = useMemo(() => {
    const map: Record<string, PaymentTransactionDoc> = {};
    (transactions ?? []).forEach((tx) => {
      if (!map[tx.fineId]) map[tx.fineId] = tx;
    });
    return map;
  }, [transactions]);

  const periodFines = useMemo(
    () =>
      (fines ?? []).filter((f) => {
        const latestTx = latestTxByFineId[f.id];
        return (
          isInPeriod(f.issuedAt ? f.issuedAt.toDate() : new Date(), period) ||
          isInPeriod(f.paidAt?.toDate(), period) ||
          isInPeriod((latestTx?.settledAt ?? latestTx?.createdAt)?.toDate(), period)
        );
      }),
    [fines, latestTxByFineId, period],
  );

  const financeSummary = useMemo(() => {
    let paid = 0;
    let unpaid = 0;
    periodFines.forEach((f) => {
      if (f.status === 'PAID') paid += f.amount;
      else unpaid += f.amount;
    });
    return { paid, unpaid };
  }, [periodFines]);

  const labStatusRows = useMemo(() => {
    const allSessions = sessions ?? [];
    return (labs ?? []).map((lab) => {
      const matching = allSessions.filter(
        (s) => s.labId === lab.id || (lab.classId && s.classId === lab.classId),
      );
      const openSession = matching.find((s) => s.status === 'DIBUKA');
      const upcomingSession = matching
        .filter((s) => s.status === 'BELUM_DIBUKA')
        .sort((a, b) => (a.startsAt?.toMillis() ?? 0) - (b.startsAt?.toMillis() ?? 0))[0];

      const relevant: SessionDoc | undefined = openSession ?? upcomingSession;
      const badge = openSession
        ? { label: 'Sedang Berlangsung', bg: '#DCFCE7', color: '#166534' }
        : upcomingSession
          ? { label: 'Akan Datang', bg: '#DBEAFE', color: '#1D4ED8' }
          : { label: 'Kosong', bg: '#F1F5F9', color: '#475569' };

      return { lab, badge, relevant };
    });
  }, [labs, sessions]);

  const handleConfirmLogout = async () => {
    setSigningOut(true);
    try {
      await removePushToken();
      await signOut();
    } finally {
      setSigningOut(false);
      setLogoutOpen(false);
    }
  };

  const renderFineStatusBadge = (fine: FineDoc) => {
    if (fine.status === 'PAID') {
      return { label: 'Lunas', bg: '#DCFCE7', color: '#166534' };
    }
    const latestTx = latestTxByFineId[fine.id];
    if (latestTx) return TX_STATUS_BADGE[latestTx.status];
    if (fine.latestPaymentStatus) return TX_STATUS_BADGE[fine.latestPaymentStatus];
    return { label: 'Belum Lunas', bg: '#FEE2E2', color: '#B91C1C' };
  };

  if (loadingLabs || loadingSessions) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoadingState label="Memuat dashboard Aslab…" />
      </SafeAreaView>
    );
  }

  const rootError = errorLabs ?? errorSessions;
  if (rootError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState
          message={getErrorMessage(rootError)}
          onRetry={() => {
            retryLabs();
            retrySessions();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.flex1}>
            <Text style={styles.eyebrow}>ASISTEN LABORATORIUM</Text>
            <Text style={styles.title}>Dashboard Aslab</Text>
            <Text style={styles.subtitle}>
              {profile?.nama ?? 'Aslab'} · {profile?.nomorInduk || 'ASLAB'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setLogoutOpen(true)}
            style={styles.logoutButton}
          >
            <Text style={styles.logoutText}>Keluar</Text>
          </Pressable>
        </View>

        {/* Pintasan Cepat */}
        <View style={styles.shortcutRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/aslab/labs' as Href)}
            style={styles.shortcutCard}
          >
            <Text style={styles.shortcutIcon}>🏫</Text>
            <Text style={styles.shortcutLabel}>Kelola Lab</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/aslab/distribusi' as Href)}
            style={styles.shortcutCard}
          >
            <Text style={styles.shortcutIcon}>👥</Text>
            <Text style={styles.shortcutLabel}>Distribusi &amp; Pindah</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/peta' as Href)}
            style={styles.shortcutCard}
          >
            <Text style={styles.shortcutIcon}>🗺️</Text>
            <Text style={styles.shortcutLabel}>Peta Lab</Text>
          </Pressable>
        </View>

        {/* Filter Periode */}
        <View style={styles.filterBar}>
          <Text style={styles.filterLabel}>Periode Pantauan:</Text>
          <View style={styles.filterChips}>
            {PERIOD_OPTIONS.map((opt) => {
              const active = period === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  accessibilityRole="button"
                  onPress={() => setPeriod(opt.key)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Ringkasan KPI */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{labs?.length ?? 0}</Text>
            <Text style={styles.kpiLabel}>Laboratorium</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{uniquePraktikanCount}</Text>
            <Text style={styles.kpiLabel}>Praktikan Aktif</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiValue, { color: colors.success }]}>
              {(sessions ?? []).filter((s) => s.status === 'DIBUKA').length}
            </Text>
            <Text style={styles.kpiLabel}>Sesi Berlangsung</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiValue, { fontSize: 16, color: colors.asisten }]}>
              {formatRupiah(financeSummary.paid)}
            </Text>
            <Text style={styles.kpiLabel}>
              Denda Lunas (Tunggakan {formatRupiah(financeSummary.unpaid)})
            </Text>
          </View>
        </View>

        {/* Status Kegiatan per Laboratorium */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Status Kegiatan per Laboratorium</Text>
          {labStatusRows.length === 0 ? (
            <Text style={styles.emptyNote}>Belum ada laboratorium yang dikelola.</Text>
          ) : (
            labStatusRows.map(({ lab, badge, relevant }) => (
              <View key={lab.id} style={styles.itemRow}>
                <View style={styles.itemTop}>
                  <View style={styles.flex1}>
                    <Text style={styles.itemTitle}>{lab.nama}</Text>
                    <Text style={styles.itemSub}>
                      {lab.gedung}
                      {lab.mataKuliah ? ` · ${lab.mataKuliah}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                </View>
                <Text style={styles.itemMeta}>
                  Radius {lab.radiusMeter} m · Toleransi {lab.gracePeriodMinutes ?? 15} mnt · Denda{' '}
                  {formatRupiah(lab.fineAmount ?? 10000)}
                </Text>
                {relevant ? (
                  <Text style={styles.itemTime}>
                    {relevant.judul} ({formatSessionTime(relevant.startsAt, relevant.endsAt)})
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>

        {/* Jadwal Berlangsung & Akan Datang */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Jadwal Berlangsung &amp; Akan Datang ({activeAndUpcomingSessions.length})
          </Text>
          {activeAndUpcomingSessions.length === 0 ? (
            <Text style={styles.emptyNote}>Tidak ada jadwal aktif atau mendatang pada periode ini.</Text>
          ) : (
            activeAndUpcomingSessions.map((s) => {
              const labName = (s.labId && labsById[s.labId]?.nama) || s.ruangan;
              const isOpen = s.status === 'DIBUKA';
              return (
                <View key={s.id} style={styles.itemRow}>
                  <View style={styles.itemTop}>
                    <Text style={[styles.itemTitle, styles.flex1]}>{s.judul}</Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: isOpen ? '#DCFCE7' : '#F1F5F9' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: isOpen ? '#166534' : '#475569' },
                        ]}
                      >
                        {isOpen ? 'Dibuka' : 'Belum Dibuka'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.itemSub}>Lokasi: {labName}</Text>
                  <Text style={styles.itemTime}>{formatSessionTime(s.startsAt, s.endsAt)}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Riwayat Kegiatan Laboratorium */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Riwayat Kegiatan Laboratorium ({pastSessions.length})
          </Text>
          {pastSessions.length === 0 ? (
            <Text style={styles.emptyNote}>Belum ada riwayat sesi selesai pada periode ini.</Text>
          ) : (
            pastSessions.map((s) => {
              const labName = (s.labId && labsById[s.labId]?.nama) || s.ruangan;
              return (
                <View key={s.id} style={styles.itemRow}>
                  <View style={styles.itemTop}>
                    <Text style={[styles.itemTitle, styles.flex1]}>{s.judul}</Text>
                    <View style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.badgeText, { color: '#B91C1C' }]}>Selesai</Text>
                    </View>
                  </View>
                  <Text style={styles.itemSub}>Lokasi: {labName}</Text>
                  <Text style={styles.itemTime}>{formatSessionTime(s.startsAt, s.endsAt)}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Riwayat Keuangan Hasil Denda */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Riwayat Keuangan Denda ({periodFines.length})
          </Text>
          {periodFines.length === 0 ? (
            <Text style={styles.emptyNote}>Belum ada tagihan atau transaksi denda pada periode ini.</Text>
          ) : (
            periodFines.map((fine) => {
              const student = usersById[fine.praktikanUid];
              const tx = latestTxByFineId[fine.id];
              const badge = renderFineStatusBadge(fine);
              const ts = fine.paidAt ?? tx?.settledAt ?? tx?.createdAt ?? fine.issuedAt;
              return (
                <View key={fine.id} style={styles.itemRow}>
                  <View style={styles.itemTop}>
                    <View style={styles.flex1}>
                      <Text style={styles.itemTitle}>
                        {student?.nama ?? fine.praktikanUid}
                      </Text>
                      <Text style={styles.itemSub}>
                        {fine.sessionTitle} · {fine.labName}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  </View>
                  <View style={styles.financeRow}>
                    <Text style={styles.financeAmount}>{formatRupiah(fine.amount)}</Text>
                    <Text style={styles.itemTime}>
                      Telat {fine.lateMinutes} mnt · {formatDateTime(ts)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={logoutOpen}
        title="Keluar dari akun?"
        message="Anda akan keluar dari sesi Aslab saat ini."
        confirmLabel="Ya, Keluar"
        loading={signingOut}
        onConfirm={() => void handleConfirmLogout()}
        onCancel={() => setLogoutOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 36 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: { fontSize: 11, fontWeight: '800', color: colors.asisten, letterSpacing: 0.6 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted },
  logoutButton: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutText: { fontSize: 12, fontWeight: '700', color: colors.dangerText },
  shortcutRow: { flexDirection: 'row', gap: 10 },
  shortcutCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    alignItems: 'center',
    gap: 6,
  },
  shortcutIcon: { fontSize: 22 },
  shortcutLabel: { fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'center' },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterLabel: { fontSize: 13, fontWeight: '700', color: colors.label },
  filterChips: { flexDirection: 'row', gap: 6 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
  },
  filterChipActive: { backgroundColor: colors.asisten },
  filterChipText: { fontSize: 12, fontWeight: '700', color: colors.label },
  filterChipTextActive: { color: '#FFFFFF' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  kpiValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  kpiLabel: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  emptyNote: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  itemRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 4,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  itemSub: { fontSize: 12, color: colors.label },
  itemMeta: { fontSize: 11, color: colors.textMuted },
  itemTime: { fontSize: 11, color: colors.textMuted },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  financeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  financeAmount: { fontSize: 13, fontWeight: '800', color: colors.text },
  flex1: { flex: 1 },
});
