import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON belum dikonfigurasi.');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON bukan JSON yang valid.');
  }
}

const app = getApps()[0] ?? initializeApp({ credential: cert(readServiceAccount()) });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export { FieldValue };
