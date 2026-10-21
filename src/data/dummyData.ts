export type UserRole = 'praktikan' | 'asisten';
export type SessionStatus = 'BELUM_DIBUKA' | 'DIBUKA' | 'DITUTUP';

export interface UserProfile {
  id: string;
  nama: string;
  nomorInduk: string; // NIM Praktikan atau Kode Asisten
  role: UserRole;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  praktikanId: string;
  namaPraktikan: string;
  nim: string;
  waktuHadir: string; // contoh: "08:05 WIB"
  catatan?: string; // dari input Form saat presensi
}

export interface PraktikumSession {
  id: string;
  namaPraktikum: string;
  kelas: string;
  waktu: string;
  ruangan: string;
  status: SessionStatus;
  catatanAsisten?: string;
  daftarHadir: AttendanceRecord[];
}

export const DUMMY_USERS: UserProfile[] = [
  { id: 'ast-01', nama: 'Raka Pratama', nomorInduk: 'AST-01', role: 'asisten' },
  { id: 'prk-1', nama: 'Budi Santoso', nomorInduk: '2301001', role: 'praktikan' },
  { id: 'prk-2', nama: 'Siti Aminah', nomorInduk: '2301002', role: 'praktikan' }, // Belum pernah presensi (untuk uji Empty State)
];

export const DUMMY_SESSIONS: PraktikumSession[] = [
  {
    id: 'sesi-1',
    namaPraktikum: 'Pemrograman Bergerak - Modul 1 (React Native Dasar)',
    kelas: 'IF-A',
    waktu: 'Senin, 08:00 - 10:00 WIB',
    ruangan: 'Lab Mobile 1',
    status: 'DIBUKA',
    catatanAsisten: 'Silakan presensi maksimal 15 menit pertama.',
    daftarHadir: [
      {
        id: 'abs-1',
        sessionId: 'sesi-1',
        praktikanId: 'prk-99',
        namaPraktikan: 'Andi Wijaya',
        nim: '2301099',
        waktuHadir: '08:03 WIB',
        catatan: 'Hadir tepat waktu',
      },
    ],
  },
  {
    id: 'sesi-2',
    namaPraktikum: 'Pemrograman Bergerak - Modul 2 (Flexbox & State)',
    kelas: 'IF-A',
    waktu: 'Senin, 10:00 - 12:00 WIB',
    ruangan: 'Lab Mobile 1',
    status: 'BELUM_DIBUKA',
    catatanAsisten: '',
    daftarHadir: [], // Kosong untuk uji Empty State Rekap Asisten & Sesi Belum Dibuka
  },
  {
    id: 'sesi-3',
    namaPraktikum: 'Basis Data Lanjut - Modul 1',
    kelas: 'IF-B',
    waktu: 'Jumat, 13:00 - 15:00 WIB',
    ruangan: 'Lab Komputasi 2',
    status: 'DITUTUP',
    catatanAsisten: 'Sesi praktikum telah selesai.',
    daftarHadir: [
      {
        id: 'abs-2',
        sessionId: 'sesi-3',
        praktikanId: 'prk-1',
        namaPraktikan: 'Budi Santoso',
        nim: '2301001',
        waktuHadir: '13:02 WIB',
        catatan: 'Hadir',
      },
    ],
  },
];

