import { router, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotificationStatusBanner } from '@/components/notification-status-banner';
import { colors, ConfirmSheet, EmptyState, ErrorState, LoadingState } from '@/components/screen-kit';
import { useAuth } from '@/context/AuthContext';
import { useSessions, useVisibleClasses } from '@/hooks/use-firestore-data';
import { useMyFines } from '@/hooks/use-payments';
import { usePushRegistration } from '@/hooks/use-push-registration';
import { formatSessionTime } from '@/lib/format';
import { getErrorMessage } from '@/services/authService';
import { formatRupiah } from '@/services/paymentService';
import { removePushToken } from '@/services/pushTokenService';
import type { SessionDoc, SessionStatus } from '@/types/firebase';

type FilterType = 'SEMUA' | SessionStatus;

const FILTER_LABEL: Record<FilterType, string> = {
  SEMUA: 'semua',
  DIBUKA: 'dibuka',
  BELUM_DIBUKA: 'belum dibuka',
  DITUTUP: 'ditutup',
};

export default function JadwalPraktikumScreen() {
  // Identitas hanya dari Firebase Auth + profil Firestore, bukan dari route param.
  const { uid, profile, role, signOut } = useAuth();
  const activeRole = role ?? 'praktikan';

  const { data: sessions, loading, error, retry } = useSessions();
  const { data: classes } = useVisibleClasses(role);
  const { data: myFines } = useMyFines(activeRole === 'praktikan' ? uid : null);
  const pushRegistration = usePushRegistration();

  const [selectedFilter, setSelectedFilter] = useState<FilterType>('SEMUA');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const classLabel = useMemo(() => {
    const map: Record<string, string> = {};
    (classes ?? []).forEach((c) => {
      map[c.id] = c.kodeKelas || c.nama;
    });
    return map;
  }, [classes]);

  const allSessions = useMemo(() => sessions ?? [], [sessions]);

  const filteredSessions = useMemo(
    () => allSessions.filter((s) => selectedFilter === 'SEMUA' || s.status === selectedFilter),
    [allSessions, selectedFilter],
  );

  const unpaidSummary = useMemo(() => {
    const unpaid = (myFines ?? []).filter((fine) => fine.status === 'UNPAID');
    return {
      count: unpaid.length,
      total: unpaid.reduce((sum, fine) => sum + fine.amount, 0),
    };
  }, [myFines]);

  const counts = {
    SEMUA: allSessions.length,
    DIBUKA: allSessions.filter((s) => s.status === 'DIBUKA').length,
    BELUM_DIBUKA: allSessions.filter((s) => s.status === 'BELUM_DIBUKA').length,
    DITUTUP: allSessions.filter((s) => s.status === 'DITUTUP').length,
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await removePushToken();
      await signOut();
    } finally {
      setLoggingOut(false);
      setConfirmLogout(false);
    }
  };

  const handleSessionPress = (session: SessionDoc) => {
    if (activeRole === 'aslab') {
      router.push('/aslab' as Href);
      return;
    }
    router.push((activeRole === 'asisten' ? `/asisten/${session.id}` : `/praktikan/${session.id}`) as Href);
  };

  const roleBadgeLabel =
    activeRole === 'aslab' ? 'ASLAB' : activeRole === 'asisten' ? 'ASPRAK' : 'PRAKTIKAN';

  const renderStatusBadge = (status: SessionStatus) => {
    switch (status) {
      case 'DIBUKA':
        return (
          <View style={[styles.statusBadge, styles.badgeDibuka]}>
            <View style={[styles.statusDot, styles.dotDibuka]} />
            <Text style={[styles.statusBadgeText, styles.textDibuka]}>Dibuka</Text>
          </View>
        );
      case 'BELUM_DIBUKA':
        return (
          <View style={[styles.statusBadge, styles.badgeBelumDibuka]}>
            <View style={[styles.statusDot, styles.dotBelumDibuka]} />
            <Text style={[styles.statusBadgeText, styles.textBelumDibuka]}>Belum Dibuka</Text>
          </View>
        );
      case 'DITUTUP':
        return (
          <View style={[styles.statusBadge, styles.badgeDitutup]}>
            <View style={[styles.statusDot, styles.dotDitutup]} />
            <Text style={[styles.statusBadgeText, styles.textDitutup]}>Ditutup</Text>
          </View>
        );
    }
  };

  const renderSessionItem = ({ item }: { item: SessionDoc }) => (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => handleSessionPress(item)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.kelasBadge}>
          <Text style={styles.kelasBadgeText}>Kelas {classLabel[item.classId] ?? '...'}</Text>
        </View>
        {renderStatusBadge(item.status)}
      </View>

      <Text style={styles.sessionTitle}>{item.judul}</Text>

      <View style={styles.detailsList}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Waktu:</Text>
          <Text style={styles.detailText}>{formatSessionTime(item.startsAt, item.endsAt)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Lokasi:</Text>
          <Text style={styles.detailText}>{item.ruangan}</Text>
        </View>
        {item.catatan ? (
          <View style={styles.catatanBox}>
            <Text style={styles.catatanLabel}>Pesan Asprak:</Text>
            <Text style={styles.catatanText}>{item.catatan}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <Text
          style={[
            styles.cardActionText,
            activeRole === 'aslab'
              ? styles.cardActionTextAslab
              : activeRole === 'asisten'
                ? styles.cardActionTextAsisten
                : styles.cardActionTextPraktikan,
          ]}
        >
          {activeRole === 'aslab'
            ? 'Buka Dashboard Aslab'
            : activeRole === 'asisten'
              ? 'Kelola Sesi (Asprak)'
              : 'Buka Detail & Presensi'}
        </Text>
      </View>
    </Pressable>
  );

  const renderFilterChip = (key: FilterType, label: string, activeStyle: object, activeTextStyle: object) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: selectedFilter === key }}
      style={[styles.filterChip, selectedFilter === key && activeStyle]}
      onPress={() => setSelectedFilter(key)}
    >
      <Text style={[styles.filterChipText, selectedFilter === key && activeTextStyle]}>
        {label} ({counts[key]})
      </Text>
    </Pressable>
  );

  const renderList = () => {
    if (loading) return <LoadingState label="Memuat jadwal..." />;
    if (error) return <ErrorState message={getErrorMessage(error)} onRetry={retry} />;
    return (
      <FlatList
        data={filteredSessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSessionItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          allSessions.length === 0 ? (
            <EmptyState
              icon="0"
              title="Belum ada jadwal praktikum"
              subtitle={
                activeRole === 'aslab'
                  ? 'Belum ada jadwal sesi praktikum di seluruh laboratorium.'
                  : activeRole === 'asisten'
                    ? 'Belum ada sesi praktikum. Buka Kelas Saya untuk membuat sesi pada kelas Anda.'
                    : 'Anda belum terdaftar pada kelas mana pun, atau belum ada sesi. Hubungi Asprak atau Aslab.'
              }
            />
          ) : (
            <EmptyState
              icon="?"
              title="Tidak ada praktikum ditemukan"
              subtitle={`Tidak ada sesi dengan filter "${FILTER_LABEL[selectedFilter]}".`}
            />
          )
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" style={styles.backButton} onPress={() => setConfirmLogout(true)}>
          <Text style={styles.backButtonText}>Keluar</Text>
        </Pressable>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>Jadwal Praktikum</Text>
          <Text style={styles.headerSubtitle}>Diperbarui real-time</Text>
        </View>
        {activeRole === 'asisten' ? (
          <Pressable
            accessibilityRole="button"
            style={styles.switchButton}
            onPress={() => router.push('/asisten/admin' as Href)}
          >
            <Text style={styles.switchButtonText}>Kelas Saya</Text>
          </Pressable>
        ) : activeRole === 'aslab' ? (
          <Pressable
            accessibilityRole="button"
            style={styles.aslabTopButton}
            onPress={() => router.push('/aslab' as Href)}
          >
            <Text style={styles.aslabTopButtonText}>Dashboard</Text>
          </Pressable>
        ) : (
          <View style={styles.topBarSpacer} />
        )}
      </View>

      <View style={styles.userBanner}>
        <View style={styles.userBannerLeft}>
          <View
            style={[
              styles.userRoleBadge,
              activeRole === 'aslab'
                ? styles.userRoleBadgeAslab
                : activeRole === 'asisten'
                  ? styles.userRoleBadgeAsisten
                  : styles.userRoleBadgePraktikan,
            ]}
          >
            <Text
              style={[
                styles.userRoleBadgeText,
                activeRole === 'aslab'
                  ? styles.userRoleBadgeTextAslab
                  : activeRole === 'asisten'
                    ? styles.userRoleBadgeTextAsisten
                    : styles.userRoleBadgeTextPraktikan,
              ]}
            >
              {roleBadgeLabel}
            </Text>
          </View>
          <View style={styles.userInfoTextContainer}>
            <Text style={styles.userNameText} numberOfLines={1}>
              {profile?.nama ?? '-'}
            </Text>
            <Text style={styles.userNimText}>
              {activeRole === 'praktikan' ? 'NIM' : 'Kode'}: {profile?.nomorInduk || '-'}
            </Text>
          </View>
        </View>

        {activeRole === 'praktikan' ? (
          <Pressable
            accessibilityRole="button"
            style={styles.riwayatButton}
            onPress={() => router.push('/praktikan/riwayat' as Href)}
          >
            <Text style={styles.riwayatButtonText}>Riwayat</Text>
          </Pressable>
        ) : activeRole === 'asisten' ? (
          <Pressable
            accessibilityRole="button"
            style={styles.asistenIzinButton}
            onPress={() => router.push('/asisten/izin' as Href)}
          >
            <Text style={styles.asistenIzinButtonText}>Pengajuan Izin</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            style={styles.aslabBannerButton}
            onPress={() => router.push('/aslab' as Href)}
          >
            <Text style={styles.aslabBannerButtonText}>Kelola Lab</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.quickActions}>
        {activeRole === 'aslab' ? (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.aslabCard, pressed && styles.mapButtonPressed]}
            onPress={() => router.push('/aslab' as Href)}
          >
            <View style={styles.aslabCardIcon}>
              <Text style={styles.mapButtonIconText}>A</Text>
            </View>
            <View style={styles.mapButtonCopy}>
              <Text style={styles.aslabCardTitle}>Dashboard Aslab</Text>
              <Text style={styles.aslabCardSubtitle}>
                Pantau keberlangsungan lab, distribusi peserta, dan keuangan denda
              </Text>
            </View>
            <Text style={styles.aslabCardAction}>Buka</Text>
          </Pressable>
        ) : null}

        {activeRole === 'praktikan' ? (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.finesButton,
              unpaidSummary.count > 0 && styles.finesButtonAlert,
              pressed && styles.mapButtonPressed,
            ]}
            onPress={() => router.push('/praktikan/denda' as Href)}
          >
            <View
              style={[
                styles.finesIcon,
                unpaidSummary.count > 0 ? styles.finesIconAlert : styles.finesIconNeutral,
              ]}
            >
              <Text style={styles.mapButtonIconText}>Rp</Text>
            </View>
            <View style={styles.mapButtonCopy}>
              <View style={styles.finesTitleRow}>
                <Text
                  style={[
                    styles.finesTitle,
                    unpaidSummary.count > 0 && styles.finesTitleAlert,
                  ]}
                >
                  Tagihan & Pembayaran Denda
                </Text>
                {unpaidSummary.count > 0 ? (
                  <View style={styles.unpaidBadge}>
                    <Text style={styles.unpaidBadgeText}>{unpaidSummary.count} belum dibayar</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.finesSubtitle,
                  unpaidSummary.count > 0 && styles.finesSubtitleAlert,
                ]}
              >
                {unpaidSummary.count > 0
                  ? `Total tunggakan ${formatRupiah(unpaidSummary.total)} · Ketuk untuk bayar`
                  : 'Tidak ada tunggakan · Lihat riwayat pembayaran'}
              </Text>
            </View>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed]}
          onPress={() => router.push('/peta' as Href)}
        >
          <View style={styles.mapButtonIcon}>
            <Text style={styles.mapButtonIconText}>P</Text>
          </View>
          <View style={styles.mapButtonCopy}>
            <Text style={styles.mapButtonTitle}>Peta Laboratorium</Text>
            <Text style={styles.mapButtonSubtitle}>Lihat lokasi, radius, dan aktivitas lab</Text>
          </View>
          <Text style={styles.mapButtonAction}>Lihat</Text>
        </Pressable>
      </View>

      <NotificationStatusBanner {...pushRegistration} />

      <View style={styles.filterSection}>
        <Text style={styles.filterSectionLabel}>FILTER STATUS SESI</Text>
        <View style={styles.filterChipsRow}>
          {renderFilterChip('SEMUA', 'Semua', styles.filterChipActiveSemua, styles.filterChipTextActive)}
          {renderFilterChip('DIBUKA', 'Dibuka', styles.filterChipActiveDibuka, styles.filterChipTextActiveDibuka)}
          {renderFilterChip('BELUM_DIBUKA', 'Belum Dibuka', styles.filterChipActiveBelum, styles.filterChipTextActiveBelum)}
          {renderFilterChip('DITUTUP', 'Ditutup', styles.filterChipActiveDitutup, styles.filterChipTextActiveDitutup)}
        </View>
      </View>

      {renderList()}

      <ConfirmSheet
        visible={confirmLogout}
        title="Keluar dari akun?"
        message="Anda perlu masuk kembali untuk melihat jadwal dan melakukan presensi."
        confirmLabel="Ya, Keluar"
        tone="asisten"
        loading={loggingOut}
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  backButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.label,
  },
  headerTitleGroup: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  switchButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5B21B6',
  },
  aslabTopButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aslabTopButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#115E59',
  },
  userBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  userBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  userRoleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  userRoleBadgePraktikan: {
    backgroundColor: '#DBEAFE',
  },
  userRoleBadgeAsisten: {
    backgroundColor: '#EDE9FE',
  },
  userRoleBadgeAslab: {
    backgroundColor: '#CCFBF1',
  },
  userRoleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  userRoleBadgeTextPraktikan: {
    color: '#1E40AF',
  },
  userRoleBadgeTextAsisten: {
    color: '#5B21B6',
  },
  userRoleBadgeTextAslab: {
    color: '#115E59',
  },
  userInfoTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  userNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  userNimText: {
    fontSize: 12,
    color: '#475569',
  },
  riwayatButton: {
    minHeight: 44,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riwayatButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E40AF',
  },
  asistenIzinButton: {
    minHeight: 44,
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  asistenIzinButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5B21B6',
  },
  aslabBannerButton: {
    minHeight: 44,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#99F6E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aslabBannerButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#115E59',
  },
  quickActions: {
    marginHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  aslabCard: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  aslabCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
  },
  aslabCardTitle: { color: '#115E59', fontSize: 13, fontWeight: '800' },
  aslabCardSubtitle: { color: '#115E59', fontSize: 11, lineHeight: 16 },
  aslabCardAction: { color: '#0F766E', fontSize: 12, fontWeight: '800' },
  finesButton: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  finesButtonAlert: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  finesIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finesIconNeutral: {
    backgroundColor: '#1D4ED8',
  },
  finesIconAlert: {
    backgroundColor: '#C2410C',
  },
  finesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  finesTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  finesTitleAlert: {
    color: '#9A3412',
  },
  unpaidBadge: {
    backgroundColor: '#DC2626',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  unpaidBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  finesSubtitle: {
    color: '#475569',
    fontSize: 11,
    lineHeight: 16,
  },
  finesSubtitleAlert: {
    color: '#9A3412',
    fontWeight: '600',
  },
  mapButton: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mapButtonPressed: { opacity: 0.88 },
  mapButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.praktikan,
  },
  mapButtonIconText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  mapButtonCopy: { flex: 1, minWidth: 0, gap: 2 },
  mapButtonTitle: { color: '#1E40AF', fontSize: 13, fontWeight: '800' },
  mapButtonSubtitle: { color: '#1E40AF', fontSize: 11 },
  mapButtonAction: { color: '#1E40AF', fontSize: 12, fontWeight: '800' },
  filterSection: {
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  filterSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    justifyContent: 'center',
  },
  filterChipActiveSemua: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterChipActiveDibuka: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  filterChipActiveBelum: {
    backgroundColor: '#475569',
    borderColor: '#475569',
  },
  filterChipActiveDitutup: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterChipTextActiveDibuka: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterChipTextActiveBelum: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterChipTextActiveDitutup: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  kelasBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kelasBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.label,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeDibuka: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  dotDibuka: {
    backgroundColor: '#16A34A',
  },
  textDibuka: {
    color: '#166534',
  },
  badgeBelumDibuka: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  dotBelumDibuka: {
    backgroundColor: '#475569',
  },
  textBelumDibuka: {
    color: '#334155',
  },
  badgeDitutup: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  dotDitutup: {
    backgroundColor: '#DC2626',
  },
  textDitutup: {
    color: '#991B1B',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 22,
  },
  detailsList: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    width: 52,
  },
  detailText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  catatanBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 4,
  },
  catatanLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 2,
  },
  catatanText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    alignItems: 'flex-end',
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: '800',
  },
  cardActionTextPraktikan: {
    color: colors.praktikan,
  },
  cardActionTextAsisten: {
    color: colors.asisten,
  },
  cardActionTextAslab: {
    color: '#0F766E',
  },
  topBarSpacer: {
    width: 64,
  },
});
