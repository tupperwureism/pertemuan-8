// Uji negatif/positif Security Rules (SRS-14). Dijalankan lewat Firestore Emulator:
//   npm run test:rules
// Membutuhkan Java 17+ dan mengunduh emulator saat pertama kali. Script di-pin ke firebase-tools 14.27.0
// karena firebase-tools 15 mewajibkan JDK 21; naikkan versinya bersama JDK bila tim sudah memakai JDK 21.
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-ppk-pertemuan-8';
const CLASS_ID = 'kelas1';
const OPEN_SESSION = 'sesiBuka';
const CLOSED_SESSION = 'sesiTutup';
const NEW_SESSION = 'sesiBaru';
const LAB_ID = 'lab1';
const LAB_SESSION = 'sesiLab';
const MISSING_LAB_SESSION = 'sesiLabHilang';
const LAB_LAT = -7.05;
const LAB_LNG = 110.44;
const LAB_RADIUS = 100;
const LAB_COS_LAT = Math.cos((LAB_LAT * Math.PI) / 180);

let env;

const asisten = () => env.authenticatedContext('ast1', { email: 'ast@x.id' }).firestore();
const asistenLain = () => env.authenticatedContext('ast2', { email: 'ast2@x.id' }).firestore();
const aslab = () => env.authenticatedContext('lab1', { email: 'lab@x.id' }).firestore();
const praktikanA = () => env.authenticatedContext('prkA', { email: 'a@x.id' }).firestore();
const praktikanB = () => env.authenticatedContext('prkB', { email: 'b@x.id' }).firestore();
const outsider = () => env.authenticatedContext('prkC', { email: 'c@x.id' }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const ts = (hours) => Timestamp.fromMillis(Date.UTC(2026, 10, 11, hours));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env.cleanup();
});

// Seed lewat jalur admin (rules dinonaktifkan) agar tiap tes mulai dari keadaan yang sama.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const profile = (uid, role, email) =>
      setDoc(doc(db, 'users', uid), {
        uid,
        email,
        nama: uid,
        nomorInduk: `NI-${uid}`,
        role,
        createdAt: ts(0),
        updatedAt: ts(0),
      });
    await profile('ast1', 'asisten', 'ast@x.id');
    await profile('ast2', 'asisten', 'ast2@x.id');
    await profile('lab1', 'aslab', 'lab@x.id');
    await profile('prkA', 'praktikan', 'a@x.id');
    await profile('prkB', 'praktikan', 'b@x.id');
    await profile('prkC', 'praktikan', 'c@x.id');

    await setDoc(doc(db, 'classes', CLASS_ID), {
      nama: 'IF-A',
      mataPraktikum: 'PPK',
      kodeKelas: 'IFA',
      assistantIds: ['ast1'],
      createdAt: ts(0),
      updatedAt: ts(0),
    });
    for (const uid of ['prkA', 'prkB']) {
      await setDoc(doc(db, 'classMembers', `${CLASS_ID}_${uid}`), {
        classId: CLASS_ID,
        uid,
        role: 'praktikan',
        joinedAt: ts(0),
      });
    }
    const session = (status) => ({
      classId: CLASS_ID,
      judul: 'Modul',
      ruangan: 'Lab 1',
      startsAt: ts(8),
      endsAt: ts(10),
      status,
      catatan: '',
      createdBy: 'ast1',
      createdAt: ts(0),
      updatedAt: ts(0),
    });
    await setDoc(doc(db, 'sessions', OPEN_SESSION), session('DIBUKA'));
    await setDoc(doc(db, 'sessions', CLOSED_SESSION), session('DITUTUP'));
    await setDoc(doc(db, 'labs', LAB_ID), {
      nama: 'Lab Mobile 1',
      gedung: 'Gedung Informatika Lt. 2',
      deskripsi: 'Lab uji Sprint 3',
      latitude: LAB_LAT,
      longitude: LAB_LNG,
      radiusMeter: LAB_RADIUS,
      cosLat: LAB_COS_LAT,
      createdBy: 'ast1',
      createdAt: ts(0),
      updatedAt: ts(0),
    });
    await setDoc(doc(db, 'sessions', LAB_SESSION), { ...session('DIBUKA'), labId: LAB_ID });
    await setDoc(doc(db, 'sessions', MISSING_LAB_SESSION), {
      ...session('DIBUKA'),
      labId: 'labTidakAda',
    });
    await setDoc(doc(db, 'pushTokens', 'prkA'), {
      uid: 'prkA',
      token: 'ExponentPushToken[prkA]',
      platform: 'android',
      updatedAt: ts(0),
    });
    await setDoc(doc(db, 'permissions', `${OPEN_SESSION}_prkA`), {
      sessionId: OPEN_SESSION,
      classId: CLASS_ID,
      praktikanUid: 'prkA',
      alasan: 'Sakit',
      aiStatus: 'PENDING',
      aiLabel: null,
      aiConfidence: null,
      status: 'PENDING',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: ts(0),
      updatedAt: ts(0),
    });
  });
});

const newProfile = (uid, email, role = 'praktikan') => ({
  uid,
  email,
  nama: 'Nama',
  nomorInduk: '2301001',
  role,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

describe('tanpa login', () => {
  it('menolak baca data aplikasi', async () => {
    await assertFails(getDoc(doc(anon(), 'sessions', OPEN_SESSION)));
    await assertFails(getDoc(doc(anon(), 'users', 'prkA')));
    await assertFails(getDocs(collection(anon(), 'classes')));
  });
  it('menolak tulis', async () => {
    await assertFails(setDoc(doc(anon(), 'users', 'x'), newProfile('x', 'x@x.id')));
  });
});

describe('users & role', () => {
  it('registrasi sebagai praktikan berhasil', async () => {
    const db = env.authenticatedContext('prkN', { email: 'n@x.id' }).firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'prkN'), newProfile('prkN', 'n@x.id')));
  });
  it('registrasi dengan role asisten ditolak', async () => {
    const db = env.authenticatedContext('prkN', { email: 'n@x.id' }).firestore();
    await assertFails(setDoc(doc(db, 'users', 'prkN'), newProfile('prkN', 'n@x.id', 'asisten')));
  });
  it('tidak bisa membuat profil atas UID orang lain', async () => {
    const db = env.authenticatedContext('prkN', { email: 'n@x.id' }).firestore();
    await assertFails(setDoc(doc(db, 'users', 'orangLain'), newProfile('orangLain', 'n@x.id')));
  });
  it('praktikan tidak bisa menaikkan role dirinya', async () => {
    await assertFails(updateDoc(doc(praktikanA(), 'users', 'prkA'), { role: 'asisten', updatedAt: serverTimestamp() }));
  });
  it('praktikan boleh ubah nama sendiri', async () => {
    await assertSucceeds(updateDoc(doc(praktikanA(), 'users', 'prkA'), { nama: 'Baru', updatedAt: serverTimestamp() }));
  });
  it('praktikan tidak bisa membaca profil praktikan lain, asisten bisa', async () => {
    await assertFails(getDoc(doc(praktikanA(), 'users', 'prkB')));
    await assertSucceeds(getDoc(doc(asisten(), 'users', 'prkB')));
  });
});

describe('sesi & kelas', () => {
  it('anggota kelas membaca sesi kelasnya; non-anggota ditolak', async () => {
    await assertSucceeds(getDoc(doc(praktikanA(), 'sessions', OPEN_SESSION)));
    await assertFails(getDoc(doc(outsider(), 'sessions', OPEN_SESSION)));
  });
  it('query sesi per kelas oleh anggota berhasil, non-anggota ditolak', async () => {
    const q = (db) => query(collection(db, 'sessions'), where('classId', '==', CLASS_ID));
    await assertSucceeds(getDocs(q(praktikanA())));
    await assertFails(getDocs(q(outsider())));
  });
  it('praktikan tidak bisa membuka/menutup/menghapus sesi atau membuat kelas', async () => {
    await assertFails(updateDoc(doc(praktikanA(), 'sessions', OPEN_SESSION), { status: 'DITUTUP', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(praktikanA(), 'sessions', OPEN_SESSION)));
    await assertFails(setDoc(doc(praktikanA(), 'classes', 'k2'), {
      nama: 'X', mataPraktikum: 'X', kodeKelas: 'X', assistantIds: ['prkA'],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });
  it('asisten membuat sesi BELUM_DIBUKA lalu membuka dan menutupnya', async () => {
    const ref = doc(asisten(), 'sessions', NEW_SESSION);
    await assertSucceeds(setDoc(ref, {
      classId: CLASS_ID, judul: 'Baru', ruangan: 'Lab', startsAt: ts(12), endsAt: ts(14),
      status: 'BELUM_DIBUKA', catatan: '', createdBy: 'ast1',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(ref, { status: 'DIBUKA', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { status: 'DITUTUP', updatedAt: serverTimestamp() }));
  });
  it('status sesi tidak boleh mundur atau melompat', async () => {
    await assertFails(updateDoc(doc(asisten(), 'sessions', CLOSED_SESSION), { status: 'DIBUKA', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asisten(), 'sessions', OPEN_SESSION), { status: 'BELUM_DIBUKA', updatedAt: serverTimestamp() }));
  });
  it('asisten lain di luar assistantIds tidak dapat membaca atau mengubah kelas/sesi', async () => {
    await assertFails(getDoc(doc(asistenLain(), 'classes', CLASS_ID)));
    await assertFails(updateDoc(doc(asistenLain(), 'sessions', OPEN_SESSION), { status: 'DITUTUP', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(asistenLain(), 'sessions', OPEN_SESSION)));
  });
});

describe('presensi', () => {
  const attendance = (sessionId, uid) => ({
    sessionId, classId: CLASS_ID, praktikanUid: uid, attendedAt: serverTimestamp(), catatan: 'Hadir',
  });

  it('praktikan anggota presensi atas UID sendiri saat sesi DIBUKA', async () => {
    await assertSucceeds(setDoc(doc(praktikanB(), 'attendances', `${OPEN_SESSION}_prkB`), attendance(OPEN_SESSION, 'prkB')));
  });
  it('praktikan dengan izin PENDING atau APPROVED tidak dapat presensi pada sesi yang sama', async () => {
    await assertFails(setDoc(doc(praktikanA(), 'attendances', `${OPEN_SESSION}_prkA`), attendance(OPEN_SESSION, 'prkA')));
    await updateDoc(doc(asisten(), 'permissions', `${OPEN_SESSION}_prkA`), {
      status: 'APPROVED', reviewedBy: 'ast1', reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await assertFails(setDoc(doc(praktikanA(), 'attendances', `${OPEN_SESSION}_prkA`), attendance(OPEN_SESSION, 'prkA')));
  });
  it('praktikan yang izinnya REJECTED tetap dapat presensi saat sesi masih DIBUKA', async () => {
    await updateDoc(doc(asisten(), 'permissions', `${OPEN_SESSION}_prkA`), {
      status: 'REJECTED', reviewedBy: 'ast1', reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(praktikanA(), 'attendances', `${OPEN_SESSION}_prkA`), attendance(OPEN_SESSION, 'prkA')));
  });
  it('presensi kedua pada dokumen yang sama ditolak (tidak ada update)', async () => {
    const ref = doc(praktikanB(), 'attendances', `${OPEN_SESSION}_prkB`);
    await assertSucceeds(setDoc(ref, attendance(OPEN_SESSION, 'prkB')));
    await assertFails(setDoc(ref, attendance(OPEN_SESSION, 'prkB')));
  });
  it('presensi atas nama orang lain ditolak, juga oleh asisten', async () => {
    await assertFails(setDoc(doc(praktikanA(), 'attendances', `${OPEN_SESSION}_prkB`), attendance(OPEN_SESSION, 'prkB')));
    await assertFails(setDoc(doc(asisten(), 'attendances', `${OPEN_SESSION}_prkB`), attendance(OPEN_SESSION, 'prkB')));
  });
  it('presensi pada sesi DITUTUP ditolak', async () => {
    await assertFails(setDoc(doc(praktikanB(), 'attendances', `${CLOSED_SESSION}_prkB`), attendance(CLOSED_SESSION, 'prkB')));
  });
  it('non-anggota kelas tidak bisa presensi', async () => {
    await assertFails(setDoc(doc(outsider(), 'attendances', `${OPEN_SESSION}_prkC`), attendance(OPEN_SESSION, 'prkC')));
  });
  it('ID dokumen harus sessionId_uid', async () => {
    await assertFails(setDoc(doc(praktikanB(), 'attendances', 'acak'), attendance(OPEN_SESSION, 'prkB')));
  });
  it('attendedAt harus server timestamp', async () => {
    await assertFails(setDoc(doc(praktikanB(), 'attendances', `${OPEN_SESSION}_prkB`), {
      ...attendance(OPEN_SESSION, 'prkB'), attendedAt: ts(8),
    }));
  });
  it('asisten kelas membaca rekap; praktikan lain dan asisten kelas lain tidak', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'attendances', `${OPEN_SESSION}_prkA`), {
        sessionId: OPEN_SESSION, classId: CLASS_ID, praktikanUid: 'prkA', attendedAt: ts(8),
      }),
    );
    const q = (db) => query(
      collection(db, 'attendances'),
      where('sessionId', '==', OPEN_SESSION),
      where('classId', '==', CLASS_ID),
    );
    await assertSucceeds(getDocs(q(asisten())));
    await assertFails(getDocs(q(asistenLain())));
    await assertFails(getDocs(q(praktikanB())));
    await assertSucceeds(getDoc(doc(praktikanA(), 'attendances', `${OPEN_SESSION}_prkA`)));
    await assertFails(getDoc(doc(praktikanB(), 'attendances', `${OPEN_SESSION}_prkA`)));
  });
});

describe('izin', () => {
  const permissionRef = (db) => doc(db, 'permissions', `${OPEN_SESSION}_prkA`);

  it('praktikan B tidak bisa membaca atau mengubah izin praktikan A', async () => {
    await assertFails(getDoc(permissionRef(praktikanB())));
    await assertFails(updateDoc(permissionRef(praktikanB()), { aiStatus: 'FAILED', updatedAt: serverTimestamp() }));
  });
  it('praktikan A membaca izin sendiri dan mengisi hasil AI', async () => {
    await assertSucceeds(getDoc(permissionRef(praktikanA())));
    await assertSucceeds(updateDoc(permissionRef(praktikanA()), {
      aiStatus: 'SUCCEEDED', aiLabel: 'sakit', aiConfidence: 0.9, updatedAt: serverTimestamp(),
    }));
  });
  it('praktikan tidak bisa memutus izin sendiri', async () => {
    await assertFails(updateDoc(permissionRef(praktikanA()), {
      status: 'APPROVED', reviewedBy: 'prkA', reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });
  it('asisten kelas memutus izin dengan metadata review benar; asisten lain ditolak', async () => {
    await assertFails(updateDoc(permissionRef(asistenLain()), {
      status: 'APPROVED', reviewedBy: 'ast2', reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(permissionRef(asisten()), {
      status: 'APPROVED', reviewedBy: 'ast1', reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });
  it('asisten tidak bisa memutus atas nama asisten lain', async () => {
    await assertFails(updateDoc(permissionRef(asisten()), {
      status: 'REJECTED', reviewedBy: 'ast-lain', reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });
  it('praktikan membuat izin dengan status PENDING; status lain ditolak', async () => {
    const base = {
      sessionId: CLOSED_SESSION, classId: CLASS_ID, praktikanUid: 'prkA', alasan: 'Keluarga',
      aiStatus: 'PENDING', aiLabel: null, aiConfidence: null, status: 'PENDING',
      reviewedBy: null, reviewedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    };
    const ref = doc(praktikanA(), 'permissions', `${CLOSED_SESSION}_prkA`);
    await assertFails(setDoc(ref, { ...base, status: 'APPROVED' }));
    await assertSucceeds(setDoc(ref, base));
  });
  it('praktikan yang sudah presensi tidak dapat mengajukan izin pada sesi yang sama', async () => {
    await setDoc(doc(praktikanB(), 'attendances', `${OPEN_SESSION}_prkB`), {
      sessionId: OPEN_SESSION, classId: CLASS_ID, praktikanUid: 'prkB', attendedAt: serverTimestamp(),
    });
    await assertFails(setDoc(doc(praktikanB(), 'permissions', `${OPEN_SESSION}_prkB`), {
      sessionId: OPEN_SESSION, classId: CLASS_ID, praktikanUid: 'prkB', alasan: 'Sakit',
      aiStatus: 'PENDING', aiLabel: null, aiConfidence: null, status: 'PENDING',
      reviewedBy: null, reviewedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });
});

describe('labs (Sprint 3)', () => {
  const validLab = (createdBy = 'ast1') => ({
    nama: 'Lab AI',
    gedung: 'Gedung E Lt. 3',
    deskripsi: 'Laboratorium komputer',
    latitude: LAB_LAT,
    longitude: LAB_LNG,
    radiusMeter: 150,
    cosLat: LAB_COS_LAT,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  it('pengguna login dapat membaca labs; pengguna anonim ditolak', async () => {
    await assertSucceeds(getDoc(doc(praktikanA(), 'labs', LAB_ID)));
    await assertSucceeds(getDocs(collection(asisten(), 'labs')));
    await assertFails(getDoc(doc(anon(), 'labs', LAB_ID)));
    await assertFails(getDocs(collection(anon(), 'labs')));
  });

  it('aslab dapat membuat, mengubah, dan menghapus lab dengan data valid', async () => {
    const ref = doc(aslab(), 'labs', 'labBaru');
    await assertSucceeds(setDoc(ref, validLab('lab1')));
    await assertSucceeds(updateDoc(ref, { radiusMeter: 200, updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('asisten tidak dapat menulis atau menghapus lab', async () => {
    await assertFails(setDoc(doc(asisten(), 'labs', 'labAsisten'), validLab('ast1')));
    await assertFails(updateDoc(doc(asisten(), 'labs', LAB_ID), {
      radiusMeter: 50,
      updatedAt: serverTimestamp(),
    }));
    await assertFails(deleteDoc(doc(asisten(), 'labs', LAB_ID)));
  });

  it('praktikan tidak dapat menulis atau menghapus lab', async () => {
    await assertFails(setDoc(doc(praktikanA(), 'labs', 'labPrk'), validLab('prkA')));
    await assertFails(updateDoc(doc(praktikanA(), 'labs', LAB_ID), { radiusMeter: 50, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(praktikanA(), 'labs', LAB_ID)));
  });

  it('menolak lab dengan radius, koordinat, cosLat, atau metadata tidak valid', async () => {
    await assertFails(setDoc(doc(aslab(), 'labs', 'labKecil'), { ...validLab('lab1'), radiusMeter: 5 }));
    await assertFails(setDoc(doc(aslab(), 'labs', 'labBesar'), { ...validLab('lab1'), radiusMeter: 1500 }));
    await assertFails(setDoc(doc(aslab(), 'labs', 'labLat'), { ...validLab('lab1'), latitude: 95 }));
    await assertFails(setDoc(doc(aslab(), 'labs', 'labLng'), { ...validLab('lab1'), longitude: -185 }));
    await assertFails(setDoc(doc(aslab(), 'labs', 'labCos'), { ...validLab('lab1'), cosLat: 0 }));
    await assertFails(setDoc(doc(aslab(), 'labs', 'labCreator'), validLab('ast2')));
    await assertFails(updateDoc(doc(aslab(), 'labs', LAB_ID), { createdAt: ts(5), updatedAt: serverTimestamp() }));
  });
});

describe('fondasi Sprint 4', () => {
  const labMember = () => ({
    labId: LAB_ID,
    uid: 'prkA',
    role: 'praktikan',
    nama: 'Praktikan A',
    nomorInduk: 'NI-prkA',
    email: 'a@x.id',
    assignedBy: 'lab1',
    assignedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const attendanceWithTimeliness = () => ({
    sessionId: OPEN_SESSION,
    classId: CLASS_ID,
    praktikanUid: 'prkB',
    attendedAt: serverTimestamp(),
    timeliness: 'TERLAMBAT',
    lateMinutes: 12,
    gracePeriodMinutes: 10,
  });

  const fine = () => ({
    attendanceId: `${OPEN_SESSION}_prkB`,
    sessionId: OPEN_SESSION,
    classId: CLASS_ID,
    labId: null,
    sessionTitle: 'Modul',
    labName: '',
    praktikanUid: 'prkB',
    amount: 10000,
    lateMinutes: 12,
    status: 'UNPAID',
    latestOrderId: null,
    latestPaymentStatus: null,
    issuedAt: serverTimestamp(),
    paidAt: null,
    updatedAt: serverTimestamp(),
  });

  it('aslab dapat membaca semua kelas/sesi dan mengelola labMembers', async () => {
    await assertSucceeds(getDocs(collection(aslab(), 'classes')));
    await assertSucceeds(getDocs(collection(aslab(), 'sessions')));
    const ref = doc(aslab(), 'labMembers', `${LAB_ID}_prkA`);
    await assertSucceeds(setDoc(ref, labMember()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, {
      nama: 'Praktikan A Baru',
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('asisten dan praktikan tidak dapat mengelola labMembers', async () => {
    await assertFails(setDoc(doc(asisten(), 'labMembers', `${LAB_ID}_prkA`), {
      ...labMember(),
      assignedBy: 'ast1',
    }));
    await assertFails(setDoc(doc(praktikanA(), 'labMembers', `${LAB_ID}_prkA`), {
      ...labMember(),
      assignedBy: 'prkA',
    }));
  });

  it('presensi menerima metadata ketepatan waktu yang valid', async () => {
    await assertSucceeds(setDoc(
      doc(praktikanB(), 'attendances', `${OPEN_SESSION}_prkB`),
      attendanceWithTimeliness(),
    ));
  });

  it('praktikan dapat membuat denda UNPAID sendiri tetapi tidak dapat mengubahnya menjadi PAID', async () => {
    await setDoc(
      doc(praktikanB(), 'attendances', `${OPEN_SESSION}_prkB`),
      attendanceWithTimeliness(),
    );
    const ref = doc(praktikanB(), 'fines', `${OPEN_SESSION}_prkB`);
    await assertSucceeds(setDoc(ref, fine()));
    await assertFails(updateDoc(ref, {
      status: 'PAID',
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });

  it('presensi terlambat dan denda dapat dibuat atomik dalam satu transaksi client', async () => {
    const db = praktikanB();
    const batch = writeBatch(db);
    batch.set(doc(db, 'attendances', `${OPEN_SESSION}_prkB`), attendanceWithTimeliness());
    batch.set(doc(db, 'fines', `${OPEN_SESSION}_prkB`), fine());
    await assertSucceeds(batch.commit());
  });

  it('praktikan dan aslab tidak dapat menulis paymentTransactions', async () => {
    const payload = {
      orderId: 'order-1',
      fineId: `${OPEN_SESSION}_prkB`,
      praktikanUid: 'prkB',
      amount: 10000,
      status: 'pending',
    };
    await assertFails(setDoc(doc(praktikanB(), 'paymentTransactions', 'order-1'), payload));
    await assertFails(setDoc(doc(aslab(), 'paymentTransactions', 'order-1'), payload));
  });

  it('aslab dapat membaca semua denda dan transaksi pembayaran', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'fines', `${OPEN_SESSION}_prkB`), {
        ...fine(),
        issuedAt: ts(8),
        updatedAt: ts(8),
      });
      await setDoc(doc(db, 'paymentTransactions', 'order-1'), {
        orderId: 'order-1',
        fineId: `${OPEN_SESSION}_prkB`,
        praktikanUid: 'prkB',
        amount: 10000,
        status: 'pending',
        createdAt: ts(8),
        updatedAt: ts(8),
      });
    });
    await assertSucceeds(getDocs(collection(aslab(), 'fines')));
    await assertSucceeds(getDocs(collection(aslab(), 'paymentTransactions')));
  });
});

describe('pushTokens (Sprint 3)', () => {
  it('pemilik dapat get, create, update, dan delete token miliknya', async () => {
    const refA = doc(praktikanA(), 'pushTokens', 'prkA');
    const refB = doc(praktikanB(), 'pushTokens', 'prkB');
    await assertSucceeds(getDoc(refA));
    await assertSucceeds(setDoc(refB, {
      uid: 'prkB',
      token: 'ExponentPushToken[prkB-1]',
      platform: 'android',
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(refB, {
      token: 'ExponentPushToken[prkB-2]',
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(deleteDoc(refB));
  });

  it('asisten boleh get token per UID tetapi ditolak saat query list', async () => {
    await assertSucceeds(getDoc(doc(asisten(), 'pushTokens', 'prkA')));
    await assertFails(getDocs(collection(asisten(), 'pushTokens')));
  });

  it('praktikan lain, asisten (delete), dan anonim ditolak', async () => {
    await assertFails(getDoc(doc(praktikanB(), 'pushTokens', 'prkA')));
    await assertFails(getDocs(collection(praktikanB(), 'pushTokens')));
    await assertFails(setDoc(doc(praktikanB(), 'pushTokens', 'prkA'), {
      uid: 'prkA',
      token: 'ExponentPushToken[bajakan]',
      platform: 'android',
      updatedAt: serverTimestamp(),
    }));
    await assertFails(deleteDoc(doc(asisten(), 'pushTokens', 'prkA')));
    await assertFails(getDoc(doc(anon(), 'pushTokens', 'prkA')));
  });

  it('menolak payload token tidak valid', async () => {
    const refB = doc(praktikanB(), 'pushTokens', 'prkB');
    await assertFails(setDoc(refB, {
      uid: 'prkB', token: '', platform: 'android', updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(refB, {
      uid: 'prkB', token: 'ExponentPushToken[x]', platform: 'web', updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(refB, {
      uid: 'orangLain', token: 'ExponentPushToken[x]', platform: 'ios', updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(refB, {
      uid: 'prkB', token: 'ExponentPushToken[x]', platform: 'android', updatedAt: ts(1),
    }));
  });
});

describe('sesi dengan labId (Sprint 3)', () => {
  it('asisten dapat menyimpan labId valid atau null, tetapi string kosong ditolak', async () => {
    const ref = doc(asisten(), 'sessions', NEW_SESSION);
    await assertSucceeds(setDoc(ref, {
      classId: CLASS_ID,
      judul: 'Modul Lokasi',
      ruangan: 'Lab Mobile 1',
      labId: LAB_ID,
      startsAt: ts(12),
      endsAt: ts(14),
      status: 'BELUM_DIBUKA',
      catatan: '',
      createdBy: 'ast1',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(ref, { labId: null, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { labId: '', updatedAt: serverTimestamp() }));
  });
});

describe('presensi berbasis lokasi (Sprint 3)', () => {
  const locatedAttendance = (overrides = {}) => ({
    sessionId: LAB_SESSION,
    classId: CLASS_ID,
    praktikanUid: 'prkB',
    attendedAt: serverTimestamp(),
    labId: LAB_ID,
    latitude: LAB_LAT + 0.0001,
    longitude: LAB_LNG,
    accuracy: 15,
    distanceMeter: 11,
    ...overrides,
  });

  it('praktikan presensi di dalam radius lab berhasil (memverifikasi math.sqrt/math.pow) dan duplikasi ditolak', async () => {
    const ref = doc(praktikanB(), 'attendances', `${LAB_SESSION}_prkB`);
    await assertSucceeds(setDoc(ref, locatedAttendance()));
    await assertFails(setDoc(ref, locatedAttendance()));
  });

  it('menolak presensi di luar radius meskipun distanceMeter dipalsukan kecil', async () => {
    await assertFails(setDoc(
      doc(praktikanB(), 'attendances', `${LAB_SESSION}_prkB`),
      locatedAttendance({ latitude: LAB_LAT + 0.002, distanceMeter: 10 }),
    ));
  });

  it('menolak presensi sesi berlab tanpa koordinat lengkap, labId salah, atau accuracy tidak valid', async () => {
    const ref = doc(praktikanB(), 'attendances', `${LAB_SESSION}_prkB`);
    await assertFails(setDoc(ref, {
      sessionId: LAB_SESSION, classId: CLASS_ID, praktikanUid: 'prkB', attendedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(ref, locatedAttendance({ accuracy: null })));
    await assertFails(setDoc(ref, locatedAttendance({ accuracy: 101 })));
    await assertFails(setDoc(ref, locatedAttendance({ labId: 'labLain' })));
  });

  it('menolak koordinat di luar rentang, distanceMeter negatif, atau melebihi toleransi batas lab', async () => {
    const ref = doc(praktikanB(), 'attendances', `${LAB_SESSION}_prkB`);
    await assertFails(setDoc(ref, locatedAttendance({ latitude: 95 })));
    await assertFails(setDoc(ref, locatedAttendance({ longitude: 185 })));
    await assertFails(setDoc(ref, locatedAttendance({ distanceMeter: -1 })));
    await assertFails(setDoc(ref, locatedAttendance({ distanceMeter: LAB_RADIUS * 1.05 + 6 })));
  });

  it('menolak presensi jika dokumen lab pada sesi sudah tidak ada', async () => {
    await assertFails(setDoc(
      doc(praktikanB(), 'attendances', `${MISSING_LAB_SESSION}_prkB`),
      locatedAttendance({ sessionId: MISSING_LAB_SESSION, labId: 'labTidakAda' }),
    ));
  });

  it('sesi lama tanpa labId menolak field lokasi dan tetap lolos tanpa field lokasi', async () => {
    const ref = doc(praktikanB(), 'attendances', `${OPEN_SESSION}_prkB`);
    await assertFails(setDoc(ref, locatedAttendance({ sessionId: OPEN_SESSION })));
    await assertSucceeds(setDoc(ref, {
      sessionId: OPEN_SESSION, classId: CLASS_ID, praktikanUid: 'prkB', attendedAt: serverTimestamp(),
    }));
  });
});
