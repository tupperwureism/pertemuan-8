import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, PrimaryButton } from '@/components/screen-kit';
import { distanceMeters, isWithinRadius, MAX_ACCURACY_METER } from '@/lib/geo';
import type { DeviceLocationStatus } from '@/hooks/use-device-location';
import type { DeviceFix, LocationError } from '@/services/locationService';
import type { LabDoc } from '@/types/firebase';

export type LocationCheckState =
  | 'no_lab'
  | 'loading_lab'
  | 'lab_error'
  | 'lab_missing'
  | 'checking'
  | 'permission_denied'
  | 'permission_blocked'
  | 'services_disabled'
  | 'unavailable'
  | 'accuracy_unknown'
  | 'low_accuracy'
  | 'inside_radius'
  | 'outside_radius';

export interface LocationCheckEvaluation {
  state: LocationCheckState;
  canAttendByLocation: boolean;
  distanceMeter: number | null;
  accuracyMeter: number | null;
  disabledReason: string | null;
}

export interface EvaluateLocationCheckParams {
  sessionLabId?: string | null;
  lab: LabDoc | null;
  labsLoading: boolean;
  labsError: Error | null;
  locationStatus: DeviceLocationStatus;
  fix: DeviceFix | null;
  locationError: LocationError | null;
}

/**
 * Mengevaluasi kelayakan lokasi praktikan terhadap titik & radius lab sesi secara konsisten
 * untuk tampilan kartu `LocationCheckCard` dan status aktif tombol "Presensi sekarang".
 */
export function evaluateLocationCheck({
  sessionLabId,
  lab,
  labsLoading,
  labsError,
  locationStatus,
  fix,
  locationError,
}: EvaluateLocationCheckParams): LocationCheckEvaluation {
  const hasLab = typeof sessionLabId === 'string' && sessionLabId.trim().length > 0;
  if (!hasLab) {
    return {
      state: 'no_lab',
      canAttendByLocation: true,
      distanceMeter: null,
      accuracyMeter: null,
      disabledReason: null,
    };
  }

  if (labsLoading && !lab) {
    return {
      state: 'loading_lab',
      canAttendByLocation: false,
      distanceMeter: null,
      accuracyMeter: null,
      disabledReason: 'Sedang memuat data lokasi laboratorium.',
    };
  }

  if (labsError && !lab) {
    return {
      state: 'lab_error',
      canAttendByLocation: false,
      distanceMeter: null,
      accuracyMeter: null,
      disabledReason: 'Data laboratorium gagal dimuat. Coba muat ulang terlebih dahulu.',
    };
  }

  if (!lab) {
    return {
      state: 'lab_missing',
      canAttendByLocation: false,
      distanceMeter: null,
      accuracyMeter: null,
      disabledReason: 'Data laboratorium untuk sesi ini tidak ditemukan. Hubungi asisten.',
    };
  }

  if (locationStatus === 'idle' || locationStatus === 'requesting') {
    return {
      state: 'checking',
      canAttendByLocation: false,
      distanceMeter: null,
      accuracyMeter: null,
      disabledReason: 'Sedang memeriksa lokasi perangkat Anda.',
    };
  }

  if (locationStatus === 'error' || !fix) {
    const reason = locationError?.reason;
    if (reason === 'PERMISSION_DENIED') {
      return {
        state: 'permission_denied',
        canAttendByLocation: false,
        distanceMeter: null,
        accuracyMeter: null,
        disabledReason: 'Izin lokasi ditolak. Izinkan akses lokasi untuk melanjutkan presensi.',
      };
    }
    if (reason === 'PERMISSION_BLOCKED') {
      return {
        state: 'permission_blocked',
        canAttendByLocation: false,
        distanceMeter: null,
        accuracyMeter: null,
        disabledReason: 'Izin lokasi ditolak permanen. Aktifkan izin lokasi melalui pengaturan aplikasi.',
      };
    }
    if (reason === 'SERVICES_DISABLED') {
      return {
        state: 'services_disabled',
        canAttendByLocation: false,
        distanceMeter: null,
        accuracyMeter: null,
        disabledReason: 'GPS perangkat sedang mati. Aktifkan layanan lokasi lalu coba lagi.',
      };
    }
    return {
      state: 'unavailable',
      canAttendByLocation: false,
      distanceMeter: null,
      accuracyMeter: null,
      disabledReason: 'Lokasi perangkat belum tersedia. Coba perbarui lokasi.',
    };
  }

  const rawAccuracy = fix.accuracy;
  if (rawAccuracy === null || !Number.isFinite(rawAccuracy) || rawAccuracy < 0) {
    return {
      state: 'accuracy_unknown',
      canAttendByLocation: false,
      distanceMeter: null,
      accuracyMeter: null,
      disabledReason: 'Akurasi GPS tidak diketahui. Coba perbarui lokasi.',
    };
  }

  const roundedAccuracy = Math.round(rawAccuracy);
  if (rawAccuracy > MAX_ACCURACY_METER) {
    return {
      state: 'low_accuracy',
      canAttendByLocation: false,
      distanceMeter: null,
      accuracyMeter: roundedAccuracy,
      disabledReason: `Akurasi GPS terlalu rendah (±${roundedAccuracy} m, maksimal ${MAX_ACCURACY_METER} m).`,
    };
  }

  const rawDistance = distanceMeters(
    { latitude: fix.latitude, longitude: fix.longitude },
    { latitude: lab.latitude, longitude: lab.longitude },
  );
  const roundedDistance = Math.round(rawDistance);

  if (isWithinRadius(rawDistance, lab.radiusMeter)) {
    return {
      state: 'inside_radius',
      canAttendByLocation: true,
      distanceMeter: roundedDistance,
      accuracyMeter: roundedAccuracy,
      disabledReason: null,
    };
  }

  return {
    state: 'outside_radius',
    canAttendByLocation: false,
    distanceMeter: roundedDistance,
    accuracyMeter: roundedAccuracy,
    disabledReason: `Anda berada di luar radius laboratorium (${roundedDistance} m dari lab, radius ${lab.radiusMeter} m).`,
  };
}

export interface LocationCheckCardProps {
  evaluation: LocationCheckEvaluation;
  lab: LabDoc | null;
  locationError: LocationError | null;
  labsErrorMessage?: string | null;
  onRefreshLocation: () => void;
  onOpenSettings: () => void;
  onRetryLabs?: () => void;
}

export function LocationCheckCard({
  evaluation,
  lab,
  locationError,
  labsErrorMessage,
  onRefreshLocation,
  onOpenSettings,
  onRetryLabs,
}: LocationCheckCardProps) {
  const { state, distanceMeter, accuracyMeter } = evaluation;

  if (state === 'no_lab') {
    return (
      <View style={[styles.card, styles.neutralCard]}>
        <View style={styles.headerRow}>
          <View style={[styles.badge, styles.neutralBadge]}>
            <Text style={[styles.badgeText, styles.neutralBadgeText]}>Tanpa validasi lokasi</Text>
          </View>
        </View>
        <Text style={styles.title}>Sesi tidak terikat titik laboratorium</Text>
        <Text style={styles.body}>
          Sesi ini tidak mensyaratkan pengecekan radius lokasi. Anda dapat langsung melakukan presensi saat sesi dibuka oleh asisten.
        </Text>
      </View>
    );
  }

  if (state === 'loading_lab') {
    return (
      <View style={[styles.card, styles.infoCard]}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.praktikan} />
          <Text style={styles.title}>Memuat data laboratorium…</Text>
        </View>
        <Text style={styles.body}>
          Mengambil koordinat dan radius laboratorium untuk verifikasi presensi.
        </Text>
      </View>
    );
  }

  if (state === 'lab_error') {
    return (
      <View style={[styles.card, styles.dangerCard]}>
        <View style={[styles.badge, styles.dangerBadge]}>
          <Text style={[styles.badgeText, styles.dangerBadgeText]}>Data lab gagal dimuat</Text>
        </View>
        <Text style={styles.title}>Tidak dapat membaca titik laboratorium</Text>
        <Text style={styles.body}>
          {labsErrorMessage || 'Periksa koneksi internet Anda lalu coba muat ulang.'}
        </Text>
        {onRetryLabs ? (
          <View style={styles.actions}>
            <PrimaryButton label="Coba lagi" tone="neutral" onPress={onRetryLabs} />
          </View>
        ) : null}
      </View>
    );
  }

  if (state === 'lab_missing') {
    return (
      <View style={[styles.card, styles.dangerCard]}>
        <View style={[styles.badge, styles.dangerBadge]}>
          <Text style={[styles.badgeText, styles.dangerBadgeText]}>Laboratorium tidak ditemukan</Text>
        </View>
        <Text style={styles.title}>Titik laboratorium tidak tersedia</Text>
        <Text style={styles.body}>
          Laboratorium yang tertaut pada sesi ini tidak ditemukan atau telah dihapus. Hubungi asisten untuk memilih ulang laboratorium.
        </Text>
      </View>
    );
  }

  if (state === 'checking') {
    return (
      <View style={[styles.card, styles.infoCard]}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.praktikan} />
          <Text style={styles.title}>Memeriksa lokasi Anda…</Text>
        </View>
        <Text style={styles.body}>
          Menentukan posisi GPS perangkat terhadap {lab?.nama ?? 'laboratorium'} (radius {lab?.radiusMeter ?? '-'} m).
        </Text>
      </View>
    );
  }

  if (state === 'permission_denied') {
    return (
      <View style={[styles.card, styles.warningCard]}>
        <View style={[styles.badge, styles.warningBadge]}>
          <Text style={[styles.badgeText, styles.warningBadgeText]}>Izin lokasi ditolak</Text>
        </View>
        <Text style={styles.title}>Akses lokasi dibutuhkan</Text>
        <Text style={styles.body}>
          {locationError?.message ??
            'Izin lokasi ditolak. Izinkan akses lokasi agar aplikasi dapat memverifikasi posisi Anda.'}
        </Text>
        <View style={styles.actionsRow}>
          <View style={styles.flex1}>
            <PrimaryButton label="Minta izin lagi" tone="praktikan" onPress={onRefreshLocation} />
          </View>
          <View style={styles.flex1}>
            <PrimaryButton label="Buka pengaturan" tone="neutral" onPress={onOpenSettings} />
          </View>
        </View>
      </View>
    );
  }

  if (state === 'permission_blocked') {
    return (
      <View style={[styles.card, styles.dangerCard]}>
        <View style={[styles.badge, styles.dangerBadge]}>
          <Text style={[styles.badgeText, styles.dangerBadgeText]}>Izin diblokir</Text>
        </View>
        <Text style={styles.title}>Izin lokasi ditolak permanen</Text>
        <Text style={styles.body}>
          {locationError?.message ??
            'Buka pengaturan aplikasi untuk mengaktifkan akses lokasi, lalu kembali dan tekan Coba lagi.'}
        </Text>
        <View style={styles.actionsRow}>
          <View style={styles.flex1}>
            <PrimaryButton label="Buka pengaturan" tone="praktikan" onPress={onOpenSettings} />
          </View>
          <View style={styles.flex1}>
            <PrimaryButton label="Coba lagi" tone="neutral" onPress={onRefreshLocation} />
          </View>
        </View>
      </View>
    );
  }

  if (state === 'services_disabled') {
    return (
      <View style={[styles.card, styles.warningCard]}>
        <View style={[styles.badge, styles.warningBadge]}>
          <Text style={[styles.badgeText, styles.warningBadgeText]}>GPS mati</Text>
        </View>
        <Text style={styles.title}>Layanan lokasi perangkat nonaktif</Text>
        <Text style={styles.body}>
          {locationError?.message ??
            'Layanan lokasi (GPS) perangkat sedang mati. Aktifkan GPS lalu coba lagi.'}
        </Text>
        <Text style={styles.hint}>
          Petunjuk: tarik panel notifikasi atau buka Pengaturan perangkat → aktifkan Lokasi/GPS → kembali ke halaman ini dan tekan Coba lagi.
        </Text>
        <View style={styles.actions}>
          <PrimaryButton label="Coba lagi" tone="praktikan" onPress={onRefreshLocation} />
        </View>
      </View>
    );
  }

  if (state === 'unavailable') {
    return (
      <View style={[styles.card, styles.warningCard]}>
        <View style={[styles.badge, styles.warningBadge]}>
          <Text style={[styles.badgeText, styles.warningBadgeText]}>Lokasi belum tersedia</Text>
        </View>
        <Text style={styles.title}>Posisi GPS belum ditemukan</Text>
        <Text style={styles.body}>
          {locationError?.message ??
            'Lokasi perangkat belum tersedia. Pastikan sinyal GPS aktif lalu coba lagi.'}
        </Text>
        <View style={styles.actions}>
          <PrimaryButton label="Coba lagi" tone="praktikan" onPress={onRefreshLocation} />
        </View>
      </View>
    );
  }

  if (state === 'accuracy_unknown') {
    return (
      <View style={[styles.card, styles.warningCard]}>
        <View style={[styles.badge, styles.warningBadge]}>
          <Text style={[styles.badgeText, styles.warningBadgeText]}>Akurasi tidak diketahui</Text>
        </View>
        <Text style={styles.title}>Akurasi GPS belum terbaca</Text>
        <Text style={styles.body}>
          Akurasi GPS tidak diketahui, coba lagi di area dengan penerimaan sinyal GPS lebih baik.
        </Text>
        <View style={styles.actions}>
          <PrimaryButton label="Coba lagi" tone="praktikan" onPress={onRefreshLocation} />
        </View>
      </View>
    );
  }

  if (state === 'low_accuracy') {
    return (
      <View style={[styles.card, styles.warningCard]}>
        <View style={[styles.badge, styles.warningBadge]}>
          <Text style={[styles.badgeText, styles.warningBadgeText]}>Akurasi GPS rendah</Text>
        </View>
        <Text style={styles.title}>Akurasi lokasi belum memenuhi syarat</Text>
        <Text style={styles.body}>
          Akurasi GPS saat ini ±{accuracyMeter ?? '-'} m (maksimal yang diterima {MAX_ACCURACY_METER} m). Pindah ke dekat jendela atau area terbuka lalu coba lagi.
        </Text>
        <View style={styles.actions}>
          <PrimaryButton label="Coba lagi" tone="praktikan" onPress={onRefreshLocation} />
        </View>
      </View>
    );
  }

  if (state === 'inside_radius') {
    return (
      <View style={[styles.card, styles.successCard]}>
        <View style={styles.headerRow}>
          <View style={[styles.badge, styles.successBadge]}>
            <Text style={[styles.badgeText, styles.successBadgeText]}>Di dalam radius</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onRefreshLocation}
            style={({ pressed }) => [styles.refreshChip, pressed && styles.pressed]}
          >
            <Text style={styles.refreshChipText}>Perbarui</Text>
          </Pressable>
        </View>
        <Text style={styles.successTitle}>
          Di dalam radius (jarak {distanceMeter ?? 0} m)
        </Text>
        <Text style={styles.successBody}>
          Posisi Anda berada di area {lab?.nama ?? 'laboratorium'} (radius {lab?.radiusMeter ?? '-'} m · akurasi GPS ±{accuracyMeter ?? '-'} m).
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.dangerCard]}>
      <View style={[styles.badge, styles.dangerBadge]}>
        <Text style={[styles.badgeText, styles.dangerBadgeText]}>Di luar radius</Text>
      </View>
      <Text style={styles.dangerTitle}>
        Di luar radius (jarak {distanceMeter ?? 0} m, radius {lab?.radiusMeter ?? '-'} m)
      </Text>
      <Text style={styles.body}>
        Posisi Anda masih terlalu jauh dari {lab?.nama ?? 'laboratorium'} (akurasi GPS ±{accuracyMeter ?? '-'} m). Mendekatlah ke area laboratorium lalu perbarui lokasi.
      </Text>
      <View style={styles.actions}>
        <PrimaryButton label="Coba lagi" tone="praktikan" onPress={onRefreshLocation} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  neutralCard: {
    backgroundColor: '#F8FAFC',
    borderColor: colors.border,
  },
  infoCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  successCard: {
    backgroundColor: '#ECFDF3',
    borderColor: '#ABEFC6',
  },
  warningCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  dangerCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  neutralBadge: { backgroundColor: '#E2E8F0' },
  neutralBadgeText: { color: '#334155' },
  successBadge: { backgroundColor: '#D1FADF' },
  successBadgeText: { color: '#065F46' },
  warningBadge: { backgroundColor: '#FEF3C7' },
  warningBadgeText: { color: '#92400E' },
  dangerBadge: { backgroundColor: '#FEE2E2' },
  dangerBadgeText: { color: '#991B1B' },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  successTitle: {
    color: '#065F46',
    fontSize: 16,
    fontWeight: '800',
  },
  dangerTitle: {
    color: '#991B1B',
    fontSize: 16,
    fontWeight: '800',
  },
  body: {
    color: colors.label,
    fontSize: 13,
    lineHeight: 20,
  },
  successBody: {
    color: '#166534',
    fontSize: 13,
    lineHeight: 20,
  },
  hint: {
    color: '#92400E',
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  flex1: {
    flex: 1,
  },
  refreshChip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#ABEFC6',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  refreshChipText: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});
