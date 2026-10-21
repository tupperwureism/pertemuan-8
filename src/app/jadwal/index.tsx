import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DUMMY_SESSIONS,
  DUMMY_USERS,
  PraktikumSession,
  SessionStatus,
  UserProfile,
  UserRole,
} from '@/data/dummyData';

type FilterType = 'SEMUA' | SessionStatus;

export default function JadwalPraktikumScreen() {
  const params = useLocalSearchParams<{
    role?: string;
    userId?: string;
    nama?: string;
    nomorInduk?: string;
  }>();

  // Active user state initialized from route params or fallback to first dummy user
  const initialRole: UserRole =
    params.role === 'asisten' || params.role === 'praktikan'
      ? params.role
      : 'praktikan';

  const [activeRole, setActiveRole] = useState<UserRole>(initialRole);
  const [activeUserId, setActiveUserId] = useState<string>(
    params.userId || (initialRole === 'asisten' ? 'ast-01' : 'prk-1')
  );
  const [activeNama, setActiveNama] = useState<string>(
    params.nama || (initialRole === 'asisten' ? 'Raka Pratama' : 'Budi Santoso')
  );
  const [activeNomorInduk, setActiveNomorInduk] = useState<string>(
    params.nomorInduk || (initialRole === 'asisten' ? 'AST-01' : '2301001')
  );

  // State Filter for sessions (SRS-02)
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('SEMUA');

  // Quick switch modal state
  const [isSwitchModalVisible, setIsSwitchModalVisible] = useState<boolean>(false);

  // Quick switch user profile handler
  const handleSwitchProfile = (user: UserProfile) => {
    setActiveRole(user.role);
    setActiveUserId(user.id);
    setActiveNama(user.nama);
    setActiveNomorInduk(user.nomorInduk);
    setIsSwitchModalVisible(false);
  };

  // Filter sessions based on state filter
  const filteredSessions = DUMMY_SESSIONS.filter((session) => {
    if (selectedFilter === 'SEMUA') return true;
    return session.status === selectedFilter;
  });

  // Calculate counts for filters
  const counts = {
    SEMUA: DUMMY_SESSIONS.length,
    DIBUKA: DUMMY_SESSIONS.filter((s) => s.status === 'DIBUKA').length,
    BELUM_DIBUKA: DUMMY_SESSIONS.filter((s) => s.status === 'BELUM_DIBUKA').length,
    DITUTUP: DUMMY_SESSIONS.filter((s) => s.status === 'DITUTUP').length,
  };

  // Navigate to session detail based on active role
  const handleSessionPress = (session: PraktikumSession) => {
    if (activeRole === 'asisten') {
      // Programmer 2 domain: /asisten/[id]
      router.push({
        pathname: `/asisten/${session.id}` as any,
        params: {
          id: session.id,
          role: activeRole,
          userId: activeUserId,
          nama: activeNama,
          nomorInduk: activeNomorInduk,
        },
      });
    } else {
      // Programmer 3 domain: /praktikan/[id]
      router.push({
        pathname: `/praktikan/${session.id}` as any,
        params: {
          id: session.id,
          role: activeRole,
          userId: activeUserId,
          nama: activeNama,
          nomorInduk: activeNomorInduk,
        },
      });
    }
  };

  // Helper for status badge styling (SRS-02: Belum Dibuka abu-abu, Dibuka hijau, Ditutup merah)
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
            <Text style={[styles.statusBadgeText, styles.textBelumDibuka]}>
              Belum Dibuka
            </Text>
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

  // Render individual session card with Flexbox
  const renderSessionItem = ({ item }: { item: PraktikumSession }) => {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          pressed && styles.cardPressed,
        ]}
        onPress={() => handleSessionPress(item)}
      >
        {/* Top Header of Card */}
        <View style={styles.cardHeader}>
          <View style={styles.kelasBadge}>
            <Text style={styles.kelasBadgeText}>Kelas {item.kelas}</Text>
          </View>
          {renderStatusBadge(item.status)}
        </View>

        {/* Title */}
        <Text style={styles.sessionTitle}>{item.namaPraktikum}</Text>

        {/* Details in Flexbox */}
        <View style={styles.detailsList}>
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>🕒</Text>
            <Text style={styles.detailText}>{item.waktu}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>📍</Text>
            <Text style={styles.detailText}>{item.ruangan}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>👥</Text>
            <Text style={styles.detailText}>
              {item.daftarHadir.length} Praktikan telah presensi
            </Text>
          </View>
          {item.catatanAsisten ? (
            <View style={styles.catatanBox}>
              <Text style={styles.catatanLabel}>📢 Pesan Asisten:</Text>
              <Text style={styles.catatanText}>{item.catatanAsisten}</Text>
            </View>
          ) : null}
        </View>

        {/* Card Footer / Action Prompt */}
        <View style={styles.cardFooter}>
          <Text
            style={[
              styles.cardActionText,
              activeRole === 'asisten'
                ? styles.cardActionTextAsisten
                : styles.cardActionTextPraktikan,
            ]}
          >
            {activeRole === 'asisten'
              ? 'Kelola Sesi (Asisten) →'
              : 'Presensi Sesi (Praktikan) →'}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => router.push('/')}>
          <Text style={styles.backButtonText}>← Ganti Akun</Text>
        </Pressable>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>Jadwal Praktikum</Text>
          <Text style={styles.headerSubtitle}>SRS-02 • Programmer 1</Text>
        </View>
        <Pressable
          style={styles.switchButton}
          onPress={() => setIsSwitchModalVisible(true)}
        >
          <Text style={styles.switchButtonText}>⚡ Modal</Text>
        </Pressable>
      </View>

      {/* User Information Banner */}
      <View style={styles.userBanner}>
        <View style={styles.userBannerLeft}>
          <View
            style={[
              styles.userRoleBadge,
              activeRole === 'asisten'
                ? styles.userRoleBadgeAsisten
                : styles.userRoleBadgePraktikan,
            ]}
          >
            <Text
              style={[
                styles.userRoleBadgeText,
                activeRole === 'asisten'
                  ? styles.userRoleBadgeTextAsisten
                  : styles.userRoleBadgeTextPraktikan,
              ]}
            >
              {activeRole.toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfoTextContainer}>
            <Text style={styles.userNameText}>{activeNama}</Text>
            <Text style={styles.userNimText}>
              {activeRole === 'praktikan' ? 'NIM' : 'Kode'}: {activeNomorInduk}
            </Text>
          </View>
        </View>

        {activeRole === 'praktikan' ? (
          <Pressable
            style={styles.riwayatButton}
            onPress={() =>
              router.push({
                pathname: '/praktikan/riwayat' as any,
                params: {
                  userId: activeUserId,
                  nama: activeNama,
                  nomorInduk: activeNomorInduk,
                },
              })
            }
          >
            <Text style={styles.riwayatButtonText}>Riwayat 📜</Text>
          </Pressable>
        ) : null}
      </View>

      {/* State Filter Chips (SRS-02) */}
      <View style={styles.filterSection}>
        <Text style={styles.filterSectionLabel}>FILTER STATUS SESI:</Text>
        <View style={styles.filterChipsRow}>
          <Pressable
            style={[
              styles.filterChip,
              selectedFilter === 'SEMUA' && styles.filterChipActiveSemua,
            ]}
            onPress={() => setSelectedFilter('SEMUA')}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === 'SEMUA' && styles.filterChipTextActive,
              ]}
            >
              Semua ({counts.SEMUA})
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.filterChip,
              selectedFilter === 'DIBUKA' && styles.filterChipActiveDibuka,
            ]}
            onPress={() => setSelectedFilter('DIBUKA')}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === 'DIBUKA' && styles.filterChipTextActiveDibuka,
              ]}
            >
              Dibuka ({counts.DIBUKA})
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.filterChip,
              selectedFilter === 'BELUM_DIBUKA' && styles.filterChipActiveBelum,
            ]}
            onPress={() => setSelectedFilter('BELUM_DIBUKA')}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === 'BELUM_DIBUKA' && styles.filterChipTextActiveBelum,
              ]}
            >
              Belum Dibuka ({counts.BELUM_DIBUKA})
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.filterChip,
              selectedFilter === 'DITUTUP' && styles.filterChipActiveDitutup,
            ]}
            onPress={() => setSelectedFilter('DITUTUP')}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === 'DITUTUP' && styles.filterChipTextActiveDitutup,
              ]}
            >
              Ditutup ({counts.DITUTUP})
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Sessions FlatList */}
      <FlatList
        data={filteredSessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSessionItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>Tidak ada praktikum ditemukan</Text>
            <Text style={styles.emptySubtitle}>
              Tidak ada sesi dengan filter &quot;{selectedFilter}&quot;.
            </Text>
          </View>
        }
      />

      {/* Quick Switch Modal / Bottom Sheet */}
      <Modal
        visible={isSwitchModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsSwitchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdropDismiss}
            onPress={() => setIsSwitchModalVisible(false)}
          />
          <View style={styles.bottomSheetContainer}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Ganti Akun & Peran</Text>
                <Text style={styles.sheetSubtitle}>
                  Beralih instan untuk menguji tampilan Asisten & Praktikan
                </Text>
              </View>
              <Pressable
                style={styles.sheetCloseButton}
                onPress={() => setIsSwitchModalVisible(false)}
              >
                <Text style={styles.sheetCloseButtonText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.sheetContent}>
              {DUMMY_USERS.map((user) => {
                const isCurrent =
                  user.role === activeRole &&
                  (user.id === activeUserId || user.nomorInduk === activeNomorInduk);
                const isAsisten = user.role === 'asisten';

                return (
                  <Pressable
                    key={user.id}
                    style={[
                      styles.sheetUserCard,
                      isCurrent && styles.sheetUserCardSelected,
                    ]}
                    onPress={() => handleSwitchProfile(user)}
                  >
                    <View style={styles.sheetUserCardLeft}>
                      <View
                        style={[
                          styles.sheetAvatar,
                          isAsisten ? styles.sheetAvatarAsisten : styles.sheetAvatarPraktikan,
                        ]}
                      >
                        <Text style={styles.sheetAvatarText}>
                          {isAsisten ? '👨‍🏫' : '🎓'}
                        </Text>
                      </View>
                      <View style={styles.sheetUserDetails}>
                        <Text style={styles.sheetUserName}>{user.nama}</Text>
                        <Text style={styles.sheetUserId}>
                          {isAsisten ? 'Kode Asisten' : 'NIM'}: {user.nomorInduk}
                        </Text>
                        {user.id === 'prk-2' ? (
                          <Text style={styles.sheetUserNote}>
                            (Belum presensi • Uji Empty State)
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.sheetUserCardRight}>
                      <View
                        style={[
                          styles.roleBadgeSmall,
                          isAsisten
                            ? styles.userRoleBadgeAsisten
                            : styles.userRoleBadgePraktikan,
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleBadgeSmallText,
                            isAsisten
                              ? styles.userRoleBadgeTextAsisten
                              : styles.userRoleBadgeTextPraktikan,
                          ]}
                        >
                          {user.role}
                        </Text>
                      </View>
                      {isCurrent ? (
                        <Text style={styles.sheetActiveCheck}>✓ Aktif</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
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
  // Modal / Bottom Sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalBackdropDismiss: {
    flex: 1,
  },
  bottomSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    maxHeight: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#CBD5E1',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sheetCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseButtonText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '700',
  },
  sheetContent: {
    gap: 10,
  },
  sheetUserCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
  },
  sheetUserCardSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  sheetUserCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  sheetAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetAvatarPraktikan: {
    backgroundColor: '#DBEAFE',
  },
  sheetAvatarAsisten: {
    backgroundColor: '#EDE9FE',
  },
  sheetAvatarText: {
    fontSize: 20,
  },
  sheetUserDetails: {
    flex: 1,
  },
  sheetUserName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  sheetUserId: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  sheetUserNote: {
    fontSize: 10,
    color: '#D97706',
    fontWeight: '600',
    marginTop: 2,
  },
  sheetUserCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  roleBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeSmallText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  sheetActiveCheck: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
});

