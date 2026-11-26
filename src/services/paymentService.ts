import { collection, doc, onSnapshot, query, where } from '@react-native-firebase/firestore';

import {
  COLLECTIONS,
  type ErrorCallback,
  type FineDoc,
  type FineStatus,
  type FirestoreTimestamp,
  type PaymentStatus,
  type PaymentTransactionDoc,
  type Unsubscribe,
} from '@/types/firebase';

import { firebaseAuth, firestore, requireUid, toError, withId } from './firebase';

export interface CreatePaymentResult {
  orderId: string;
  snapToken: string;
  redirectUrl: string;
  amount: number;
  status: PaymentStatus;
}

export interface SyncPaymentResult {
  status: PaymentStatus;
  fineStatus: FineStatus;
}

const REQUEST_TIMEOUT_MS = 20_000;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Transfer Bank (VA)',
  echannel: 'Mandiri Bill',
  permata: 'Permata VA',
  bca_va: 'BCA Virtual Account',
  bni_va: 'BNI Virtual Account',
  bri_va: 'BRI Virtual Account',
  cimb_va: 'CIMB Virtual Account',
  qris: 'QRIS',
  gopay: 'GoPay',
  shopeepay: 'ShopeePay',
  dana: 'DANA',
  cstore: 'Minimarket',
  credit_card: 'Kartu Kredit',
  akulaku: 'Akulaku',
  kredivo: 'Kredivo',
};

const finesCol = () => collection(firestore(), COLLECTIONS.fines);
const fineRef = (fineId: string) => doc(firestore(), COLLECTIONS.fines, fineId);
const transactionsCol = () => collection(firestore(), COLLECTIONS.paymentTransactions);

function toFine(snap: { id: string; data(): unknown }): FineDoc {
  return { ...(snap.data() as Omit<FineDoc, 'id'>), id: snap.id };
}

function toTransaction(snap: { id: string; data(): unknown }): PaymentTransactionDoc {
  return { ...(snap.data() as Omit<PaymentTransactionDoc, 'id'>), id: snap.id };
}

function sortFinesDesc(items: FineDoc[]): FineDoc[] {
  return [...items].sort(
    (a, b) => (b.issuedAt?.toMillis() ?? Date.now()) - (a.issuedAt?.toMillis() ?? Date.now()),
  );
}

function sortTransactionsDesc(items: PaymentTransactionDoc[]): PaymentTransactionDoc[] {
  return [...items].sort(
    (a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()),
  );
}

/** Format nominal rupiah Indonesia tanpa spasi non-standar dari Intl. */
export function formatRupiah(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const sign = safe < 0 ? '-' : '';
  const grouped = Math.abs(safe)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${grouped}`;
}

export function formatDateTimeWib(
  ts: FirestoreTimestamp | null | undefined,
  fallback = 'Menunggu konfirmasi',
): string {
  if (!ts) return fallback;
  return `${new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ts.toDate())} WIB`;
}

export function formatPaymentMethod(paymentType: string | null | undefined): string {
  if (!paymentType) return 'Midtrans Snap';
  const normalized = paymentType.trim().toLowerCase();
  if (!normalized) return 'Midtrans Snap';
  return PAYMENT_METHOD_LABELS[normalized] ?? normalized.replace(/_/g, ' ').toUpperCase();
}

export function subscribeMyFines(
  uid: string,
  cb: (fines: FineDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  let activeUid: string;
  try {
    activeUid = uid || requireUid();
  } catch (error) {
    onError(toError(error));
    return () => undefined;
  }

  return onSnapshot(
    query(finesCol(), where('praktikanUid', '==', activeUid)),
    (snap) => cb(sortFinesDesc(snap.docs.map(toFine))),
    (error) => onError(toError(error)),
  );
}

export function subscribeFineById(
  fineId: string,
  cb: (fine: FineDoc | null) => void,
  onError: ErrorCallback,
): Unsubscribe {
  const cleanId = fineId.trim();
  if (!cleanId) {
    cb(null);
    return () => undefined;
  }

  return onSnapshot(
    fineRef(cleanId),
    (snap) => cb(withId<FineDoc>(snap)),
    (error) => onError(toError(error)),
  );
}

export function subscribeMyPaymentTransactions(
  uid: string,
  cb: (txs: PaymentTransactionDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  let activeUid: string;
  try {
    activeUid = uid || requireUid();
  } catch (error) {
    onError(toError(error));
    return () => undefined;
  }

  return onSnapshot(
    query(transactionsCol(), where('praktikanUid', '==', activeUid)),
    (snap) => cb(sortTransactionsDesc(snap.docs.map(toTransaction))),
    (error) => onError(toError(error)),
  );
}

export function subscribeTransactionsByFine(
  fineId: string,
  uid: string,
  cb: (txs: PaymentTransactionDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  const cleanId = fineId.trim();
  if (!cleanId) {
    cb([]);
    return () => undefined;
  }

  let activeUid: string;
  try {
    activeUid = uid || requireUid();
  } catch (error) {
    onError(toError(error));
    return () => undefined;
  }

  // Filter praktikanUid wajib disertakan agar memenuhi validasi statis Security Rules.
  return onSnapshot(
    query(
      transactionsCol(),
      where('praktikanUid', '==', activeUid),
      where('fineId', '==', cleanId),
    ),
    (snap) => cb(sortTransactionsDesc(snap.docs.map(toTransaction))),
    (error) => onError(toError(error)),
  );
}

function getPaymentApiBaseUrl(): string {
  const raw = (process.env.EXPO_PUBLIC_PAYMENT_API_URL ?? '').trim().replace(/\/+$/, '');
  if (!raw) {
    throw new Error('URL server pembayaran belum dikonfigurasi. Hubungi PM.');
  }
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error('URL server pembayaran tidak valid. Hubungi PM.');
  }
  return raw;
}

function extractApiError(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as { error?: unknown; message?: unknown };
    if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
    if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
  }
  switch (status) {
    case 401:
      return 'Sesi autentikasi tidak valid. Silakan masuk ulang lalu coba lagi.';
    case 403:
      return 'Anda tidak memiliki akses untuk transaksi ini.';
    case 404:
      return 'Data tagihan atau transaksi tidak ditemukan di server.';
    case 409:
      return 'Tagihan ini sudah dibayar lunas.';
    default:
      return `Gagal menghubungi server pembayaran (kode ${status}).`;
  }
}

async function postPaymentApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const baseUrl = getPaymentApiBaseUrl();
  const currentUser = firebaseAuth().currentUser;
  if (!currentUser) {
    throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.');
  }

  const idToken = await currentUser.getIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Koneksi ke server pembayaran melebihi batas waktu. Coba lagi.');
    }
    throw new Error('Tidak dapat terhubung ke server pembayaran. Periksa koneksi internet Anda.');
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(extractApiError(parsed, response.status));
  }

  return parsed as T;
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === 'pending' || value === 'success' || value === 'failed';
}

function isFineStatus(value: unknown): value is FineStatus {
  return value === 'UNPAID' || value === 'PAID';
}

export async function createPaymentTransaction(fineId: string): Promise<CreatePaymentResult> {
  const cleanFineId = fineId.trim();
  if (!cleanFineId) {
    throw new Error('ID tagihan denda tidak valid.');
  }

  const data = await postPaymentApi<Partial<CreatePaymentResult>>('/api/payments/create', {
    fineId: cleanFineId,
  });

  if (
    typeof data.orderId !== 'string' ||
    !data.orderId.trim() ||
    typeof data.redirectUrl !== 'string' ||
    !data.redirectUrl.trim()
  ) {
    throw new Error('Respons server pembayaran tidak lengkap. Coba lagi.');
  }

  return {
    orderId: data.orderId.trim(),
    snapToken: typeof data.snapToken === 'string' ? data.snapToken : '',
    redirectUrl: data.redirectUrl.trim(),
    amount: typeof data.amount === 'number' ? data.amount : 0,
    status: isPaymentStatus(data.status) ? data.status : 'pending',
  };
}

export async function syncPaymentStatus(orderId: string): Promise<SyncPaymentResult> {
  const cleanOrderId = orderId.trim();
  if (!cleanOrderId) {
    throw new Error('ID transaksi pembayaran tidak ditemukan.');
  }

  const data = await postPaymentApi<{
    status?: unknown;
    fineStatus?: unknown;
  }>('/api/payments/sync', { orderId: cleanOrderId });

  if (!isPaymentStatus(data.status) || !isFineStatus(data.fineStatus)) {
    throw new Error('Respons sinkronisasi status pembayaran tidak valid.');
  }

  return {
    status: data.status,
    fineStatus: data.fineStatus,
  };
}
