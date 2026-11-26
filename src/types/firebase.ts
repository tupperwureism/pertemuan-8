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

export type UserRole = 'praktikan' | 'asisten' | 'aslab';
export type SessionStatus = 'BELUM_DIBUKA' | 'DIBUKA' | 'DITUTUP';
export type PermissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AiStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';
export type AttendanceTimeliness = 'TEPAT_WAKTU' | 'TERLAMBAT';
export type FineStatus = 'UNPAID' | 'PAID';
export type PaymentStatus = 'pending' | 'success' | 'failed';

// ------------------------------------------------------------- Koleksi

export const COLLECTIONS = {
  users: 'users',
  classes: 'classes',
  classMembers: 'classMembers',
  sessions: 'sessions',
  attendances: 'attendances',
  permissions: 'permissions',
  labs: 'labs',
  labMembers: 'labMembers',
  fines: 'fines',
  paymentTransactions: 'paymentTransactions',
  pushTokens: 'pushTokens',
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
  labId?: string | null;
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
  labId?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  distanceMeter?: number;
  timeliness?: AttendanceTimeliness;
  lateMinutes?: number;
  gracePeriodMinutes?: number;
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

/** labs/{labId} - auto ID. Dibaca semua user login; ditulis asisten. */
export interface LabDoc {
  id: string;
  nama: string;
  gedung: string;
  deskripsi: string;
  latitude: number;
  longitude: number;
  radiusMeter: number;
  cosLat: number;
  mataKuliah?: string;
  classId?: string | null;
  gracePeriodMinutes?: number;
  fineAmount?: number;
  asprakIds?: string[];
  aslabIds?: string[];
  createdBy: string;
  createdAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

/** labMembers/{labId_uid} - penugasan pengguna pada satu laboratorium. */
export interface LabMemberDoc {
  id: string;
  labId: string;
  uid: string;
  role: UserRole;
  nama: string;
  nomorInduk: string;
  email: string;
  assignedBy: string;
  assignedAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

/** fines/{sessionId_uid} - satu denda keterlambatan per praktikan dan sesi. */
export interface FineDoc {
  id: string;
  attendanceId: string;
  sessionId: string;
  classId: string;
  labId: string | null;
  sessionTitle: string;
  labName: string;
  praktikanUid: string;
  amount: number;
  lateMinutes: number;
  status: FineStatus;
  latestOrderId: string | null;
  latestPaymentStatus: PaymentStatus | null;
  issuedAt: ServerTimestamp;
  paidAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

/** paymentTransactions/{orderId} - mirror transaksi pembayaran dari backend. */
export interface PaymentTransactionDoc {
  id: string;
  orderId: string;
  fineId: string;
  sessionId: string;
  sessionTitle: string;
  labName: string;
  praktikanUid: string;
  amount: number;
  status: PaymentStatus;
  paymentType: string | null;
  midtransTransactionId: string | null;
  midtransTransactionStatus: string | null;
  snapToken: string;
  redirectUrl: string;
  fineIssuedAt: ServerTimestamp;
  createdAt: ServerTimestamp;
  settledAt: ServerTimestamp;
  updatedAt: ServerTimestamp;
}

/** pushTokens/{uid} - ID = UID. Token Expo push milik perangkat terakhir user itu. */
export interface PushTokenDoc {
  id: string;
  uid: string;
  token: string;
  platform: 'android' | 'ios';
  updatedAt: ServerTimestamp;
}

// ------------------------------------------------------- ID deterministik

export const classMemberId = (classId: string, uid: string): string => `${classId}_${uid}`;
export const labMemberId = (labId: string, uid: string): string => `${labId}_${uid}`;
export const attendanceId = (sessionId: string, uid: string): string => `${sessionId}_${uid}`;
export const fineId = (sessionId: string, uid: string): string => `${sessionId}_${uid}`;
export const permissionId = (sessionId: string, uid: string): string => `${sessionId}_${uid}`;

// ------------------------------------------------------- Callback service

export type Unsubscribe = () => void;
export type ErrorCallback = (error: Error) => void;
