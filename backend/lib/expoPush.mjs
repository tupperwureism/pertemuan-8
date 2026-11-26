import { adminDb } from './firebaseAdmin.mjs';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendExpoPush(uid, { title, body, data }) {
  try {
    const tokenSnap = await adminDb.collection('pushTokens').doc(uid).get();
    const token = tokenSnap.data()?.token;
    if (typeof token !== 'string' || !token.trim()) return;

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        priority: 'high',
        sound: 'default',
        channelId: 'default',
      }),
    });
    if (!response.ok) {
      console.warn(`[expoPush] HTTP ${response.status}: ${await response.text()}`);
      return;
    }
    const result = await response.json().catch(() => null);
    if (result?.data?.status === 'error') {
      console.warn('[expoPush] Push ditolak Expo:', result.data.message ?? result.data.details);
    }
  } catch (error) {
    console.warn('[expoPush] Gagal mengirim push:', error);
  }
}
