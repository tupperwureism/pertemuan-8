import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from '@react-native-firebase/firestore';

import { cosLatitude } from '@/lib/geo';
import { COLLECTIONS, type ErrorCallback, type LabDoc, type Unsubscribe } from '@/types/firebase';

import { firestore, requireUid, toError, withId } from './firebase';

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

function validateLabInput(input: LabInput) {
  const nama = input.nama.trim();
  const gedung = input.gedung.trim();
  const deskripsi = (input.deskripsi ?? '').trim();
  const { latitude, longitude, radiusMeter } = input;

  if (!nama) {
    throw new Error('Nama laboratorium wajib diisi.');
  }
  if (nama.length > 100) {
    throw new Error('Nama laboratorium maksimal 100 karakter.');
  }
  if (!gedung) {
    throw new Error('Nama gedung wajib diisi.');
  }
  if (gedung.length > 100) {
    throw new Error('Nama gedung maksimal 100 karakter.');
  }
  if (deskripsi.length > 500) {
    throw new Error('Deskripsi laboratorium maksimal 500 karakter.');
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Latitude harus berupa angka antara -90 sampai 90.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Longitude harus berupa angka antara -180 sampai 180.');
  }
  if (!Number.isFinite(radiusMeter) || radiusMeter < 10 || radiusMeter > 1000) {
    throw new Error('Radius laboratorium harus antara 10 sampai 1000 meter.');
  }

  const cosLat = cosLatitude(latitude);
  if (!Number.isFinite(cosLat) || cosLat <= 0 || cosLat > 1) {
    throw new Error('Koordinat latitude tidak valid.');
  }

  return {
    nama,
    gedung,
    deskripsi,
    latitude,
    longitude,
    radiusMeter,
    cosLat,
  };
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

/** Membuat dokumen laboratorium baru (khusus asisten). */
export async function createLab(input: LabInput): Promise<string> {
  const uid = requireUid();
  const payload = validateLabInput(input);
  const ref = await addDoc(labsCol(), {
    ...payload,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Memperbarui data, koordinat, radius, dan cosLat laboratorium (khusus asisten). */
export async function updateLab(labId: string, input: LabInput): Promise<void> {
  requireUid();
  const cleanId = labId.trim();
  if (!cleanId) {
    throw new Error('ID laboratorium tidak valid.');
  }
  const payload = validateLabInput(input);
  await updateDoc(labRef(cleanId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

/** Menghapus dokumen laboratorium (khusus asisten). */
export async function deleteLab(labId: string): Promise<void> {
  requireUid();
  const cleanId = labId.trim();
  if (!cleanId) {
    throw new Error('ID laboratorium tidak valid.');
  }
  await deleteDoc(labRef(cleanId));
}
