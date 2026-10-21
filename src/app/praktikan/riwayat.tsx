import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type HistoryItem = {
  id: string;
  sessionId: string;
  namaPraktikum: string;
  kelas: string;
  waktuHadir: string;
  catatan: string;
};

const BUDI_HISTORY: HistoryItem[] = [
  {
    id: 'abs-2',
    sessionId: 'sesi-3',
    namaPraktikum: 'Basis Data Lanjut - Modul 1',
    kelas: 'IF-B',
    waktuHadir: '13:02 WIB',
    catatan: 'Hadir',
  },
];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function AttendanceHistoryScreen() {
  const params = useLocalSearchParams<{
    userId?: string | string[];
    sessionId?: string | string[];
    namaPraktikum?: string | string[];
    kelas?: string | string[];
    waktuHadir?: string | string[];
    catatan?: string | string[];
  }>();

  const userId = firstParam(params.userId) ?? 'prk-1';
  const isEmptyProfile = userId === 'prk-2';

  const history = useMemo(() => {
    if (isEmptyProfile) return [];

    const result = [...BUDI_HISTORY];
    const sessionId = firstParam(params.sessionId);
    const waktuHadir = firstParam(params.waktuHadir);

    if (sessionId && waktuHadir && !result.some((item) => item.sessionId === sessionId)) {
      result.unshift({
        id: `local-${sessionId}`,
        sessionId,
        namaPraktikum: firstParam(params.namaPraktikum) ?? 'Sesi praktikum',
        kelas: firstParam(params.kelas) ?? 'IF-A',
        waktuHadir,
        catatan: firstParam(params.catatan) ?? 'Hadir',
      });
    }

    return result;
  }, [isEmptyProfile, params.catatan, params.kelas, params.namaPraktikum, params.sessionId, params.waktuHadir]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/jadwal'))}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>‹</Text>
          </Pressable>
          <View style={styles.topBarCopy}>
            <Text style={styles.eyebrow}>MODUL PRAKTIKAN</Text>
            <Text style={styles.pageTitle}>Catatan kehadiran saya</Text>
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{isEmptyProfile ? 'SA' : 'BS'}</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileName}>{isEmptyProfile ? 'Siti Aminah' : 'Budi Santoso'}</Text>
            <Text style={styles.profileNim}>{isEmptyProfile ? '2301002' : '2301001'} · Praktikan</Text>
          </View>
          <View style={styles.totalBadge}>
            <Text style={styles.totalNumber}>{history.length}</Text>
            <Text style={styles.totalLabel}>Hadir</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>RIWAYAT</Text>
            <Text style={styles.sectionTitle}>Presensi tercatat</Text>
          </View>
          <Text style={styles.itemCount}>{history.length} catatan</Text>
        </View>

        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>○</Text>
            </View>
            <Text style={styles.emptyTitle}>Belum ada catatan kehadiran</Text>
            <Text style={styles.emptyText}>
              Kehadiran yang berhasil dicatat akan muncul di halaman ini.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/jadwal'))}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>Kembali ke jadwal</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {history.map((item, index) => (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.timelineColumn}>
                  <View style={styles.checkCircle}>
                    <Text style={styles.checkText}>✓</Text>
                  </View>
                  {index < history.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.historyContent}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyTitle}>{item.namaPraktikum}</Text>
                    <View style={styles.presentBadge}>
                      <Text style={styles.presentBadgeText}>Hadir</Text>
                    </View>
                  </View>
                  <Text style={styles.historyMeta}>{item.kelas} · {item.sessionId.toUpperCase()}</Text>
                  <View style={styles.divider} />
                  <View style={styles.historyFooter}>
                    <View>
                      <Text style={styles.footerLabel}>Waktu tercatat</Text>
                      <Text style={styles.footerValue}>{item.waktuHadir}</Text>
                    </View>
                    <View style={styles.noteBlock}>
                      <Text style={styles.footerLabel}>Catatan</Text>
                      <Text style={styles.noteValue} numberOfLines={2}>{item.catatan}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {history.length > 0 ? (
          <View style={styles.helperCard}>
            <Text style={styles.helperTitle}>Data lokal sementara</Text>
            <Text style={styles.helperText}>
              Riwayat ini menggunakan data dummy dan akan kembali ke kondisi awal ketika aplikasi dimuat ulang.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F7FB' },
  content: {
    alignSelf: 'center',
    gap: 18,
    maxWidth: 720,
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 14,
    width: '100%',
  },
  topBar: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E7EC',
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  backButtonText: { color: '#17233C', fontSize: 34, lineHeight: 36, marginTop: -3 },
  topBarCopy: { flex: 1 },
  eyebrow: { color: '#667085', fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
  pageTitle: { color: '#101828', fontSize: 24, fontWeight: '800', marginTop: 2 },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#172E73',
    borderRadius: 22,
    flexDirection: 'row',
    padding: 18,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#D9E2FF',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarText: { color: '#173E9A', fontSize: 14, fontWeight: '900' },
  profileCopy: { flex: 1, marginLeft: 12 },
  profileName: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  profileNim: { color: '#B9C8FF', fontSize: 12, marginTop: 3 },
  totalBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    minWidth: 56,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  totalNumber: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  totalLabel: { color: '#B9C8FF', fontSize: 10, fontWeight: '700' },
  sectionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sectionEyebrow: { color: '#2D5BDB', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  sectionTitle: { color: '#101828', fontSize: 21, fontWeight: '800', marginTop: 3 },
  itemCount: { color: '#667085', fontSize: 12, fontWeight: '700' },
  list: { gap: 12 },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E7EC',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 17,
  },
  timelineColumn: { alignItems: 'center', marginRight: 13 },
  checkCircle: {
    alignItems: 'center',
    backgroundColor: '#DDF8E8',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  checkText: { color: '#0E8C52', fontSize: 16, fontWeight: '900' },
  timelineLine: { backgroundColor: '#D0D5DD', flex: 1, marginTop: 7, minHeight: 22, width: 2 },
  historyContent: { flex: 1 },
  historyHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  historyTitle: { color: '#101828', flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 21 },
  presentBadge: { backgroundColor: '#ECFDF3', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  presentBadgeText: { color: '#067647', fontSize: 10, fontWeight: '800' },
  historyMeta: { color: '#667085', fontSize: 12, marginTop: 5 },
  divider: { backgroundColor: '#EAECF0', height: 1, marginVertical: 13 },
  historyFooter: { flexDirection: 'row', gap: 16 },
  footerLabel: { color: '#98A2B3', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  footerValue: { color: '#17233C', fontSize: 14, fontWeight: '800', marginTop: 4 },
  noteBlock: { flex: 1 },
  noteValue: { color: '#475467', fontSize: 12, lineHeight: 17, marginTop: 4 },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 22,
    borderStyle: 'dashed',
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 38,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  emptyIconText: { color: '#2D5BDB', fontSize: 38, lineHeight: 40 },
  emptyTitle: { color: '#101828', fontSize: 18, fontWeight: '800', marginTop: 17, textAlign: 'center' },
  emptyText: { color: '#667085', fontSize: 14, lineHeight: 21, marginTop: 7, textAlign: 'center' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2D5BDB',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 50,
    paddingHorizontal: 22,
  },
  primaryButtonPressed: { backgroundColor: '#2048B5', transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  helperCard: {
    backgroundColor: '#EEF4FF',
    borderColor: '#C8D7FF',
    borderRadius: 16,
    borderWidth: 1,
    padding: 15,
  },
  helperTitle: { color: '#183B8F', fontSize: 12, fontWeight: '800' },
  helperText: { color: '#475467', fontSize: 12, lineHeight: 18, marginTop: 4 },
  pressed: { opacity: 0.72 },
});
