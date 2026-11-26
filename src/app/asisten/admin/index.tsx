import { router, type Href } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  colors,
  EmptyState,
  ErrorState,
  LoadingState,
  ScreenHeader,
} from '@/components/screen-kit';
import { useVisibleClasses } from '@/hooks/use-firestore-data';
import { getErrorMessage } from '@/services/authService';
import type { ClassDoc } from '@/types/firebase';

/** Daftar kelas yang menjadi tanggung jawab Asprak (baca-saja untuk konfigurasi kelas/lab). */
export default function AdminClassesScreen() {
  const { data: classes, loading, error, retry } = useVisibleClasses('asisten');

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/jadwal' as Href));

  const renderItem = ({ item }: { item: ClassDoc }) => (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push(`/asisten/admin/kelas/${item.id}` as Href)}
    >
      <View style={styles.kodeBadge}>
        <Text style={styles.kodeBadgeText}>{item.kodeKelas}</Text>
      </View>
      <Text style={styles.cardTitle}>{item.nama}</Text>
      <Text style={styles.cardSubtitle}>{item.mataPraktikum}</Text>
      <Text style={styles.cardAction}>Kelola sesi &amp; lihat peserta</Text>
    </Pressable>
  );

  const renderBody = () => {
    if (loading) return <LoadingState label="Memuat kelas..." />;
    if (error) return <ErrorState message={getErrorMessage(error)} onRetry={retry} />;
    return (
      <FlatList
        data={classes ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="0"
            title="Belum ada kelas yang diampu"
            subtitle="Penugasan kelas dan distribusi praktikan dilakukan oleh Aslab."
          />
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="Kelas Saya" onBack={goBack} />

      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerTitle}>Kewenangan Asprak</Text>
        <Text style={styles.infoBannerSubtitle}>
          Konfigurasi lab dan distribusi praktikan dikelola oleh Aslab. Anda dapat mengelola jadwal dan sesi pada kelas yang Anda ampu.
        </Text>
      </View>

      {renderBody()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  kodeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  kodeBadgeText: { fontSize: 12, fontWeight: '800', color: '#5B21B6' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardSubtitle: { fontSize: 13, color: '#475569' },
  cardAction: { fontSize: 13, fontWeight: '700', color: colors.asisten, marginTop: 4 },
  infoBanner: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#F5F3FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    gap: 4,
  },
  infoBannerTitle: { fontSize: 14, fontWeight: '800', color: '#5B21B6' },
  infoBannerSubtitle: { fontSize: 12, color: '#334155', lineHeight: 18 },
});
