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
} from 'firebase/firestore';

const PROJECT_ID = 'demo-ppk-pertemuan-8';
const CLASS_ID = 'kelas1';
const OPEN_SESSION = 'sesiBuka';
const CLOSED_SESSION = 'sesiTutup';
const NEW_SESSION = 'sesiBaru';

let env;

const asisten = () => env.authenticatedContext('ast1', { email: 'ast@x.id' }).firestore();
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
});

describe('presensi', () => {
  const attendance = (sessionId, uid) => ({
    sessionId, classId: CLASS_ID, praktikanUid: uid, attendedAt: serverTimestamp(), catatan: 'Hadir',
  });

  it('praktikan anggota presensi atas UID sendiri saat sesi DIBUKA', async () => {
    await assertSucceeds(setDoc(doc(praktikanA(), 'attendances', `${OPEN_SESSION}_prkA`), attendance(OPEN_SESSION, 'prkA')));
  });
  it('presensi kedua pada dokumen yang sama ditolak (tidak ada update)', async () => {
    const ref = doc(praktikanA(), 'attendances', `${OPEN_SESSION}_prkA`);
    await assertSucceeds(setDoc(ref, attendance(OPEN_SESSION, 'prkA')));
    await assertFails(setDoc(ref, attendance(OPEN_SESSION, 'prkA')));
  });
  it('presensi atas nama orang lain ditolak, juga oleh asisten', async () => {
    await assertFails(setDoc(doc(praktikanA(), 'attendances', `${OPEN_SESSION}_prkB`), attendance(OPEN_SESSION, 'prkB')));
    await assertFails(setDoc(doc(asisten(), 'attendances', `${OPEN_SESSION}_prkB`), attendance(OPEN_SESSION, 'prkB')));
  });
  it('presensi pada sesi DITUTUP ditolak', async () => {
    await assertFails(setDoc(doc(praktikanA(), 'attendances', `${CLOSED_SESSION}_prkA`), attendance(CLOSED_SESSION, 'prkA')));
  });
  it('non-anggota kelas tidak bisa presensi', async () => {
    await assertFails(setDoc(doc(outsider(), 'attendances', `${OPEN_SESSION}_prkC`), attendance(OPEN_SESSION, 'prkC')));
  });
  it('ID dokumen harus sessionId_uid', async () => {
    await assertFails(setDoc(doc(praktikanA(), 'attendances', 'acak'), attendance(OPEN_SESSION, 'prkA')));
  });
  it('attendedAt harus server timestamp', async () => {
    await assertFails(setDoc(doc(praktikanA(), 'attendances', `${OPEN_SESSION}_prkA`), {
      ...attendance(OPEN_SESSION, 'prkA'), attendedAt: ts(8),
    }));
  });
  it('asisten membaca rekap; praktikan lain tidak', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'attendances', `${OPEN_SESSION}_prkA`), {
        sessionId: OPEN_SESSION, classId: CLASS_ID, praktikanUid: 'prkA', attendedAt: ts(8),
      }),
    );
    const q = (db) => query(collection(db, 'attendances'), where('sessionId', '==', OPEN_SESSION));
    await assertSucceeds(getDocs(q(asisten())));
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
  it('asisten memutus izin dengan metadata review benar', async () => {
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
});
