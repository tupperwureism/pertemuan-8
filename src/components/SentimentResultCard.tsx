import { StyleSheet, Text, View } from 'react-native';

import type {
  SentimentAnalysisResult,
  SentimentLabel,
} from '@/services/aiService';

type Props = {
  result: SentimentAnalysisResult | null;
};

const sentimentColors: Record<SentimentLabel, string> = {
  positif: '#16A34A',
  netral: '#64748B',
  negatif: '#DC2626',
};

function getResultText(result: SentimentAnalysisResult): string {
  if (result.label) {
    return result.label;
  }

  if (result.status === 'unknown_vocabulary') {
    return 'Teks belum dapat dikenali model';
  }

  if (result.status === 'empty_input') {
    return 'Alasan masih kosong';
  }

  return 'Analisis tidak tersedia';
}

export default function SentimentResultCard({ result }: Props) {
  if (!result) {
    return null;
  }

  const badgeColor = result.label
    ? sentimentColors[result.label]
    : '#64748B';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Hasil Analisis AI (Informasi Pendukung)</Text>

      <View style={[styles.badge, { backgroundColor: badgeColor }]}>
        <Text style={styles.badgeText}>{getResultText(result)}</Text>
      </View>

      <Text style={styles.description}>
        Model menganalisis sentimen teks secara lokal sebagai informasi
        pendukung.
      </Text>

      <Text style={styles.warning}>
        Hasil AI tidak menentukan apakah izin diterima atau ditolak.
      </Text>

      {result.experimental && (
        <Text style={styles.experimental}>Model eksperimental</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 10,
  },

  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },

  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },

  badgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    textTransform: 'capitalize',
  },

  description: {
    color: '#334155',
    lineHeight: 20,
  },

  warning: {
    color: '#92400E',
    lineHeight: 20,
  },

  experimental: {
    color: '#64748B',
    fontSize: 12,
    fontStyle: 'italic',
  },
});

