# 📱 Aplikasi Presensi Praktikum — Sprint 1

Aplikasi mobile berbasis **React Native (Expo)** untuk simulasi pencatatan kehadiran kegiatan praktikum melalui dua sudut pandang pengguna: **Asisten** dan **Praktikan**.

Proyek ini dikembangkan pada **Sprint 1 (Antarmuka dan Alur Praktikum)** dengan fokus pada tata letak responsif (**Flexbox**), navigasi halaman (**Expo Router**), pengelolaan **React State** berbasis data lokal/dummy, serta interaksi menggunakan **Form** dan **Modal / Bottom Sheet**.

---

## 👥 Susunan Tim & Pembagian Tugas (SRS)

| Peran | Nama Anggota | Tanggung Jawab / Kode SRS |
| :--- | :--- | :--- |
| **Project Manager (PM)** | *[Nama Anda]* | Koordinasi Sprint, Spesifikasi SRS, Integrasi & QA |
| **Programmer 1** | *[Nama Programmer 1]* | **SRS-01 & SRS-02**: Pemilihan Peran/Identitas, Kontrak Data Dummy & Daftar Jadwal Praktikum |
| **Programmer 2** | *[Nama Programmer 2]* | **SRS-03 & SRS-04**: Modul Asisten (Buka/Tutup Sesi, Form/Modal Konfirmasi & Rekap Kehadiran) |
| **Programmer 3** | *[Nama Programmer 3]* | **SRS-05 & SRS-06**: Modul Praktikan (Form Presensi, Validasi Anti-Dobel, Modal Feedback & Riwayat Hadir) |

---

## ✨ Fitur Utama (Sprint 1)

1. **Pemilihan Peran & Identitas (`SRS-01`)**
   - Beralih peran antara **Praktikan** dan **Asisten** serta memilih identitas pengguna dummy melalui Form & Modal.
2. **Jadwal & Detail Sesi (`SRS-02`)**
   - Melihat daftar jadwal praktikum lengkap dengan informasi nama praktikum, kelas, waktu, ruangan, dan badge status sesi (`Belum Dibuka`, `Dibuka`, `Ditutup`).
3. **Pengelolaan Sesi oleh Asisten (`SRS-03`)**
   - Membuka sesi saat praktikum dimulai dan menutup sesi setelah selesai menggunakan Form catatan dan Modal konfirmasi.
4. **Rekap Kehadiran oleh Asisten (`SRS-04`)**
   - Memantau daftar praktikan yang telah melakukan presensi beserta waktu kehadirannya, lengkap dengan tampilan *Empty State* saat daftar masih kosong.
5. **Pencatatan Presensi oleh Praktikan (`SRS-05`)**
   - Melakukan presensi melalui Form ketika sesi berstatus `Dibuka`, mencatat waktu kehadiran otomatis, menampilkan Modal umpan balik, serta mencegah presensi ganda pada sesi yang sama.
6. **Riwayat Kehadiran Praktikan (`SRS-06`)**
   - Melihat daftar catatan kehadiran milik praktikan sendiri beserta waktu presensinya (termasuk tampilan *Empty State* jika belum pernah presensi).

---

## 📂 Struktur Direktori Utama

```text
src/
├── app/
│   ├── _layout.tsx          # Konfigurasi navigasi utama (Expo Router)
│   ├── index.tsx            # Halaman Pilih Peran & Identitas (SRS-01)
│   ├── jadwal/              # Halaman Daftar Jadwal Praktikum (SRS-02)
│   ├── asisten/             # Halaman Kelola Sesi & Rekap Asisten (SRS-03, SRS-04)
│   └── praktikan/           # Halaman Presensi & Riwayat Praktikan (SRS-05, SRS-06)
├── components/              # Komponen UI reusable (Card, Modal, EmptyState)
└── data/
    └── dummyData.ts         # Data lokal/dummy untuk pengguna, jadwal, dan sesi
```

---

## 🚀 Cara Menjalankan Proyek

1. **Instal dependensi**
   ```bash
   npm install
   ```

2. **Jalankan server pengembangan Expo**
   ```bash
   npx expo start
   ```
   *(Jika menggunakan Wi-Fi kampus/kos yang memblokir koneksi lokal ke HP, gunakan mode tunnel):*
   ```bash
   npx expo start --tunnel
   ```

3. **Buka di perangkat**
   - Scan QR Code yang muncul di terminal menggunakan aplikasi **Expo Go** di Android/iOS, atau tekan `w` untuk membuka di Web Browser.

---

## 🧪 Pemeriksaan Kualitas Kode

Sebelum melakukan *commit* atau mengumpulkan tugas, pastikan tidak ada error dengan menjalankan:

```bash
npx expo lint
npx tsc --noEmit
```