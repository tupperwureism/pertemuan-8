/**
 * Kontrak data Firestore Sprint 2 (dibekukan setelah bootstrap, milik Programmer 1).
 * Programmer 2 memakai tipe ini apa adanya dan tidak membuat kontrak tandingan.
 */
import type { Timestamp } from '@react-native-firebase/firestore';

export type FirestoreTimestamp = Timestamp;

/**
 * Field timestamp yang ditulis dengan serverTimestamp() bernilai `null` pada
 * snapshot lokal sebelum server mengonfirmasi (pending write).
 */
export type ServerTimestamp = FirestoreTimestamp | null;

// ---------------------------------------------------------------- Enum

export type UserRole = 'praktikan' | 'asisten';
export type SessionStatus = 'BELUM_DIBUKA' | 'DIBUKA' | 'DITUTUP';
export type PermissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AiStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

// ------------------------------------------------------------- Koleksi

export const COLLECTIONS = {
  users: 'users',
  classes: 'classes',
  classMembers: 'classMembers',
  sessions: 'sessions',
  attendances: 'attendances',
  permissions: 'permissions',
} as const;

/** users/{uid} - ID dokumen = UID Firebase Auth. */
export interface UserDoc {
  id: string;
  uid: string;
  email: string;
  nama: string;
  nomorInduk: string;
  role: UserRole;
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

/** classes/{classId} - auto ID. */
export interface ClassDoc {
  id: string;
  nama: string;
  mataPraktikum: string;
  kodeKelas: string;
  assistantIds: string[];
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

/** classMembers/{classId_uid} - ID deterministik. */
export interface ClassMemberDoc {
  id: string;
  classId: string;
  uid: string;
  role: UserRole;
  joinedAt: ServerTimestamp;
}

/** sessions/{sessionId} - auto ID. */
export interface SessionDoc {
  id: string;
  classId: string;
  judul: string;
  ruangan: string;
  startsAt: FirestoreTimestamp;
  endsAt: FirestoreTimestamp;
  status: SessionStatus;
  catatan: string;
  createdBy: string;
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

/** attendances/{sessionId_uid} - ID deterministik, create sekali, tanpa update/delete oleh praktikan. */
export interface AttendanceDoc {
  id: string;
  sessionId: string;
  classId: string;
  praktikanUid: string;
  attendedAt: ServerTimestamp;
  catatan?: string;
}

/** permissions/{sessionId_uid} - ID deterministik. */
export interface PermissionDoc {
  id: string;
  sessionId: string;
  classId: string;
  praktikanUid: string;
  alasan: string;
  aiStatus: AiStatus;
  aiLabel: string | null;
  aiConfidence: number | null;
  status: PermissionStatus;
  reviewedBy: string | null;
  reviewedAt: ServerTimestamp;
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

// ------------------------------------------------------- ID deterministik

export const classMemberId = (classId: string, uid: string): string => `${classId}_${uid}`;
export const attendanceId = (sessionId: string, uid: string): string => `${sessionId}_${uid}`;
export const permissionId = (sessionId: string, uid: string): string => `${sessionId}_${uid}`;

// ------------------------------------------------------- Callback service

export type Unsubscribe = () => void;
export type ErrorCallback = (error: Error) => void;
