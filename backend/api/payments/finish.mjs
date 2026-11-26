export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed.');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
  );
  return res.status(200).send(`<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pembayaran Selesai</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 32px; text-align: center; color: #0f172a; }
      .card { max-width: 480px; margin: 15vh auto 0; padding: 28px; border: 1px solid #e2e8f0; border-radius: 18px; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Proses pembayaran selesai</h1>
      <p>Kembali ke aplikasi untuk melihat status pembayaran yang telah diverifikasi.</p>
    </main>
    <script>
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'SNAP_FINISHED' }));
    </script>
  </body>
</html>`);
}
