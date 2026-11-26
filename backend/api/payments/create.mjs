import crypto from 'node:crypto';

import { adminAuth, adminDb, FieldValue } from '../../lib/firebaseAdmin.mjs';
import { createSnapTransaction } from '../../lib/midtrans.mjs';

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
    const fineId = bodyOf(req).fineId;
    if (typeof fineId !== 'string' || !fineId.trim() || fineId.length > 200) {
      return res.status(400).json({ error: 'fineId wajib diisi.' });
    }

    const fineRef = adminDb.collection('fines').doc(fineId.trim());
    const fineSnap = await fineRef.get();
    if (!fineSnap.exists) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' });
    const fine = fineSnap.data();
    if (fine.praktikanUid !== decoded.uid) {
      return res.status(403).json({ error: 'Tagihan bukan milik pengguna aktif.' });
    }
    if (fine.status === 'PAID') {
      return res.status(409).json({ error: 'Tagihan sudah lunas.' });
    }
    if (!Number.isFinite(fine.amount) || fine.amount <= 0) {
      return res.status(422).json({ error: 'Nominal tagihan tidak valid.' });
    }

    const publicBaseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
    if (!publicBaseUrl) throw new Error('PUBLIC_BASE_URL belum dikonfigurasi.');
    const orderId = `FINE-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`.slice(0, 50);
    const profileSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const profile = profileSnap.data() ?? {};
    const finishUrl = `${publicBaseUrl}/api/payments/finish?orderId=${encodeURIComponent(orderId)}`;
    const snap = await createSnapTransaction({
      orderId,
      amount: fine.amount,
      fineId: fineId.trim(),
      sessionTitle: fine.sessionTitle,
      customerName: profile.nama ?? decoded.name,
      customerEmail: profile.email ?? decoded.email,
      finishUrl,
    });

    const transactionRef = adminDb.collection('paymentTransactions').doc(orderId);
    await adminDb.runTransaction(async (transaction) => {
      const latestFineSnap = await transaction.get(fineRef);
      if (!latestFineSnap.exists) {
        throw Object.assign(new Error('Tagihan tidak ditemukan.'), { status: 404 });
      }
      const latestFine = latestFineSnap.data();
      if (latestFine.praktikanUid !== decoded.uid) {
        throw Object.assign(new Error('Tagihan bukan milik pengguna aktif.'), { status: 403 });
      }
      if (latestFine.status === 'PAID') {
        throw Object.assign(new Error('Tagihan sudah lunas.'), { status: 409 });
      }

      transaction.set(transactionRef, {
        orderId,
        fineId: fineId.trim(),
        sessionId: latestFine.sessionId,
        sessionTitle: latestFine.sessionTitle,
        labName: latestFine.labName,
        praktikanUid: decoded.uid,
        amount: latestFine.amount,
        status: 'pending',
        paymentType: null,
        midtransTransactionId: null,
        midtransTransactionStatus: null,
        snapToken: snap.snapToken,
        redirectUrl: snap.redirectUrl,
        fineIssuedAt: latestFine.issuedAt ?? null,
        createdAt: FieldValue.serverTimestamp(),
        settledAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(fineRef, {
        latestOrderId: orderId,
        latestPaymentStatus: 'pending',
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({
      orderId,
      snapToken: snap.snapToken,
      redirectUrl: snap.redirectUrl,
      amount: fine.amount,
      status: 'pending',
    });
  } catch (error) {
    console.error('[payments/create]', error);
    return res.status(error.status ?? 500).json({
      error: error.status ? error.message : 'Gagal membuat transaksi pembayaran.',
    });
  }
}
