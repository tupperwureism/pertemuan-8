import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabInfoSheet } from '@/components/map/lab-info-sheet';
import { LabMap } from '@/components/map/lab-map';
import { ErrorState, LoadingState, ScreenHeader } from '@/components/screen-kit';
import { useDeviceLocation } from '@/hooks/use-device-location';
import { useLabs } from '@/hooks/use-firestore-data';
import { distanceMeters } from '@/lib/geo';
import { getErrorMessage } from '@/services/authService';
import type { LabDoc } from '@/types/firebase';

export default function PetaLabScreen() {
  const labsState = useLabs();
  const location = useDeviceLocation({ watch: true });
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);

  const labs = useMemo(() => labsState.data ?? [], [labsState.data]);
  const selectedLab = useMemo(
    () => labs.find((lab) => lab.id === selectedLabId) ?? null,
    [labs, selectedLabId],
  );

  const selectedDistance = useMemo(() => {
    if (!selectedLab || !location.fix) return null;
    return distanceMeters(
      { latitude: location.fix.latitude, longitude: location.fix.longitude },
      { latitude: selectedLab.latitude, longitude: selectedLab.longitude },
    );
  }, [location.fix, selectedLab]);

  const handleSelectLab = (lab: LabDoc | null) => setSelectedLabId(lab?.id ?? null);

  if (labsState.loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Peta Laboratorium" onBack={() => router.back()} />
        <LoadingState label="Memuat lokasi laboratorium..." />
      </SafeAreaView>
    );
  }

  if (labsState.error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Peta Laboratorium" onBack={() => router.back()} />
        <ErrorState message={getErrorMessage(labsState.error)} onRetry={labsState.retry} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="Peta Laboratorium" onBack={() => router.back()} />
      <View style={styles.mapContainer}>
        <LabMap
          labs={labs}
          userFix={location.fix}
          selectedLabId={selectedLabId}
          onSelectLab={handleSelectLab}
        />

        {labs.length === 0 ? (
          <View
            style={[
              styles.emptyBanner,
              location.status !== 'ready' ? styles.emptyBannerBelowLocation : null,
            ]}
          >
            <Text style={styles.emptyTitle}>Belum ada laboratorium</Text>
            <Text style={styles.emptyText}>Asisten dapat menambahkannya melalui menu Kelola Laboratorium.</Text>
          </View>
        ) : null}

        {location.status === 'requesting' ? (
          <View style={styles.locationBanner}>
            <Text style={styles.locationTitle}>Mencari posisi Anda...</Text>
            <Text style={styles.locationText}>Peta laboratorium tetap dapat digunakan.</Text>
          </View>
        ) : null}

        {location.status === 'error' && location.error ? (
          <View accessibilityRole="alert" style={[styles.locationBanner, styles.locationError]}>
            <Text style={styles.locationErrorTitle}>Posisi Anda tidak tersedia</Text>
            <Text style={styles.locationErrorText}>{location.error.message}</Text>
            <View style={styles.locationActions}>
              <Pressable accessibilityRole="button" onPress={location.refresh} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Coba lagi</Text>
              </Pressable>
              {location.error.reason === 'PERMISSION_BLOCKED' ? (
                <Pressable accessibilityRole="button" onPress={location.openSettings} style={styles.settingsButton}>
                  <Text style={styles.settingsButtonText}>Buka pengaturan</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {selectedLab ? (
          <LabInfoSheet
            lab={selectedLab}
            distanceMeter={selectedDistance}
            onClose={() => setSelectedLabId(null)}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  mapContainer: { flex: 1, overflow: 'hidden' },
  emptyBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 4,
    elevation: 3,
  },
  emptyTitle: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  emptyText: { color: '#64748B', fontSize: 12, lineHeight: 17 },
  emptyBannerBelowLocation: { top: 145 },
  locationBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 16,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
    elevation: 3,
  },
  locationTitle: { color: '#1E40AF', fontSize: 13, fontWeight: '800' },
  locationText: { color: '#1D4ED8', fontSize: 11 },
  locationError: { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' },
  locationErrorTitle: { color: '#9A3412', fontSize: 13, fontWeight: '800' },
  locationErrorText: { color: '#9A3412', fontSize: 11, lineHeight: 16 },
  locationActions: { flexDirection: 'row', gap: 8, marginTop: 5 },
  retryButton: { backgroundColor: '#EA580C', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8 },
  retryButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  settingsButton: { backgroundColor: '#FFFFFF', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8 },
  settingsButtonText: { color: '#9A3412', fontSize: 11, fontWeight: '800' },
});
