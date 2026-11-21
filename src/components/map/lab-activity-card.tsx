import { StyleSheet, Text, View } from 'react-native';

import type { LabActivityEntry } from '@/hooks/use-lab-activity';
import { formatSessionTime } from '@/lib/format';
import type { SessionStatus } from '@/types/firebase';

const STATUS_LABEL: Record<SessionStatus, string> = {
  BELUM_DIBUKA: 'Belum Dibuka',
  DIBUKA: 'Dibuka',
  DITUTUP: 'Ditutup',
};

export function LabActivityCard({
  title,
  activity,
  emptyText,
}: {
  title: string;
  activity: LabActivityEntry | null;
  emptyText: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {activity ? (
        <View style={styles.card}>
          <View style={styles.headingRow}>
            <View style={styles.headingText}>
              <Text style={styles.praktikum} numberOfLines={2}>
                {activity.kelas?.mataPraktikum ?? 'Praktikum'}
              </Text>
              <Text style={styles.sessionTitle}>{activity.session.judul}</Text>
            </View>
            <View style={[styles.badge, styles[`badge_${activity.session.status}`]]}>
              <Text style={[styles.badgeText, styles[`badgeText_${activity.session.status}`]]}>
                {STATUS_LABEL[activity.session.status]}
              </Text>
            </View>
          </View>
          <Text style={styles.meta}>Kelas {activity.kelas?.kodeKelas ?? activity.kelas?.nama ?? '-'}</Text>
          <Text style={styles.time} numberOfLines={2}>
            {formatSessionTime(activity.session.startsAt, activity.session.endsAt)}
          </Text>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 7 },
  sectionTitle: { color: '#475569', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    backgroundColor: '#F8FAFC',
  },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headingText: { flex: 1, gap: 2 },
  praktikum: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  sessionTitle: { color: '#475569', fontSize: 12, fontWeight: '600' },
  meta: { color: '#334155', fontSize: 12, fontWeight: '700' },
  time: { color: '#64748B', fontSize: 11, lineHeight: 16 },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 9, fontWeight: '800' },
  badge_DIBUKA: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  badgeText_DIBUKA: { color: '#15803D' },
  badge_BELUM_DIBUKA: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  badgeText_BELUM_DIBUKA: { color: '#475569' },
  badge_DITUTUP: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  badgeText_DITUTUP: { color: '#B91C1C' },
  emptyCard: { borderRadius: 10, backgroundColor: '#F8FAFC', padding: 11 },
  emptyText: { color: '#64748B', fontSize: 12, lineHeight: 17 },
});
