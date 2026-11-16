/**
 * Satu-satunya titik akses instance Firebase. Service dan context lain mengimpor dari sini
 * (jangan memanggil getAuth/getFirestore atau membuat app tandingan di tempat lain).
 * Memakai API modular React Native Firebase.
 */
import { getAuth } from '@react-native-firebase/auth';
import {
  doc,
  getFirestore,
  onSnapshot,
  query,
  writeBatch,
  type DocumentSnapshot,
} from '@react-native-firebase/firestore';

import { COLLECTIONS, type ErrorCallback, type Unsubscribe } from '@/types/firebase';

export const firebaseAuth = () => getAuth();
export const firestore = () => getFirestore();

export type FirestoreQuery = ReturnType<typeof query>;
export type FirestoreDocRef = ReturnType<typeof doc>;

/** UID pengguna yang sedang login; melempar bila belum login. Jangan terima UID dari input/route. */
export function requireUid(): string {
  const uid = getAuth().currentUser?.uid;
  if (!uid) {
    throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.');
  }
  return uid;
}

export const userRef = (uid: string) => doc(getFirestore(), COLLECTIONS.users, uid);

/** Menggabungkan id dokumen ke dalam data. Mengembalikan null bila dokumen tidak ada. */
export function withId<T extends { id: string }>(snap: DocumentSnapshot): T | null {
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<T, 'id'>), id: snap.id } as T;
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

const BATCH_DELETE_LIMIT = 450;

/** Menghapus banyak referensi dokumen secara bertahap agar aman dari batas 500 operasi batch Firestore. */
export async function commitBatchDeletes(refs: FirestoreDocRef[]): Promise<void> {
  if (refs.length === 0) return;
  for (let i = 0; i < refs.length; i += BATCH_DELETE_LIMIT) {
    const chunk = refs.slice(i, i + BATCH_DELETE_LIMIT);
    const batch = writeBatch(firestore());
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/**
 * Fan-out listener per classId dari query akar (mis. classMembers atau classes milik asisten).
 * Emit dilakukan hanya setelah seluruh listener kelas mengirim snapshot pertama agar UI tidak
 * menampilkan daftar kosong palsu saat data masih berdatangan.
 */
export function subscribePerClassQuery<T>(options: {
  rootQuery: FirestoreQuery;
  extractClassId: (docSnap: { id: string; data(): Record<string, unknown> }) => string;
  buildClassQuery: (classId: string) => FirestoreQuery;
  mapDoc: (docSnap: { id: string; data(): unknown }) => T;
  sortItems: (items: T[]) => T[];
  callback: (items: T[]) => void;
  onError: ErrorCallback;
}): Unsubscribe {
  const { rootQuery, extractClassId, buildClassQuery, mapDoc, sortItems, callback, onError } = options;
  let cancelled = false;
  const perClass = new Map<string, Unsubscribe>();
  const results = new Map<string, T[]>();
  const delivered = new Set<string>();

  const emit = () => {
    if (cancelled) return;
    for (const classId of perClass.keys()) {
      if (!delivered.has(classId)) return;
    }
    callback(sortItems([...results.values()].flat()));
  };

  const stopRoot = onSnapshot(
    rootQuery,
    (rootSnap) => {
      if (cancelled) return;
      const classIds = new Set(
        rootSnap.docs
          .map((d) => extractClassId({ id: d.id, data: () => d.data() as Record<string, unknown> }))
          .filter(Boolean),
      );

      for (const [classId, unsub] of perClass) {
        if (!classIds.has(classId)) {
          unsub();
          perClass.delete(classId);
          results.delete(classId);
          delivered.delete(classId);
        }
      }

      classIds.forEach((classId) => {
        if (perClass.has(classId)) return;
        perClass.set(
          classId,
          onSnapshot(
            buildClassQuery(classId),
            (snap) => {
              results.set(classId, snap.docs.map(mapDoc));
              delivered.add(classId);
              emit();
            },
            (error) => onError(toError(error)),
          ),
        );
      });

      emit();
    },
    (error) => onError(toError(error)),
  );

  return () => {
    cancelled = true;
    stopRoot();
    perClass.forEach((unsub) => unsub());
    perClass.clear();
    results.clear();
    delivered.clear();
  };
}
