import crypto from 'node:crypto';

const SNAP_URL = 'https://app.sandbox.midtrans.com/snap/v1/transactions';
const STATUS_BASE_URL = 'https://api.sandbox.midtrans.com/v2';

function serverKey() {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error('MIDTRANS_SERVER_KEY belum dikonfigurasi.');
  return key;
}

function authorizationHeader() {
  return `Basic ${Buffer.from(`${serverKey()}:`).toString('base64')}`;
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error_messages?.join?.(', ')
      ?? payload?.status_message
      ?? `Midtrans HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function createSnapTransaction({
  orderId,
  amount,
  fineId,
  sessionTitle,
  customerName,
  customerEmail,
  finishUrl,
}) {
  const itemName = `Denda ${sessionTitle || 'Praktikum'}`.slice(0, 50);
  const response = await fetch(SNAP_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: authorizationHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: amount },
      item_details: [{
        id: String(fineId).slice(0, 50),
        price: amount,
        quantity: 1,
        name: itemName,
      }],
      customer_details: {
        first_name: String(customerName || 'Praktikan').slice(0, 50),
        email: customerEmail || undefined,
      },
      callbacks: { finish: finishUrl },
    }),
  });
  const payload = await parseResponse(response);
  if (!payload?.token || !payload?.redirect_url) {
    throw new Error('Midtrans tidak mengembalikan token pembayaran yang lengkap.');
  }
  return { snapToken: payload.token, redirectUrl: payload.redirect_url };
}

export function verifyMidtransSignature({
  order_id: orderId,
  status_code: statusCode,
  gross_amount: grossAmount,
  signature_key: signatureKey,
}) {
  if (![orderId, statusCode, grossAmount, signatureKey].every((value) => typeof value === 'string')) {
    return false;
  }
  const expected = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey()}`)
    .digest('hex');
  const actualBuffer = Buffer.from(signatureKey, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function mapMidtransStatus(transactionStatus, fraudStatus) {
  if (transactionStatus === 'settlement') return 'success';
  if (transactionStatus === 'capture') {
    if (fraudStatus === 'challenge') return 'pending';
    return fraudStatus === 'deny' ? 'failed' : 'success';
  }
  if (
    ['deny', 'cancel', 'expire', 'failure', 'refund', 'partial_refund', 'chargeback']
      .includes(transactionStatus)
  ) {
    return 'failed';
  }
  return 'pending';
}

export async function getMidtransStatus(orderId) {
  const response = await fetch(`${STATUS_BASE_URL}/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: 'application/json', Authorization: authorizationHeader() },
  });
  return parseResponse(response);
}
