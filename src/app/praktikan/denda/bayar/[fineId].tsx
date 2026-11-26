import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import {
  colors,
  EmptyState,
  ErrorBanner,
  ErrorState,
  LoadingState,
  PrimaryButton,
  ScreenHeader,
} from '@/components/screen-kit';
import { useAuth } from '@/context/AuthContext';
import { useFine, useFineTransactions } from '@/hooks/use-payments';
import { getErrorMessage } from '@/services/authService';
import {
  createPaymentTransaction,
  formatDateTimeWib,
  formatPaymentMethod,
  formatRupiah,
  syncPaymentStatus,
} from '@/services/paymentService';
import type { FineDoc, PaymentStatus, PaymentTransactionDoc } from '@/types/firebase';

function getStatusBadge(fine: FineDoc, latestTx: PaymentTransactionDoc | null): {
  label: string;
  bg: string;
  border: string;
  text: string;
} {
  const effective = fine.status === 'PAID' ? 'success' : (latestTx?.status ?? fine.latestPaymentStatus);
  if (effective === 'success') {
    return { label: 'Lunas (success)', bg: '#DCFCE7', border: '#86EFAC', text: '#166534' };
  }
  if (effective === 'pending') {
    return {
      label: 'Menunggu Pembayaran (pending)',
      bg: '#FEF3C7',
      border: '#FDE68A',
      text: '#92400E',
    };
  }
  if (effective === 'failed') {
    return { label: 'Gagal (failed)', bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B' };
  }
  return { label: 'Belum Dibayar', bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B' };
}

function getTxStatusLabel(status: PaymentStatus): { label: string; bg: string; text: string } {
  switch (status) {
    case 'success':
      return { label: 'success', bg: '#DCFCE7', text: '#166534' };
    case 'failed':
      return { label: 'failed', bg: '#FEE2E2', text: '#991B1B' };
    case 'pending':
    default:
      return { label: 'pending', bg: '#FEF3C7', text: '#92400E' };
  }
}

export default function PayFineScreen() {
  const params = useLocalSearchParams<{ fineId?: string | string[] }>();
  const fineId = (Array.isArray(params.fineId) ? params.fineId[0] : params.fineId) ?? '';
  return <PayFineContent key={fineId} fineId={fineId} />;
}

function PayFineContent({ fineId }: { fineId: string }) {
  const { uid } = useAuth();
  const { data: fine, loading: fineLoading, error: fineError, retry: retryFine } = useFine(fineId);
  const { data: transactions } = useFineTransactions(fineId, uid);

  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [syncNotice, setSyncNotice] = useState('');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [webViewOpen, setWebViewOpen] = useState(false);
  const [webViewError, setWebViewError] = useState('');
  const [webViewReloadKey, setWebViewReloadKey] = useState(0);

  const syncedOnCloseRef = useRef<string | null>(null);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/praktikan/denda' as Href);
    }
  };

  const runSync = useCallback(async (orderId: string) => {
    const cleanId = orderId.trim();
    if (!cleanId) return;
    setSyncing(true);
    setActionError('');
    try {
      const res = await syncPaymentStatus(cleanId);
      if (res.status === 'success' || res.fineStatus === 'PAID') {
        setSyncNotice('Pembayaran berhasil diverifikasi oleh server.');
      } else if (res.status === 'failed') {
        setSyncNotice('Transaksi gagal, dibatalkan, atau kedaluwarsa. Anda dapat mencoba bayar lagi.');
      } else {
        setSyncNotice('Status transaksi masih menunggu penyelesaian di Midtrans (pending).');
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  }, []);

  const closeWebViewAndSync = useCallback(
    (orderIdToSync: string | null) => {
      setWebViewOpen(false);
      setWebViewError('');
      if (orderIdToSync && syncedOnCloseRef.current !== orderIdToSync) {
        syncedOnCloseRef.current = orderIdToSync;
        void runSync(orderIdToSync);
      }
    },
    [runSync],
  );

  const isWebViewModalVisible =
    webViewOpen && Boolean(webViewUrl) && fine?.status !== 'PAID';

  const handleStartPayment = async () => {
    if (!fine || creating) return;
    setCreating(true);
    setActionError('');
    setSyncNotice('');
    try {
      const created = await createPaymentTransaction(fine.id);
      syncedOnCloseRef.current = null;
      setActiveOrderId(created.orderId);
      setWebViewUrl(created.redirectUrl);
      setWebViewError('');
      setWebViewOpen(true);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const handleResumeWebView = (url: string, orderId: string | null) => {
    syncedOnCloseRef.current = null;
    setActiveOrderId(orderId);
    setWebViewUrl(url);
    setWebViewError('');
    setWebViewOpen(true);
  };

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as { type?: unknown };
      if (payload?.type === 'SNAP_FINISHED') {
        closeWebViewAndSync(activeOrderId ?? fine?.latestOrderId ?? null);
      }
    } catch {
      // Abaikan pesan non-JSON dari halaman eksternal Midtrans.
    }
  };

  if (fineLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Pembayaran Denda" onBack={goBack} />
        <LoadingState label="Memuat detail tagihan denda..." />
      </SafeAreaView>
    );
  }

  if (fineError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Pembayaran Denda" onBack={goBack} />
        <ErrorState message={getErrorMessage(fineError)} onRetry={retryFine} />
      </SafeAreaView>
    );
  }

  if (!fine) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Pembayaran Denda" onBack={goBack} />
        <EmptyState
          icon="?"
          title="Tagihan tidak ditemukan"
          subtitle="Tagihan denda tersebut tidak tersedia atau Anda tidak memiliki akses."
          action={
            <PrimaryButton
              label="Kembali ke Daftar Denda"
              tone="praktikan"
              onPress={() => router.replace('/praktikan/denda' as Href)}
            />
          }
        />
      </SafeAreaView>
    );
  }

  const txList = transactions ?? [];
  const latestTx = txList[0] ?? null;
  const currentOrderId = activeOrderId ?? latestTx?.orderId ?? fine.latestOrderId;
  const effectiveStatus =
    fine.status === 'PAID' ? 'success' : (latestTx?.status ?? fine.latestPaymentStatus);
  const badge = getStatusBadge(fine, latestTx);
  const resumeUrl =
    webViewUrl ||
    (latestTx?.status === 'pending' && latestTx.redirectUrl ? latestTx.redirectUrl : null);
  const latestSuccessTx = txList.find((tx) => tx.status === 'success') ?? null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Pembayaran Denda" onBack={goBack} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
              <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
            </View>
            <Text style={styles.lateChip}>Terlambat {fine.lateMinutes} menit</Text>
          </View>

          <Text style={styles.sessionTitle}>{fine.sessionTitle}</Text>
          <Text style={styles.labSubtitle}>{fine.labName || 'Laboratorium Praktikum'}</Text>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Tanggal tagihan</Text>
            <Text style={styles.detailValue}>{formatDateTimeWib(fine.issuedAt)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Nominal denda</Text>
            <Text style={styles.amountLarge}>{formatRupiah(fine.amount)}</Text>
          </View>
        </View>

        {actionError ? <ErrorBanner message={actionError} /> : null}
        {syncNotice ? (
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>{syncNotice}</Text>
          </View>
        ) : null}

        {fine.status === 'PAID' ? (
          <View style={styles.paidCard}>
            <View style={styles.paidHeader}>
              <View style={styles.paidIcon}>
                <Text style={styles.paidIconText}>✓</Text>
              </View>
              <View style={styles.flex1}>
                <Text style={styles.paidTitle}>Pembayaran Lunas</Text>
                <Text style={styles.paidSubtitle}>
                  Diverifikasi pada{' '}
                  {formatDateTimeWib(fine.paidAt ?? latestSuccessTx?.settledAt)}
                </Text>
              </View>
            </View>

            <View style={styles.paidMetaBox}>
              <View style={styles.detailRow}>
                <Text style={styles.paidMetaLabel}>Nominal terbayar</Text>
                <Text style={styles.paidMetaValue}>{formatRupiah(fine.amount)}</Text>
              </View>
              {latestSuccessTx?.paymentType ? (
                <View style={styles.detailRow}>
                  <Text style={styles.paidMetaLabel}>Metode bayar</Text>
                  <Text style={styles.paidMetaValue}>
                    {formatPaymentMethod(latestSuccessTx.paymentType)}
                  </Text>
                </View>
              ) : null}
              {currentOrderId ? (
                <View style={styles.detailRow}>
                  <Text style={styles.paidMetaLabel}>ID Order</Text>
                  <Text style={styles.paidMetaValue} numberOfLines={1}>
                    {currentOrderId}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.attendanceRuleNote}>
              <Text style={styles.attendanceRuleText}>
                Pembayaran denda berhasil diverifikasi server. Status kehadiran pada sesi ini tetap tercatat sebagai Terlambat.
              </Text>
            </View>

            <View style={styles.buttonStack}>
              <PrimaryButton
                label="Lihat Riwayat Pembayaran"
                tone="praktikan"
                onPress={() => router.replace('/praktikan/denda?tab=riwayat' as Href)}
              />
              <PrimaryButton label="Kembali" tone="neutral" onPress={goBack} />
            </View>
          </View>
        ) : (
          <View style={styles.actionCard}>
            {effectiveStatus === 'failed' ? (
              <>
                <View style={styles.failedBanner}>
                  <Text style={styles.failedTitle}>Transaksi sebelumnya gagal</Text>
                  <Text style={styles.failedText}>
                    Pembayaran dibatalkan, ditolak, atau kedaluwarsa
                    {latestTx?.midtransTransactionStatus
                      ? ` (${latestTx.midtransTransactionStatus})`
                      : ''}
                    . Buat transaksi baru untuk menyelesaikan tagihan.
                  </Text>
                </View>
                <PrimaryButton
                  label="Coba Bayar Lagi"
                  tone="praktikan"
                  loading={creating}
                  onPress={() => void handleStartPayment()}
                />
              </>
            ) : effectiveStatus === 'pending' ? (
              <>
                <View style={styles.pendingBanner}>
                  <Text style={styles.pendingTitle}>Menunggu verifikasi pembayaran</Text>
                  <Text style={styles.pendingText}>
                    Selesaikan pembayaran di Midtrans, lalu tekan Periksa Status Pembayaran bila status belum otomatis berubah.
                  </Text>
                  {currentOrderId ? (
                    <Text style={styles.pendingOrder}>Order: {currentOrderId}</Text>
                  ) : null}
                </View>

                <View style={styles.buttonStack}>
                  {currentOrderId ? (
                    <PrimaryButton
                      label="Periksa Status Pembayaran"
                      tone="praktikan"
                      loading={syncing}
                      disabled={creating}
                      onPress={() => void runSync(currentOrderId)}
                    />
                  ) : null}
                  {resumeUrl ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={creating || syncing}
                      onPress={() => handleResumeWebView(resumeUrl, currentOrderId)}
                      style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.outlineButtonText}>Lanjutkan Halaman Midtrans</Text>
                    </Pressable>
                  ) : null}
                  <PrimaryButton
                    label="Buat Transaksi Baru"
                    tone="neutral"
                    loading={creating}
                    disabled={syncing}
                    onPress={() => void handleStartPayment()}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.actionHint}>
                  Pembayaran dilakukan lewat Midtrans Sandbox. Status lunas hanya dikonfirmasi setelah verifikasi server.
                </Text>
                <PrimaryButton
                  label="Bayar via Midtrans"
                  tone="praktikan"
                  loading={creating}
                  onPress={() => void handleStartPayment()}
                />
              </>
            )}
          </View>
        )}

        {txList.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Riwayat Percobaan Transaksi ({txList.length})</Text>
            {txList.map((tx) => {
              const txMeta = getTxStatusLabel(tx.status);
              return (
                <View key={tx.id} style={styles.txRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.txOrderText} numberOfLines={1}>
                      {tx.orderId}
                    </Text>
                    <Text style={styles.txSubText}>
                      {formatDateTimeWib(tx.settledAt ?? tx.createdAt)}
                      {tx.paymentType ? ` · ${formatPaymentMethod(tx.paymentType)}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.txPill, { backgroundColor: txMeta.bg }]}>
                    <Text style={[styles.txPillText, { color: txMeta.text }]}>{txMeta.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={isWebViewModalVisible}
        animationType="slide"
        onRequestClose={() => closeWebViewAndSync(currentOrderId)}
      >
        <SafeAreaView style={styles.webViewSafeArea} edges={['top', 'bottom']}>
          <View style={styles.webViewHeader}>
            <View style={styles.flex1}>
              <Text style={styles.webViewTitle}>Pembayaran Midtrans</Text>
              {currentOrderId ? (
                <Text style={styles.webViewSubtitle} numberOfLines={1}>
                  {currentOrderId}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => closeWebViewAndSync(currentOrderId)}
              style={({ pressed }) => [styles.webViewCloseButton, pressed && styles.pressed]}
            >
              <Text style={styles.webViewCloseText}>Tutup</Text>
            </Pressable>
          </View>

          {webViewError ? (
            <View style={styles.webViewErrorWrap}>
              <ErrorState
                message={webViewError}
                onRetry={() => {
                  setWebViewError('');
                  setWebViewReloadKey((prev) => prev + 1);
                }}
              />
            </View>
          ) : webViewUrl ? (
            <WebView
              key={`${webViewUrl}-${webViewReloadKey}`}
              source={{ uri: webViewUrl }}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <LoadingState label="Memuat halaman pembayaran Midtrans..." />
                </View>
              )}
              onMessage={handleWebViewMessage}
              onShouldStartLoadWithRequest={(request) => {
                const url = request.url ?? '';
                if (!url || /^https?:\/\//i.test(url) || url === 'about:blank') {
                  return true;
                }
                void Linking.canOpenURL(url).then((supported) => {
                  if (supported) {
                    void Linking.openURL(url);
                  }
                });
                return false;
              }}
              onError={(event) => {
                setWebViewError(
                  event.nativeEvent.description || 'Halaman pembayaran Midtrans gagal dimuat.',
                );
              }}
              onHttpError={(event) => {
                if (event.nativeEvent.statusCode >= 500) {
                  setWebViewError(`Server pembayaran merespons HTTP ${event.nativeEvent.statusCode}.`);
                }
              }}
              style={styles.webView}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 720,
    paddingBottom: 40,
    paddingHorizontal: 16,
    paddingTop: 16,
    width: '100%',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
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
  sessionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 24,
  },
  labSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  amountLarge: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  infoBanner: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
  },
  infoBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E40AF',
    lineHeight: 19,
  },
  paidCard: {
    backgroundColor: '#ECFDF3',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  paidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paidIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidIconText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  paidTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#166534',
  },
  paidSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    marginTop: 2,
  },
  paidMetaBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 12,
    gap: 8,
  },
  paidMetaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  paidMetaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  attendanceRuleNote: {
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    padding: 12,
  },
  attendanceRuleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
    lineHeight: 19,
  },
  actionCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  actionHint: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
  },
  failedBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  failedTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#991B1B',
  },
  failedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991B1B',
    lineHeight: 18,
  },
  pendingBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  pendingTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  pendingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    lineHeight: 18,
  },
  pendingOrder: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    marginTop: 2,
  },
  buttonStack: {
    gap: 10,
  },
  outlineButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  outlineButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E40AF',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.label,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  txOrderText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  txSubText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  txPill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  txPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  webViewSafeArea: {
    flex: 1,
    backgroundColor: colors.card,
  },
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  webViewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  webViewSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  webViewCloseButton: {
    minHeight: 44,
    minWidth: 72,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  webViewCloseText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  webView: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webViewErrorWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
