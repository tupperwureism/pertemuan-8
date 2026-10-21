import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DUMMY_USERS, UserProfile, UserRole } from '@/data/dummyData';

export default function LoginRoleScreen() {
  // Initial default: Praktikan (Budi Santoso)
  const defaultUser = DUMMY_USERS.find((u) => u.role === 'praktikan') || DUMMY_USERS[0];

  const [role, setRole] = useState<UserRole>(defaultUser.role);
  const [selectedUserId, setSelectedUserId] = useState<string>(defaultUser.id);
  const [nama, setNama] = useState<string>(defaultUser.nama);
  const [nomorInduk, setNomorInduk] = useState<string>(defaultUser.nomorInduk);

  // State for Modal / Bottom Sheet
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Handle switching role via tab/button
  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
    setErrorMessage('');
    // Auto-select first matching user from dummy data
    const matched = DUMMY_USERS.find((u) => u.role === newRole);
    if (matched) {
      setSelectedUserId(matched.id);
      setNama(matched.nama);
      setNomorInduk(matched.nomorInduk);
    }
  };

  // Handle selecting a predefined user
  const handleSelectUser = (user: UserProfile) => {
    setRole(user.role);
    setSelectedUserId(user.id);
    setNama(user.nama);
    setNomorInduk(user.nomorInduk);
    setErrorMessage('');
  };

  // Quick switch from Modal / Bottom Sheet
  const handleQuickSwitch = (user: UserProfile) => {
    handleSelectUser(user);
    setIsModalVisible(false);
  };

  // Handle proceed / navigation
  const handleProceed = () => {
    if (!nama.trim()) {
      setErrorMessage('Nama lengkap tidak boleh kosong');
      return;
    }
    if (!nomorInduk.trim()) {
      setErrorMessage(
        role === 'praktikan' ? 'NIM tidak boleh kosong' : 'Kode Asisten tidak boleh kosong'
      );
      return;
    }

    setErrorMessage('');

    // Navigate to Jadwal Praktikum (SRS-02)
    router.push({
      pathname: '/jadwal' as any,
      params: {
        role,
        userId: selectedUserId || `usr-${Date.now()}`,
        nama: nama.trim(),
        nomorInduk: nomorInduk.trim(),
      },
    });
  };

  // Filter dummy users by current role for the quick picker
  const roleDummyUsers = DUMMY_USERS.filter((u) => u.role === role);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.header}>
            <View style={styles.badgeTop}>
              <Text style={styles.badgeTopText}>SRS-01 • Programmer 1</Text>
            </View>
            <Text style={styles.appTitle}>Presensi Praktikum</Text>
            <Text style={styles.appSubtitle}>
              Pilih peran dan identitas pengguna untuk memulai sesi praktikum
            </Text>
          </View>

          {/* Role Selection Tabs */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>1. PILIH PERAN PENGGUNA</Text>
            <View style={styles.roleTabContainer}>
              <Pressable
                style={[styles.roleTab, role === 'praktikan' && styles.roleTabActivePraktikan]}
                onPress={() => handleRoleChange('praktikan')}
              >
                <Text
                  style={[
                    styles.roleTabText,
                    role === 'praktikan' && styles.roleTabTextActive,
                  ]}
                >
                  🎓 Praktikan
                </Text>
                <Text
                  style={[
                    styles.roleTabSubtext,
                    role === 'praktikan' && styles.roleTabSubtextActive,
                  ]}
                >
                  Mahasiswa Peserta
                </Text>
              </Pressable>

              <Pressable
                style={[styles.roleTab, role === 'asisten' && styles.roleTabActiveAsisten]}
                onPress={() => handleRoleChange('asisten')}
              >
                <Text
                  style={[
                    styles.roleTabText,
                    role === 'asisten' && styles.roleTabTextActive,
                  ]}
                >
                  👨‍🏫 Asisten
                </Text>
                <Text
                  style={[
                    styles.roleTabSubtext,
                    role === 'asisten' && styles.roleTabSubtextActive,
                  ]}
                >
                  Laboran / Asisten Lab
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Quick Switch Button (Modal Trigger) */}
          <View style={styles.quickModalBanner}>
            <View style={styles.quickModalInfo}>
              <Text style={styles.quickModalTitle}>Ganti Cepat Profil & Peran</Text>
              <Text style={styles.quickModalDesc}>
                Buka modal untuk beralih instan antar akun dummy
              </Text>
            </View>
            <Pressable
              style={styles.quickModalButton}
              onPress={() => setIsModalVisible(true)}
            >
              <Text style={styles.quickModalButtonText}>⚡ Buka Modal</Text>
            </Pressable>
          </View>

          {/* Identity Form */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>2. PILIH AKUN ATAU INPUT MANUAL</Text>

            {/* Quick Chips of Dummy Users for Current Role */}
            <Text style={styles.fieldLabel}>Pilihan Cepat Pengguna ({role.toUpperCase()}):</Text>
            <View style={styles.dummyChipsRow}>
              {roleDummyUsers.map((user) => {
                const isSelected = selectedUserId === user.id;
                return (
                  <Pressable
                    key={user.id}
                    style={[
                      styles.dummyChip,
                      isSelected &&
                        (role === 'asisten'
                          ? styles.dummyChipSelectedAsisten
                          : styles.dummyChipSelectedPraktikan),
                    ]}
                    onPress={() => handleSelectUser(user)}
                  >
                    <Text
                      style={[
                        styles.dummyChipName,
                        isSelected && styles.dummyChipTextSelected,
                      ]}
                    >
                      {user.nama}
                    </Text>
                    <Text
                      style={[
                        styles.dummyChipSub,
                        isSelected && styles.dummyChipTextSelected,
                      ]}
                    >
                      {user.nomorInduk}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Form Inputs */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Nama Lengkap</Text>
              <TextInput
                style={styles.textInput}
                value={nama}
                onChangeText={(text) => {
                  setNama(text);
                  setSelectedUserId('');
                  setErrorMessage('');
                }}
                placeholder="Masukkan nama lengkap"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>
                {role === 'praktikan' ? 'Nomor Induk Mahasiswa (NIM)' : 'Kode Asisten'}
              </Text>
              <TextInput
                style={styles.textInput}
                value={nomorInduk}
                onChangeText={(text) => {
                  setNomorInduk(text);
                  setSelectedUserId('');
                  setErrorMessage('');
                }}
                placeholder={role === 'praktikan' ? 'Contoh: 2301001' : 'Contoh: AST-01'}
                placeholderTextColor="#94A3B8"
                autoCapitalize={role === 'asisten' ? 'characters' : 'none'}
              />
            </View>

            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
              </View>
            ) : null}
          </View>

          {/* Active Profile Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Profil Aktif Terpilih:</Text>
            <View style={styles.summaryRow}>
              <View
                style={[
                  styles.roleBadge,
                  role === 'asisten' ? styles.roleBadgeAsisten : styles.roleBadgePraktikan,
                ]}
              >
                <Text
                  style={[
                    styles.roleBadgeText,
                    role === 'asisten'
                      ? styles.roleBadgeTextAsisten
                      : styles.roleBadgeTextPraktikan,
                  ]}
                >
                  {role.toUpperCase()}
                </Text>
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryNama}>{nama || '(Nama belum diisi)'}</Text>
                <Text style={styles.summaryNomor}>
                  {role === 'praktikan' ? 'NIM' : 'Kode'}: {nomorInduk || '-'}
                </Text>
              </View>
            </View>
          </View>

          {/* Proceed Button */}
          <Pressable
            style={({ pressed }) => [
              styles.proceedButton,
              pressed && styles.proceedButtonPressed,
              role === 'asisten' ? styles.proceedButtonAsisten : styles.proceedButtonPraktikan,
            ]}
            onPress={handleProceed}
          >
            <Text style={styles.proceedButtonText}>
              Masuk ke Jadwal Praktikum →
            </Text>
          </Pressable>
        </ScrollView>

        {/* Modal / Bottom Sheet for Quick Role & Identity Change */}
        <Modal
          visible={isModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalBackdropDismiss}
              onPress={() => setIsModalVisible(false)}
            />
            <View style={styles.bottomSheetContainer}>
              {/* Drag Handle Indicator */}
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>Ganti Peran & Identitas</Text>
                  <Text style={styles.sheetSubtitle}>
                    Pilih akun pengguna dummy untuk demo aplikasi
                  </Text>
                </View>
                <Pressable
                  style={styles.sheetCloseButton}
                  onPress={() => setIsModalVisible(false)}
                >
                  <Text style={styles.sheetCloseButtonText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.sheetContent}>
                {DUMMY_USERS.map((user) => {
                  const isCurrent =
                    user.role === role &&
                    (user.id === selectedUserId || user.nomorInduk === nomorInduk);
                  const isAsisten = user.role === 'asisten';

                  return (
                    <Pressable
                      key={user.id}
                      style={[
                        styles.sheetUserCard,
                        isCurrent && styles.sheetUserCardSelected,
                      ]}
                      onPress={() => handleQuickSwitch(user)}
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
                              ? styles.roleBadgeAsisten
                              : styles.roleBadgePraktikan,
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleBadgeSmallText,
                              isAsisten
                                ? styles.roleBadgeTextAsisten
                                : styles.roleBadgeTextPraktikan,
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
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 4,
  },
  badgeTop: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 8,
  },
  badgeTopText: {
    color: '#4338CA',
    fontSize: 12,
    fontWeight: '700',
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  roleTabContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  roleTab: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 4,
  },
  roleTabActivePraktikan: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  roleTabActiveAsisten: {
    backgroundColor: '#F5F3FF',
    borderColor: '#7C3AED',
  },
  roleTabText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  roleTabTextActive: {
    color: '#0F172A',
  },
  roleTabSubtext: {
    fontSize: 11,
    color: '#64748B',
  },
  roleTabSubtextActive: {
    color: '#334155',
    fontWeight: '600',
  },
  quickModalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  quickModalInfo: {
    flex: 1,
  },
  quickModalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  quickModalDesc: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  quickModalButton: {
    backgroundColor: '#D97706',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  quickModalButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  dummyChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dummyChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dummyChipSelectedPraktikan: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  dummyChipSelectedAsisten: {
    backgroundColor: '#F5F3FF',
    borderColor: '#7C3AED',
  },
  dummyChipName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  dummyChipSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  dummyChipTextSelected: {
    color: '#0F172A',
  },
  inputGroup: {
    gap: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  roleBadgePraktikan: {
    backgroundColor: '#DBEAFE',
  },
  roleBadgeAsisten: {
    backgroundColor: '#EDE9FE',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  roleBadgeTextPraktikan: {
    color: '#1D4ED8',
  },
  roleBadgeTextAsisten: {
    color: '#6D28D9',
  },
  summaryInfo: {
    flex: 1,
  },
  summaryNama: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryNomor: {
    fontSize: 12,
    color: '#64748B',
  },
  proceedButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  proceedButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  proceedButtonPraktikan: {
    backgroundColor: '#2563EB',
  },
  proceedButtonAsisten: {
    backgroundColor: '#7C3AED',
  },
  proceedButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  // Modal / Bottom Sheet Styles
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
    maxHeight: 320,
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
    marginBottom: 10,
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
