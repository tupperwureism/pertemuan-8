# Backend Pembayaran Sprint 4

Backend serverless untuk Midtrans Sandbox, Firebase Admin, Expo Push, dan template CSV. Secret hanya disimpan sebagai environment variable di Vercel, tidak pernah di aplikasi React Native.

## Deploy ke Vercel

1. Import repository ke Vercel dan atur **Root Directory** menjadi `backend`.
2. Tambahkan env `MIDTRANS_SERVER_KEY` dari Midtrans Sandbox.
3. Tambahkan env `FIREBASE_SERVICE_ACCOUNT_JSON` berupa isi JSON service account dalam satu baris.
4. Tambahkan env `PUBLIC_BASE_URL` dengan URL deployment tanpa trailing slash, lalu deploy.
5. Atur Payment Notification URL Midtrans Sandbox ke `https://<domain>/api/payments/webhook`.

Setelah deployment, bagikan URL yang sama kepada tim sebagai `EXPO_PUBLIC_PAYMENT_API_URL`. Jangan commit `.env`, service account JSON, atau server key.

## Endpoint

- `POST /api/payments/create` — membuat transaksi Snap milik pengguna login.
- `POST /api/payments/webhook` — menerima status Midtrans dengan validasi SHA-512.
- `POST /api/payments/sync` — memeriksa status langsung ke Midtrans untuk pemilik transaksi.
- `GET /api/payments/finish` — callback WebView setelah proses Snap.
- `GET /api/templates?type=labs|praktikan|asprak` — mengunduh template CSV.
