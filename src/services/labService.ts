import { collection, doc, getDoc, onSnapshot } from '@react-native-firebase/firestore';

import { COLLECTIONS, type ErrorCallback, type LabDoc, type Unsubscribe } from '@/types/firebase';

import { firestore, toError, withId } from './firebase';

export interface LabInput {
  nama: string;
  gedung: string;
  deskripsi?: string;
  latitude: number;
  longitude: number;
  radiusMeter: number;
}

const labsCol = () => collection(firestore(), COLLECTIONS.labs);
const labRef = (labId: string) => doc(firestore(), COLLECTIONS.labs, labId);

function toLab(snap: { id: string; data(): unknown }): LabDoc {
  return { ...(snap.data() as Omit<LabDoc, 'id'>), id: snap.id };
}

/** Listener real-time daftar laboratorium, diurutkan berdasarkan nama. */
export function subscribeLabs(
  callback: (labs: LabDoc[]) => void,
  onError: ErrorCallback,
): Unsubscribe {
  return onSnapshot(
    labsCol(),
    (snap) => callback(snap.docs.map(toLab).sort((a, b) => a.nama.localeCompare(b.nama))),
    (error) => onError(toError(error)),
  );
}

/** Mengambil satu dokumen laboratorium berdasarkan ID, atau null bila tidak ditemukan. */
export async function getLab(labId: string): Promise<LabDoc | null> {
  const cleanId = labId.trim();
  if (!cleanId) return null;
  const snap = await getDoc(labRef(cleanId));
  return withId<LabDoc>(snap);
}
