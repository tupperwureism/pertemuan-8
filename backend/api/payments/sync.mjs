import { adminAuth, adminDb } from '../../lib/firebaseAdmin.mjs';
import { getMidtransStatus } from '../../lib/midtrans.mjs';
import { applyPaymentStatus } from './webhook.mjs';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function bodyOf(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body ?? {};
}

async function authenticatedUser(req) {
  const match = req.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('Token autentikasi diperlukan.'), { status: 401 });
  try {
    return await adminAuth.verifyIdToken(match[1]);
  } catch {
    throw Object.assign(new Error('Token autentikasi tidak valid.'), { status: 401 });
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const decoded = await authenticatedUser(req);
    const orderId = bodyOf(req).orderId;
    if (typeof orderId !== 'string' || !orderId.trim() || orderId.length > 100) {
      return res.status(400).json({ error: 'orderId wajib diisi.' });
    }
    const transactionSnap = await adminDb
      .collection('paymentTransactions')
      .doc(orderId.trim())
      .get();
    if (!transactionSnap.exists) {
      return res.status(404).json({ error: 'Transaksi pembayaran tidak ditemukan.' });
    }
    const payment = transactionSnap.data();
    if (payment.praktikanUid !== decoded.uid) {
      return res.status(403).json({ error: 'Transaksi bukan milik pengguna aktif.' });
    }

    const midtransPayload = await getMidtransStatus(orderId.trim());
    const result = await applyPaymentStatus(orderId.trim(), midtransPayload);
    return res.status(200).json({
      orderId: orderId.trim(),
      fineId: result.fineId,
      status: result.status,
      fineStatus: result.fineStatus,
    });
  } catch (error) {
    console.error('[payments/sync]', error);
    return res.status(error.status ?? 500).json({
      error: error.status ? error.message : 'Gagal menyinkronkan status pembayaran.',
    });
  }
}
