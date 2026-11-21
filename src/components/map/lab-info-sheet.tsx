import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LabActivityCard } from '@/components/map/lab-activity-card';
import { useLabActivity } from '@/hooks/use-lab-activity';
import { getErrorMessage } from '@/services/authService';
import type { LabDoc } from '@/types/firebase';

export function LabInfoSheet({
  lab,
  distanceMeter,
  onClose,
}: {
  lab: LabDoc;
  distanceMeter: number | null;
  onClose: () => void;
}) {
  const activity = useLabActivity(lab);

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.name}>{lab.nama}</Text>
            <Text style={styles.building}>{lab.gedung}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Tutup informasi lab" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Tutup</Text>
          </Pressable>
        </View>

        {lab.deskripsi ? <Text style={styles.description}>{lab.deskripsi}</Text> : null}

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Radius presensi</Text>
            <Text style={styles.metricValue}>{lab.radiusMeter} m</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Jarak dari Anda</Text>
            <Text style={styles.metricValue}>
              {distanceMeter === null ? 'Lokasi belum tersedia' : `${Math.round(distanceMeter)} m`}
            </Text>
          </View>
        </View>

        {activity.loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#2563EB" />
            <Text style={styles.loadingText}>Memuat aktivitas lab...</Text>
          </View>
        ) : activity.error ? (
          <View style={styles.activityError}>
            <Text style={styles.activityErrorText}>{getErrorMessage(activity.error)}</Text>
            <Pressable accessibilityRole="button" onPress={activity.retry}>
              <Text style={styles.retryText}>Coba lagi</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.activities}>
            <LabActivityCard
              title="Sedang berlangsung"
              activity={activity.current}
              emptyText="Tidak ada praktikum yang sedang berlangsung."
            />
            <LabActivityCard
              title="Berikutnya"
              activity={activity.next}
              emptyText="Belum ada praktikum berikutnya."
            />
            <Text style={styles.scopeNote}>Menampilkan praktikum kelas Anda.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: '55%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginTop: 8 },
  content: { padding: 16, gap: 13 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, gap: 3 },
  name: { color: '#0F172A', fontSize: 19, fontWeight: '800' },
  building: { color: '#475569', fontSize: 13, fontWeight: '600' },
  close: { backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  closeText: { color: '#334155', fontSize: 11, fontWeight: '800' },
  description: { color: '#64748B', fontSize: 13, lineHeight: 19 },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, borderRadius: 11, backgroundColor: '#EFF6FF', padding: 10, gap: 3 },
  metricLabel: { color: '#64748B', fontSize: 10, fontWeight: '700' },
  metricValue: { color: '#1D4ED8', fontSize: 13, fontWeight: '800' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  loadingText: { color: '#64748B', fontSize: 12 },
  activityError: { padding: 12, borderRadius: 10, backgroundColor: '#FEE2E2', gap: 7 },
  activityErrorText: { color: '#B91C1C', fontSize: 12, lineHeight: 17 },
  retryText: { color: '#1D4ED8', fontSize: 12, fontWeight: '800' },
  activities: { gap: 12 },
  scopeNote: { color: '#94A3B8', fontSize: 10, fontStyle: 'italic', textAlign: 'center' },
});
