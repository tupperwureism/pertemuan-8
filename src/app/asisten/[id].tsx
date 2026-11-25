import { router, useLocalSearchParams, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
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

import { ErrorBanner, ErrorState, LoadingState } from '@/components/screen-kit';
import {
  useLabs,
  useSession,
  useSessionRecap,
  useUserProfiles,
  useVisibleClasses,
} from '@/hooks/use-firestore-data';
import { useSubscription } from '@/hooks/use-subscription';
import { formatClock, formatSessionTime } from '@/lib/format';
import { getErrorMessage } from '@/services/authService';
import { formatRupiah } from '@/services/paymentService';
import { subscribeAllPermissions } from '@/services/permissionService';
import { closeSession, openSession } from '@/services/sessionService';
import type { AttendanceDoc, SessionStatus } from '@/types/firebase';

export default function AsistenSessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Array.isArray(id) ? id[0] : id;

  const { data: session, loading, error, retry } = useSession(sessionId);
  const { data: classes } = useVisibleClasses('asisten');
  const { data: labs } = useLabs();
  const { data: attendances, error: recapError } = useSessionRecap(sessionId);
  const {
    data: allPermissions,
    loading: permissionsLoading,
    error: permissionsError,
    retry: retryPermissions,
  } = useSubscription(subscribeAllPermissions);

  const recap: AttendanceDoc[] = useMemo(() => attendances ?? [], [attendances]);
  const approvedPermissions = useMemo(
    () =>
      (allPermissions ?? []).filter(
        (perm) => perm.sessionId === sessionId && perm.status === 'APPROVED',
      ),
    [allPermissions, sessionId],
  );

  const profileUids = useMemo(
    () => [
      ...recap.map((a) => a.praktikanUid),
      ...approvedPermissions.map((p) => p.praktikanUid),
    ],
    [recap, approvedPermissions],
  );
  const profiles = useUserProfiles(profileUids);

  const [catatanDraft, setCatatanDraft] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string>('');

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/jadwal' as Href));

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoadingState label="Memuat sesi..." />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState message={getErrorMessage(error)} onRetry={retry} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notFoundContainer}>
          <Text style={styles.notFoundTitle}>Sesi Tidak Ditemukan</Text>
          <Text style={styles.notFoundSubtitle}>
            Sesi praktikum dengan ID &quot;{sessionId ?? '-'}&quot; tidak tersedia atau sudah dihapus.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={goBack}
            style={({ pressed }) => [styles.backButtonPrimary, pressed && styles.buttonPressed]}
          >
            <Text style={styles.backButtonPrimaryText}>Kembali ke Jadwal</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const className = classes?.find((c) => c.id === session.classId)?.kodeKelas ?? '...';
  const lab = session.labId ? (labs?.find((l) => l.id === session.labId) ?? null) : null;
  const gracePeriodMinutes = lab?.gracePeriodMinutes ?? 15;
  const fineAmount = lab?.fineAmount ?? 10_000;
  const catatanInput = catatanDraft ?? session.catatan;

  const isBelumDibuka = session.status === 'BELUM_DIBUKA';
  const isDibuka = session.status === 'DIBUKA';
  const isDitutup = session.status === 'DITUTUP';

  const onTimeCount = recap.filter((item) => item.timeliness !== 'TERLAMBAT').length;
  const lateCount = recap.filter((item) => item.timeliness === 'TERLAMBAT').length;

  const targetStatus: SessionStatus | null = isBelumDibuka
    ? 'DIBUKA'
    : isDibuka
      ? 'DITUTUP'
      : null;

  const handleOpenModal = () => {
    if (isDitutup) return;
    setIsModalVisible(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!targetStatus || saving) return;
    setSaving(true);
    setActionError('');
    try {
      if (targetStatus === 'DIBUKA') {
        await openSession(session.id, catatanInput);
      } else {
        await closeSession(session.id, catatanInput);
      }
      setCatatanDraft(null);
      setIsModalVisible(false);
    } catch (e) {
      setIsModalVisible(false);
      setActionError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
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
              onPress={goBack}
              style={({ pressed }) => [
                styles.topBackButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.topBackButtonText}>Kembali</Text>
            </Pressable>
            <Text style={styles.topBarTitle}>Detail Sesi Asprak</Text>
            <View style={styles.topBarRightSpacer} />
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.kelasPill}>
                <Text style={styles.kelasPillText}>Kelas {className}</Text>
              </View>
              <View style={[styles.statusBadge, currentBadge.container]}>
                <Text style={[styles.statusBadgeText, currentBadge.text]}>
                  {currentBadge.label}
                </Text>
              </View>
            </View>

            <Text style={styles.namaPraktikumText}>{session.judul}</Text>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Waktu:</Text>
              <Text style={styles.metaValue}>{formatSessionTime(session.startsAt, session.endsAt)}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Ruangan:</Text>
              <Text style={styles.metaValue}>{session.ruangan}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Toleransi:</Text>
              <Text style={styles.metaValue}>
                {gracePeriodMinutes} menit setelah mulai · Denda {formatRupiah(fineAmount)}
              </Text>
            </View>

            <View style={styles.currentNoteBox}>
              <Text style={styles.currentNoteLabel}>Catatan Asprak:</Text>
              <Text style={styles.currentNoteValue}>
                {session.catatan.trim().length > 0
                  ? session.catatan
                  : 'Belum ada catatan Asprak'}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Kontrol Sesi Praktikum</Text>
            <Text style={styles.inputHelpText}>
              Isi catatan atau instruksi praktikum sebelum membuka atau menutup sesi.
            </Text>

            <Text style={styles.inputLabel}>Catatan / Instruksi Praktikum</Text>
            <TextInput
              accessibilityLabel="Catatan / Instruksi Praktikum"
              editable={!isDitutup}
              maxLength={500}
              multiline
              numberOfLines={3}
              onBlur={() => setIsInputFocused(false)}
              onChangeText={setCatatanDraft}
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

            {actionError ? <ErrorBanner message={actionError} /> : null}

            <View style={styles.actionSectionContainer}>
              {isBelumDibuka ? (
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
              ) : null}

              {isDibuka ? (
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
              ) : null}

              {isDitutup ? (
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
              ) : null}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.rekapHeaderRow}>
              <Text style={styles.sectionTitle}>Rekap Kehadiran Praktikan</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {recap.length} Praktikan
                </Text>
              </View>
            </View>

            {recap.length > 0 ? (
              <View style={styles.summaryPillRow}>
                <View style={styles.onTimePill}>
                  <Text style={styles.onTimePillText}>{onTimeCount} Tepat Waktu</Text>
                </View>
                <View style={styles.latePill}>
                  <Text style={styles.latePillText}>{lateCount} Terlambat</Text>
                </View>
              </View>
            ) : null}

            {recapError ? (
              <ErrorBanner message={getErrorMessage(recapError)} />
            ) : recap.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateText}>
                  Belum ada praktikan yang melakukan presensi pada sesi ini
                </Text>
              </View>
            ) : (
              <View style={styles.attendanceListContainer}>
                {recap.map((item) => {
                  const isLate = item.timeliness === 'TERLAMBAT';
                  const lateMins = item.lateMinutes ?? 0;
                  const timelinessLabel = isLate
                    ? lateMins > 0
                      ? `Terlambat (+${lateMins} mnt)`
                      : 'Terlambat'
                    : 'Tepat Waktu';

                  return (
                    <View key={item.id} style={styles.attendanceItemCard}>
                      <View style={styles.attendanceItemLeft}>
                        <Text style={styles.praktikanNameText}>
                          {profiles[item.praktikanUid]?.nama ?? 'Memuat nama...'}
                        </Text>
                        <Text style={styles.praktikanNimText}>
                          NIM: {profiles[item.praktikanUid]?.nomorInduk || '-'}
                        </Text>
                        {item.catatan && item.catatan.trim().length > 0 ? (
                          <Text style={styles.praktikanCatatanText}>
                            Catatan: &quot;{item.catatan}&quot;
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.attendanceBadgesCol}>
                        <View style={styles.waktuHadirBadge}>
                          <Text style={styles.waktuHadirBadgeText}>
                            {formatClock(item.attendedAt)}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.timelinessBadge,
                            isLate ? styles.timelinessLate : styles.timelinessOnTime,
                          ]}
                        >
                          <Text
                            style={[
                              styles.timelinessText,
                              isLate ? styles.timelinessTextLate : styles.timelinessTextOnTime,
                            ]}
                          >
                            {timelinessLabel}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.rekapHeaderRow}>
              <Text style={styles.sectionTitle}>Izin Disetujui</Text>
              <View style={styles.excusedCountBadge}>
                <Text style={styles.excusedCountText}>
                  {approvedPermissions.length} Praktikan
                </Text>
              </View>
            </View>
            <Text style={styles.excusedSubtext}>
              Excused absence: tercatat terpisah dari kehadiran dan bebas dari tagihan denda.
            </Text>

            {permissionsError ? (
              <View style={styles.permissionErrorBox}>
                <ErrorBanner message={getErrorMessage(permissionsError)} />
                <Pressable accessibilityRole="button" onPress={retryPermissions} style={styles.retryLink}>
                  <Text style={styles.retryLinkText}>Muat ulang daftar izin</Text>
                </Pressable>
              </View>
            ) : permissionsLoading ? (
              <Text style={styles.emptyStateText}>Memuat data izin...</Text>
            ) : approvedPermissions.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateText}>
                  Belum ada praktikan dengan izin disetujui pada sesi ini.
                </Text>
              </View>
            ) : (
              <View style={styles.attendanceListContainer}>
                {approvedPermissions.map((perm) => (
                  <View key={perm.id} style={styles.excusedItemCard}>
                    <View style={styles.excusedTopRow}>
                      <View style={styles.attendanceItemLeft}>
                        <Text style={styles.praktikanNameText}>
                          {profiles[perm.praktikanUid]?.nama ?? 'Memuat nama...'}
                        </Text>
                        <Text style={styles.praktikanNimText}>
                          NIM: {profiles[perm.praktikanUid]?.nomorInduk || '-'}
                        </Text>
                      </View>
                      <View style={styles.excusedBadge}>
                        <Text style={styles.excusedBadgeText}>Bebas Denda</Text>
                      </View>
                    </View>
                    <Text style={styles.praktikanCatatanText}>
                      Alasan: &quot;{perm.alasan}&quot;
                    </Text>
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
                  : 'Belum ada catatan Asprak'}
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
                disabled={saving}
                onPress={handleConfirmStatusChange}
                style={({ pressed }) => [
                  styles.modalConfirmButton,
                  isDibuka ? styles.buttonDangerBg : styles.buttonSuccessBg,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.modalConfirmButtonText}>
                  {saving ? 'Memproses...' : isBelumDibuka ? 'Ya, Buka Sesi' : 'Ya, Tutup Sesi'}
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
  summaryPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  onTimePill: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  onTimePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  latePill: {
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FDBA74',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  latePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  emptyStateContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 20,
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
    minWidth: 0,
    gap: 2,
  },
  attendanceBadgesCol: {
    alignItems: 'flex-end',
    gap: 6,
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
  },
  waktuHadirBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  timelinessBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  timelinessOnTime: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  timelinessLate: {
    backgroundColor: '#FFEDD5',
    borderColor: '#FDBA74',
  },
  timelinessText: {
    fontSize: 11,
    fontWeight: '800',
  },
  timelinessTextOnTime: {
    color: '#166534',
  },
  timelinessTextLate: {
    color: '#9A3412',
  },
  excusedCountBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  excusedCountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
  },
  excusedSubtext: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  excusedItemCard: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 6,
  },
  excusedTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  excusedBadge: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  excusedBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },
  permissionErrorBox: {
    gap: 8,
    alignItems: 'flex-start',
  },
  retryLink: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  retryLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5B21B6',
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
