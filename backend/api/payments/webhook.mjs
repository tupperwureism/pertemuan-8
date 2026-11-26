import { adminDb, FieldValue } from '../../lib/firebaseAdmin.mjs';
import { sendExpoPush } from '../../lib/expoPush.mjs';
import { mapMidtransStatus, verifyMidtransSignature } from '../../lib/midtrans.mjs';

function bodyOf(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body ?? {};
}

export async function applyPaymentStatus(orderId, payload) {
  const transactionRef = adminDb.collection('paymentTransactions').doc(orderId);
  const mappedStatus = mapMidtransStatus(payload.transaction_status, payload.fraud_status);

  const result = await adminDb.runTransaction(async (transaction) => {
    const transactionSnap = await transaction.get(transactionRef);
    if (!transactionSnap.exists) {
      throw Object.assign(new Error('Transaksi pembayaran tidak ditemukan.'), { status: 404 });
    }
    const payment = transactionSnap.data();
    const fineRef = adminDb.collection('fines').doc(payment.fineId);
    const fineSnap = await transaction.get(fineRef);
    if (!fineSnap.exists) {
      throw Object.assign(new Error('Tagihan transaksi tidak ditemukan.'), { status: 404 });
    }
    const fine = fineSnap.data();

    // Status sukses/PAID bersifat final: webhook duplikat atau kedaluwarsa tidak boleh menurunkannya.
    if (payment.status === 'success' || fine.status === 'PAID') {
      return {
        status: payment.status,
        fineStatus: fine.status,
        fineId: payment.fineId,
        sessionId: payment.sessionId,
        praktikanUid: payment.praktikanUid,
        shouldNotify: false,
      };
    }

    const changed = payment.status !== mappedStatus;
    const paymentUpdate = {
      status: mappedStatus,
      paymentType: payload.payment_type ?? null,
      midtransTransactionId: payload.transaction_id ?? null,
      midtransTransactionStatus: payload.transaction_status ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      ...(mappedStatus === 'success' ? { settledAt: FieldValue.serverTimestamp() } : {}),
    };
    transaction.update(transactionRef, paymentUpdate);

    const fineUpdate = {
      latestOrderId: orderId,
      latestPaymentStatus: mappedStatus,
      updatedAt: FieldValue.serverTimestamp(),
      ...(mappedStatus === 'success'
        ? { status: 'PAID', paidAt: FieldValue.serverTimestamp() }
        : {}),
    };
    transaction.update(fineRef, fineUpdate);

    return {
      status: mappedStatus,
      fineStatus: mappedStatus === 'success' ? 'PAID' : fine.status,
      fineId: payment.fineId,
      sessionId: payment.sessionId,
      praktikanUid: payment.praktikanUid,
      shouldNotify: changed,
    };
  });

  if (result.shouldNotify) {
    const success = result.status === 'success';
    await sendExpoPush(result.praktikanUid, {
      title: success ? 'Pembayaran Denda Berhasil' : 'Pembayaran Denda Belum Selesai',
      body: success
        ? 'Pembayaran Anda telah diverifikasi. Tagihan sekarang berstatus lunas.'
        : 'Pembayaran gagal atau belum diselesaikan. Silakan periksa dan coba kembali.',
      data: {
        type: success ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED',
        fineId: result.fineId,
        orderId,
        sessionId: result.sessionId,
      },
    });
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const payload = bodyOf(req);
    if (!verifyMidtransSignature(payload)) {
      return res.status(403).json({ error: 'Signature webhook tidak valid.' });
    }
    const orderId = payload.order_id;
    const result = await applyPaymentStatus(orderId, payload);
    return res.status(200).json({ ok: true, orderId, status: result.status });
  } catch (error) {
    console.error('[payments/webhook]', error);
    return res.status(error.status ?? 500).json({
      error: error.status ? error.message : 'Gagal memproses webhook pembayaran.',
    });
  }
}
