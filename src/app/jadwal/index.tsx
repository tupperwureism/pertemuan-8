import { router, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmSheet, EmptyState, ErrorState, LoadingState } from '@/components/screen-kit';
import { useAuth } from '@/context/AuthContext';
import { useSessions, useVisibleClasses } from '@/hooks/use-firestore-data';
import { formatSessionTime } from '@/lib/format';
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
  const { profile, role, signOut } = useAuth();
  const activeRole = role ?? 'praktikan';

  const { data: sessions, loading, error, retry } = useSessions();
  const { data: classes } = useVisibleClasses(role);

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

  const counts = {
    SEMUA: allSessions.length,
    DIBUKA: allSessions.filter((s) => s.status === 'DIBUKA').length,
    BELUM_DIBUKA: allSessions.filter((s) => s.status === 'BELUM_DIBUKA').length,
    DITUTUP: allSessions.filter((s) => s.status === 'DITUTUP').length,
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      // Setelah signOut, Stack.Protected memindahkan pengguna ke /login.
      setLoggingOut(false);
      setConfirmLogout(false);
    }
  };

  // Navigasi per role. Tidak ada identitas yang dikirim lewat param; layar tujuan memakai UID auth.
  const handleSessionPress = (session: SessionDoc) => {
    router.push((activeRole === 'asisten' ? `/asisten/${session.id}` : `/praktikan/${session.id}`) as Href);
  };

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
          <Text style={styles.kelasBadgeText}>Kelas {classLabel[item.classId] ?? '…'}</Text>
        </View>
        {renderStatusBadge(item.status)}
      </View>

      <Text style={styles.sessionTitle}>{item.judul}</Text>

      <View style={styles.detailsList}>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>🕒</Text>
          <Text style={styles.detailText}>{formatSessionTime(item.startsAt, item.endsAt)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📍</Text>
          <Text style={styles.detailText}>{item.ruangan}</Text>
        </View>
        {item.catatan ? (
          <View style={styles.catatanBox}>
            <Text style={styles.catatanLabel}>📢 Pesan Asisten:</Text>
            <Text style={styles.catatanText}>{item.catatan}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <Text
          style={[
            styles.cardActionText,
            activeRole === 'asisten' ? styles.cardActionTextAsisten : styles.cardActionTextPraktikan,
          ]}
        >
          {activeRole === 'asisten' ? 'Kelola Sesi (Asisten) →' : 'Presensi Sesi (Praktikan) →'}
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
    if (loading) return <LoadingState label="Memuat jadwal…" />;
    if (error) return <ErrorState message={error.message} onRetry={retry} />;
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
              icon="🗓️"
              title="Belum ada jadwal praktikum"
              subtitle={
                activeRole === 'asisten'
                  ? 'Buat kelas dan sesi pertama lewat menu Kelola.'
                  : 'Anda belum terdaftar pada kelas mana pun, atau belum ada sesi. Hubungi asisten.'
              }
            />
          ) : (
            <EmptyState
              icon="🔍"
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
            <Text style={styles.switchButtonText}>⚙ Kelola</Text>
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
              activeRole === 'asisten' ? styles.userRoleBadgeAsisten : styles.userRoleBadgePraktikan,
            ]}
          >
            <Text
              style={[
                styles.userRoleBadgeText,
                activeRole === 'asisten' ? styles.userRoleBadgeTextAsisten : styles.userRoleBadgeTextPraktikan,
              ]}
            >
              {activeRole.toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfoTextContainer}>
            <Text style={styles.userNameText}>{profile?.nama ?? '-'}</Text>
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
            <Text style={styles.riwayatButtonText}>Riwayat 📜</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterSectionLabel}>FILTER STATUS SESI:</Text>
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
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  headerTitleGroup: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  switchButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  switchButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  userBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  userBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  userRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  userRoleBadgePraktikan: {
    backgroundColor: '#DBEAFE',
  },
  userRoleBadgeAsisten: {
    backgroundColor: '#EDE9FE',
  },
  userRoleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  userRoleBadgeTextPraktikan: {
    color: '#1D4ED8',
  },
  userRoleBadgeTextAsisten: {
    color: '#6D28D9',
  },
  userInfoTextContainer: {
    flex: 1,
  },
  userNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  userNimText: {
    fontSize: 12,
    color: '#64748B',
  },
  riwayatButton: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  riwayatButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
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
    gap: 6,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  filterChipActiveSemua: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterChipActiveDibuka: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  filterChipActiveBelum: {
    backgroundColor: '#64748B',
    borderColor: '#64748B',
  },
  filterChipActiveDitutup: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
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
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kelasBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kelasBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  // Status Badges (SRS-02: Belum Dibuka abu-abu, Dibuka hijau, Ditutup merah)
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
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
    color: '#15803D',
  },
  badgeBelumDibuka: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  dotBelumDibuka: {
    backgroundColor: '#64748B',
  },
  textBelumDibuka: {
    color: '#475569',
  },
  badgeDitutup: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  dotDitutup: {
    backgroundColor: '#DC2626',
  },
  textDitutup: {
    color: '#B91C1C',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 22,
  },
  detailsList: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailIcon: {
    fontSize: 14,
  },
  detailText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  catatanBox: {
    backgroundColor: '#FEF9C3',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE047',
    marginTop: 4,
  },
  catatanLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#854D0E',
    marginBottom: 2,
  },
  catatanText: {
    fontSize: 12,
    color: '#713F12',
    lineHeight: 16,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    alignItems: 'flex-end',
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardActionTextPraktikan: {
    color: '#2563EB',
  },
  cardActionTextAsisten: {
    color: '#7C3AED',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  topBarSpacer: {
    width: 64,
  },
});
