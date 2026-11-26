import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  colors,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  ScreenHeader,
} from '@/components/screen-kit';
import { useAuth } from '@/context/AuthContext';
import { useMyFines, useMyPaymentTransactions } from '@/hooks/use-payments';
import { getErrorMessage } from '@/services/authService';
import {
  formatDateTimeWib,
  formatPaymentMethod,
  formatRupiah,
} from '@/services/paymentService';
import type { FineDoc, PaymentStatus, PaymentTransactionDoc } from '@/types/firebase';

type ActiveTab = 'tagihan' | 'riwayat';

function getFineBadgeMeta(fine: FineDoc): {
  label: string;
  bg: string;
  border: string;
  text: string;
} {
  if (fine.status === 'PAID' || fine.latestPaymentStatus === 'success') {
    return {
      label: 'Lunas (success)',
      bg: '#DCFCE7',
      border: '#86EFAC',
      text: '#166534',
    };
  }
  if (fine.latestPaymentStatus === 'pending') {
    return {
      label: 'Menunggu Pembayaran (pending)',
      bg: '#FEF3C7',
      border: '#FDE68A',
      text: '#92400E',
    };
  }
  if (fine.latestPaymentStatus === 'failed') {
    return {
      label: 'Gagal (failed)',
      bg: '#FEE2E2',
      border: '#FCA5A5',
      text: '#991B1B',
    };
  }
  return {
    label: 'Belum Dibayar',
    bg: '#FEE2E2',
    border: '#FCA5A5',
    text: '#991B1B',
  };
}

function getTxBadgeMeta(status: PaymentStatus): {
  label: string;
  bg: string;
  border: string;
  text: string;
} {
  switch (status) {
    case 'success':
      return {
        label: 'Berhasil (success)',
        bg: '#DCFCE7',
        border: '#86EFAC',
        text: '#166534',
      };
    case 'failed':
      return {
        label: 'Gagal (failed)',
        bg: '#FEE2E2',
        border: '#FCA5A5',
        text: '#991B1B',
      };
    case 'pending':
    default:
      return {
        label: 'Menunggu (pending)',
        bg: '#FEF3C7',
        border: '#FDE68A',
        text: '#92400E',
      };
  }
}

export default function PraktikanFinesScreen() {
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const [tabOverride, setTabOverride] = useState<{
    param: string | undefined;
    tab: ActiveTab;
  } | null>(null);
  const activeTab: ActiveTab =
    tabOverride && tabOverride.param === rawTab
      ? tabOverride.tab
      : rawTab === 'riwayat'
        ? 'riwayat'
        : 'tagihan';

  const { uid } = useAuth();
  const {
    data: finesData,
    loading: finesLoading,
    error: finesError,
    retry: retryFines,
  } = useMyFines(uid);
  const {
    data: transactionsData,
    loading: txLoading,
    error: txError,
    retry: retryTx,
  } = useMyPaymentTransactions(uid);

  const fines = useMemo(() => finesData ?? [], [finesData]);
  const transactions = useMemo(() => transactionsData ?? [], [transactionsData]);

  const summary = useMemo(() => {
    let unpaidTotal = 0;
    let unpaidCount = 0;
    let paidTotal = 0;
    let paidCount = 0;

    fines.forEach((fine) => {
      if (fine.status === 'PAID') {
        paidTotal += fine.amount;
        paidCount += 1;
      } else {
        unpaidTotal += fine.amount;
        unpaidCount += 1;
      }
    });

    return { unpaidTotal, unpaidCount, paidTotal, paidCount };
  }, [fines]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/jadwal' as Href);
    }
  };

  const renderFinesTab = () => {
    if (finesLoading) {
      return <LoadingState label="Memuat daftar tagihan denda..." />;
    }
    if (finesError) {
      return <ErrorState message={getErrorMessage(finesError)} onRetry={retryFines} />;
    }
    if (fines.length === 0) {
      return (
        <EmptyState
          icon="✓"
          title="Tidak ada tagihan denda"
          subtitle="Anda belum memiliki tagihan keterlambatan. Hadir sebelum batas toleransi tiap sesi agar bebas denda."
          action={
            <PrimaryButton
              label="Kembali ke Jadwal"
              tone="praktikan"
              onPress={() => router.replace('/jadwal' as Href)}
            />
          }
        />
      );
    }

    return (
      <View style={styles.listStack}>
        {fines.map((fine) => {
          const badge = getFineBadgeMeta(fine);
          const isUnpaid = fine.status === 'UNPAID';

          return (
            <View key={fine.id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                  <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
                </View>
                <Text style={styles.lateChip}>Terlambat {fine.lateMinutes} menit</Text>
              </View>

              <View style={styles.titleBlock}>
                <Text style={styles.cardTitle}>{fine.sessionTitle}</Text>
                <Text style={styles.cardSubtitle}>{fine.labName || 'Laboratorium Praktikum'}</Text>
              </View>

              <View style={styles.metaBox}>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>Tanggal tagihan</Text>
                  <Text style={styles.metaValue}>{formatDateTimeWib(fine.issuedAt)}</Text>
                </View>
                <View style={styles.amountCol}>
                  <Text style={styles.metaLabel}>Nominal denda</Text>
                  <Text style={styles.amountValue}>{formatRupiah(fine.amount)}</Text>
                </View>
              </View>

              {isUnpaid ? (
                <PrimaryButton
                  label="Bayar Sekarang"
                  tone="praktikan"
                  onPress={() => router.push(`/praktikan/denda/bayar/${fine.id}` as Href)}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/praktikan/denda/bayar/${fine.id}` as Href)}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                >
                  <Text style={styles.secondaryButtonText}>Lihat Rincian Pembayaran</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderTransactionsTab = () => {
    if (txLoading) {
      return <LoadingState label="Memuat riwayat pembayaran..." />;
    }
    if (txError) {
      return <ErrorState message={getErrorMessage(txError)} onRetry={retryTx} />;
    }
    if (transactions.length === 0) {
      return (
        <EmptyState
          icon="Rp"
          title="Belum ada riwayat pembayaran"
          subtitle="Transaksi pembayaran Midtrans Anda akan tersimpan permanen di sini dan tetap tersedia saat aplikasi dibuka kembali."
        />
      );
    }

    return (
      <View style={styles.listStack}>
        {transactions.map((tx: PaymentTransactionDoc) => {
          const badge = getTxBadgeMeta(tx.status);
          const timeLabel = tx.settledAt ? 'Waktu selesai' : 'Waktu transaksi';
          const txTime = formatDateTimeWib(tx.settledAt ?? tx.createdAt);

          return (
            <Pressable
              key={tx.id}
              accessibilityRole="button"
              onPress={() => router.push(`/praktikan/denda/bayar/${tx.fineId}` as Href)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.cardTopRow}>
                <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                  <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
                </View>
                <Text style={styles.amountValue}>{formatRupiah(tx.amount)}</Text>
              </View>

              <View style={styles.titleBlock}>
                <Text style={styles.cardTitle}>{tx.sessionTitle}</Text>
                <Text style={styles.cardSubtitle}>{tx.labName || 'Laboratorium Praktikum'}</Text>
              </View>

              <View style={styles.txDetailsGrid}>
                <View style={styles.txDetailRow}>
                  <Text style={styles.txDetailLabel}>Tanggal tagihan</Text>
                  <Text style={styles.txDetailValue}>
                    {formatDateTimeWib(tx.fineIssuedAt, 'Tercatat di sistem')}
                  </Text>
                </View>
                <View style={styles.txDetailRow}>
                  <Text style={styles.txDetailLabel}>{timeLabel}</Text>
                  <Text style={styles.txDetailValue}>{txTime}</Text>
                </View>
                {tx.paymentType ? (
                  <View style={styles.txDetailRow}>
                    <Text style={styles.txDetailLabel}>Metode bayar</Text>
                    <Text style={styles.txDetailValue}>{formatPaymentMethod(tx.paymentType)}</Text>
                  </View>
                ) : null}
                <View style={styles.txDetailRow}>
                  <Text style={styles.txDetailLabel}>ID Order</Text>
                  <Text style={styles.txDetailMono} numberOfLines={1}>
                    {tx.orderId}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Tagihan & Pembayaran Denda" onBack={goBack} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>RINGKASAN DENDA PRAKTIKUM</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Total Tunggakan</Text>
              <Text style={styles.summaryAmount}>{formatRupiah(summary.unpaidTotal)}</Text>
              <Text style={styles.summaryMeta}>{summary.unpaidCount} tagihan belum dibayar</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Sudah Dibayar</Text>
              <Text style={styles.summaryAmount}>{formatRupiah(summary.paidTotal)}</Text>
              <Text style={styles.summaryMeta}>{summary.paidCount} tagihan lunas</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabBar} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'tagihan' }}
            onPress={() => setTabOverride({ param: rawTab, tab: 'tagihan' })}
            style={[styles.tabButton, activeTab === 'tagihan' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === 'tagihan' && styles.tabTextActive]}>
              Tagihan Denda ({fines.length})
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'riwayat' }}
            onPress={() => setTabOverride({ param: rawTab, tab: 'riwayat' })}
            style={[styles.tabButton, activeTab === 'riwayat' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === 'riwayat' && styles.tabTextActive]}>
              Riwayat Pembayaran ({transactions.length})
            </Text>
          </Pressable>
        </View>

        {activeTab === 'tagihan' ? renderFinesTab() : renderTransactionsTab()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 720,
    paddingBottom: 40,
    paddingHorizontal: 16,
    paddingTop: 16,
    width: '100%',
  },
  heroCard: {
    backgroundColor: '#172E73',
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  heroEyebrow: {
    color: '#DBEAFE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryBox: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  summaryLabel: {
    color: '#DBEAFE',
    fontSize: 11,
    fontWeight: '700',
  },
  summaryAmount: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  summaryMeta: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
    gap: 6,
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tabButtonActive: {
    backgroundColor: colors.card,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  listStack: {
    gap: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  lateChip: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  titleBlock: {
    gap: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 22,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  metaBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E40AF',
  },
  txDetailsGrid: {
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  txDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  txDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  txDetailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  txDetailMono: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    flexShrink: 1,
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.8,
  },
});
