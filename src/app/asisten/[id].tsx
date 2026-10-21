import React, { useEffect, useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';

import {
  DUMMY_SESSIONS,
  type AttendanceRecord,
  type PraktikumSession,
  type SessionStatus,
} from '@/data/dummyData';

export default function AsistenSessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Array.isArray(id) ? id[0] : id;

  const [session, setSession] = useState<PraktikumSession | undefined>(() =>
    DUMMY_SESSIONS.find((item) => item.id === sessionId)
  );
  const [catatanInput, setCatatanInput] = useState<string>(
    session?.catatanAsisten ?? ''
  );
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);

  useEffect(() => {
    const foundSession = DUMMY_SESSIONS.find((item) => item.id === sessionId);
    setSession(foundSession);
    if (foundSession) {
      setCatatanInput(foundSession.catatanAsisten ?? '');
    }
  }, [sessionId]);

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notFoundContainer}>
          <Text style={styles.notFoundTitle}>Sesi Tidak Ditemukan</Text>
          <Text style={styles.notFoundSubtitle}>
            Data sesi praktikum dengan ID "{sessionId ?? '-'}" tidak tersedia di daftar jadwal.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButtonPrimary,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.backButtonPrimaryText}>Kembali ke Jadwal</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isBelumDibuka = session.status === 'BELUM_DIBUKA';
  const isDibuka = session.status === 'DIBUKA';
  const isDitutup = session.status === 'DITUTUP';

  const targetStatus: SessionStatus | null = isBelumDibuka
    ? 'DIBUKA'
    : isDibuka
    ? 'DITUTUP'
    : null;

  const handleOpenModal = () => {
    if (isDitutup) return;
    setIsModalVisible(true);
  };

  // SRS-03 requires confirmation through the modal before mutating session status.
  const handleConfirmStatusChange = () => {
    if (!targetStatus) return;

    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: targetStatus,
        catatanAsisten: catatanInput.trim(),
      };
    });

    setIsModalVisible(false);
  };

  const getStatusBadgeConfig = (status: SessionStatus) => {
    switch (status) {
      case 'DIBUKA':
        return {
          container: styles.badgeDibuka,
          text: styles.badgeDibukaText,
          label: 'Dibuka',
        };
      case 'DITUTUP':
        return {
          container: styles.badgeDitutup,
          text: styles.badgeDitutupText,
          label: 'Ditutup',
        };
      case 'BELUM_DIBUKA':
      default:
        return {
          container: styles.badgeBelumDibuka,
          text: styles.badgeBelumDibukaText,
          label: 'Belum Dibuka',
        };
    }
  };

  const currentBadge = getStatusBadgeConfig(session.status);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flexOne}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.topBackButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.topBackButtonText}>Kembali</Text>
            </Pressable>
            <Text style={styles.topBarTitle}>Detail Sesi Asisten</Text>
            <View style={styles.topBarRightSpacer} />
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.kelasPill}>
                <Text style={styles.kelasPillText}>Kelas {session.kelas}</Text>
              </View>
              <View style={[styles.statusBadge, currentBadge.container]}>
                <Text style={[styles.statusBadgeText, currentBadge.text]}>
                  {currentBadge.label}
                </Text>
              </View>
            </View>

            <Text style={styles.namaPraktikumText}>{session.namaPraktikum}</Text>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Waktu:</Text>
              <Text style={styles.metaValue}>{session.waktu}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Ruangan:</Text>
              <Text style={styles.metaValue}>{session.ruangan}</Text>
            </View>

            <View style={styles.currentNoteBox}>
              <Text style={styles.currentNoteLabel}>Catatan Asisten:</Text>
              <Text style={styles.currentNoteValue}>
                {session.catatanAsisten && session.catatanAsisten.trim().length > 0
                  ? session.catatanAsisten
                  : 'Belum ada catatan asisten'}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Form & Kontrol Sesi Praktikum</Text>
            <Text style={styles.inputHelpText}>
              Isi catatan atau instruksi praktikum sebelum membuka atau menutup sesi.
            </Text>

            <Text style={styles.inputLabel}>Catatan / Instruksi Praktikum</Text>
            <TextInput
              accessibilityLabel="Catatan / Instruksi Praktikum"
              editable={!isDitutup}
              multiline
              numberOfLines={3}
              onBlur={() => setIsInputFocused(false)}
              onChangeText={setCatatanInput}
              onFocus={() => setIsInputFocused(true)}
              placeholder="Contoh: Silakan presensi maksimal 15 menit pertama."
              placeholderTextColor="#475569"
              style={[
                styles.textInput,
                isInputFocused && styles.textInputFocused,
                isDitutup && styles.textInputDisabled,
              ]}
              value={catatanInput}
            />

            <View style={styles.actionSectionContainer}>
              {isBelumDibuka && (
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenModal}
                  style={({ pressed }) => [
                    styles.buttonBukaSesi,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.buttonActionText}>Buka Sesi</Text>
                </Pressable>
              )}

              {isDibuka && (
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenModal}
                  style={({ pressed }) => [
                    styles.buttonTutupSesi,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.buttonActionText}>Tutup Sesi</Text>
                </Pressable>
              )}

              {isDitutup && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: true }}
                  disabled
                  style={styles.buttonDisabledSesi}
                >
                  <Text style={styles.buttonDisabledText}>
                    Sesi Praktikum Telah Ditutup
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.rekapHeaderRow}>
              <Text style={styles.sectionTitle}>Rekap Kehadiran Praktikan</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {session.daftarHadir.length} Praktikan
                </Text>
              </View>
            </View>

            {/* SRS-04 requires an explicit Empty State when daftarHadir is empty. */}
            {session.daftarHadir.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateText}>
                  Belum ada praktikan yang melakukan presensi pada sesi ini
                </Text>
              </View>
            ) : (
              <View style={styles.attendanceListContainer}>
                {session.daftarHadir.map((item: AttendanceRecord) => (
                  <View key={item.id} style={styles.attendanceItemCard}>
                    <View style={styles.attendanceItemLeft}>
                      <Text style={styles.praktikanNameText}>
                        {item.namaPraktikan}
                      </Text>
                      <Text style={styles.praktikanNimText}>NIM: {item.nim}</Text>
                      {item.catatan && item.catatan.trim().length > 0 ? (
                        <Text style={styles.praktikanCatatanText}>
                          Catatan: "{item.catatan}"
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.waktuHadirBadge}>
                      <Text style={styles.waktuHadirBadgeText}>
                        {item.waktuHadir}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
        transparent
        visible={isModalVisible}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityLabel="Tutup dialog konfirmasi"
            accessibilityRole="button"
            onPress={() => setIsModalVisible(false)}
            style={styles.modalBackdropDismissArea}
          />
          <View style={styles.bottomSheetContainer}>
            <View style={styles.sheetDragIndicator} />

            <Text style={styles.modalTitle}>
              {isBelumDibuka ? 'Konfirmasi Buka Sesi' : 'Konfirmasi Tutup Sesi'}
            </Text>

            <Text style={styles.modalMessage}>
              {isBelumDibuka
                ? 'Apakah Anda yakin ingin membuka sesi ini?'
                : 'Apakah Anda yakin ingin menutup sesi ini?'}
            </Text>

            <View style={styles.modalNotePreviewBox}>
              <Text style={styles.modalNotePreviewLabel}>
                Catatan / Instruksi Praktikum:
              </Text>
              <Text style={styles.modalNotePreviewContent}>
                {catatanInput.trim().length > 0
                  ? catatanInput.trim()
                  : 'Belum ada catatan asisten'}
              </Text>
            </View>

            <View style={styles.modalActionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsModalVisible(false)}
                style={({ pressed }) => [
                  styles.modalCancelButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.modalCancelButtonText}>Batal</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={handleConfirmStatusChange}
                style={({ pressed }) => [
                  styles.modalConfirmButton,
                  isDibuka ? styles.buttonDangerBg : styles.buttonSuccessBg,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.modalConfirmButtonText}>
                  {isBelumDibuka ? 'Ya, Buka Sesi' : 'Ya, Tutup Sesi'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  topBackButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#64748B',
  },
  topBackButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
    textAlign: 'center',
  },
  topBarRightSpacer: {
    width: 60,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  kelasPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#64748B',
  },
  kelasPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  badgeBelumDibuka: {
    backgroundColor: '#E4E4E7',
    borderColor: '#52525B',
  },
  badgeBelumDibukaText: {
    color: '#27272A',
  },
  badgeDibuka: {
    backgroundColor: '#DCFCE7',
    borderColor: '#166534',
  },
  badgeDibukaText: {
    color: '#166534',
  },
  badgeDitutup: {
    backgroundColor: '#FEE2E2',
    borderColor: '#991B1B',
  },
  badgeDitutupText: {
    color: '#991B1B',
  },
  namaPraktikumText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 24,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  metaLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    width: 76,
  },
  metaValue: {
    fontSize: 14,
    color: '#0F172A',
    flex: 1,
    flexShrink: 1,
  },
  currentNoteBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 4,
    marginTop: 4,
  },
  currentNoteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  currentNoteValue: {
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
    flexShrink: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  inputHelpText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#64748B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  textInputFocused: {
    borderColor: '#0F172A',
    borderWidth: 2,
  },
  textInputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#475569',
    borderColor: '#64748B',
  },
  actionSectionContainer: {
    marginTop: 4,
  },
  buttonBukaSesi: {
    minHeight: 44,
    backgroundColor: '#15803D',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonTutupSesi: {
    minHeight: 44,
    backgroundColor: '#B91C1C',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  buttonDisabledSesi: {
    minHeight: 44,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#991B1B',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabledText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  rekapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  countBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#64748B',
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyStateContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
  attendanceListContainer: {
    gap: 8,
  },
  attendanceItemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 12,
  },
  attendanceItemLeft: {
    flex: 1,
    gap: 2,
  },
  praktikanNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  praktikanNimText: {
    fontSize: 13,
    color: '#334155',
  },
  praktikanCatatanText: {
    fontSize: 12,
    color: '#1E293B',
    fontStyle: 'italic',
    marginTop: 2,
    flexShrink: 1,
  },
  waktuHadirBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#64748B',
    alignSelf: 'flex-start',
  },
  waktuHadirBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBackdropDismissArea: {
    flex: 1,
  },
  bottomSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 14,
  },
  sheetDragIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#64748B',
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalMessage: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
  },
  modalNotePreviewBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 4,
  },
  modalNotePreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  modalNotePreviewContent: {
    fontSize: 13,
    color: '#0F172A',
    fontStyle: 'italic',
    flexShrink: 1,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalCancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#64748B',
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalConfirmButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonSuccessBg: {
    backgroundColor: '#15803D',
  },
  buttonDangerBg: {
    backgroundColor: '#B91C1C',
  },
  modalConfirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  notFoundContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  notFoundTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  notFoundSubtitle: {
    fontSize: 14,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 20,
  },
  backButtonPrimary: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 20,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
