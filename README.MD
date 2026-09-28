<div align="center">

# 🎓 Sistem Presensi Digital

**Aplikasi presensi mahasiswa berbasis QR Code**

Frontend di GitHub Pages · Backend di Google Apps Script · Database di Google Sheets

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen?style=for-the-badge)](https://your-username.github.io/digital-attendance/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](#-lisensi)
[![Made with](https://img.shields.io/badge/made%20with-vanilla%20JS-yellow?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

[Fitur](#-fitur) · [Arsitektur](#-arsitektur) · [Instalasi](#-instalasi) · [Penggunaan](#-penggunaan) · [Testing](#-testing) · [Keterbatasan](#-keterbatasan-dan-catatan)

</div>

---

## 📖 Tentang Proyek

Sistem Presensi Digital adalah aplikasi web untuk mencatat kehadiran mahasiswa menggunakan **QR Code**. Dosen membuat sesi presensi, mahasiswa menunjukkan QR pribadinya, dan kehadiran tercatat secara **real-time** ke Google Sheets.

Dibangun **100% tanpa framework backend** — hanya memanfaatkan GitHub Pages sebagai hosting frontend dan Google Apps Script sebagai API. Cocok untuk:

- 🎓 Proyek akhir mata kuliah RPL / Pemrograman Web
- 🏫 Prototype sistem akademik skala kecil
- 📚 Pembelajaran integrasi frontend + Google Workspace

---

## ✨ Fitur

### 👨‍🎓 Untuk Mahasiswa

| Fitur | Deskripsi |
|---|---|
| 🔐 **Login NPM** | Identifikasi berdasarkan NPM dari database |
| 📊 **Dashboard** | Ringkasan kehadiran (hadir/telat/alpha/persentase) |
| 📱 **QR Saya** | QR pribadi `ATTENDANCE\|NPM` untuk discan dosen |
| 📅 **Kalender** | Riwayat kehadiran dalam tampilan kalender + navigasi bulan |
| 📜 **Riwayat** | Daftar lengkap presensi dengan filter status |
| 🔔 **Pengingat** | Reminder kelas (tambah, ubah, hapus, notifikasi browser) |
| 📚 **Jadwal** | Daftar mata kuliah per hari |
| 👤 **Profil** | Info akademik read-only |

### 👨‍🏫 Untuk Dosen

| Fitur | Deskripsi |
|---|---|
| 🎯 **Setup Sesi** | Buat sesi presensi (mata kuliah, kelas, pertemuan, jam) |
| 📷 **QR Scanner** | Scan QR mahasiswa via kamera browser (html5-qrcode) |
| ✅ **Validasi Berlapis** | Sesi aktif, kelas cocok, duplikat, waktu, NPM aktif |
| ⏱️ **Auto Status** | HADIR (≤10 menit) / TERLAMBAT (>10 menit) |
| 📊 **Live Monitor** | Daftar kehadiran real-time + counter + search |
| 🔄 **Session Recovery** | Lanjutkan sesi aktif setelah refresh browser |
| 🏁 **End Session** | Tutup sesi + rekap otomatis |
| 📥 **Export** | Unduh rekap dalam format **CSV** atau **Excel (.xlsx)** |

### ⚙️ Backend

- 🔒 **Anti-duplikat** via `LockService`
- 🕐 **Server-side timestamp** (bukan waktu browser)
- ✅ **Validasi ketat** — tidak percaya data dari frontend
- 📝 **16 API endpoints** dengan format respons konsisten

---

## 🏗 Arsitektur

```
┌─────────────────────────────────────────────────┐
│           GitHub Pages (HTTPS)                  │
│                                                 │
│   ┌─────────────┐         ┌─────────────────┐   │
│   │  MAHASISWA  │         │     DOSEN       │   │
│   │  QR Saya    │         │  QR Scanner     │   │
│   └──────┬──────┘         └────────┬────────┘   │
│          │                         │            │
│          │    fetch() POST         │            │
│          └──────────┬──────────────┘            │
└─────────────────────┼───────────────────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  Google Apps Script        │
         │  Web App (doPost)          │
         │  ├─ routeAction            │
         │  ├─ LockService            │
         │  └─ Validation Layer       │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │       Google Sheets        │
         │  Students · Courses        │
         │  Schedules · Sessions      │
         │  Attendance · Reminders    │
         └────────────────────────────┘
```

### Stack Teknologi

| Layer | Teknologi |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **QR Generate** | [QRCode.js](https://github.com/davidshimjs/qrcodejs) |
| **QR Scanner** | [html5-qrcode](https://github.com/mebjas/html5-qrcode) |
| **Excel Export** | [SheetJS](https://sheetjs.com/) |
| **Backend** | Google Apps Script |
| **Database** | Google Sheets |
| **Hosting** | GitHub Pages |

**Tanpa** React, Vue, Laravel, PHP, Node.js, Firebase, MySQL, atau Supabase.

---

## 📂 Struktur Repository

```
digital-attendance/
├── index.html      # Aplikasi utama (HTML + CSS + JS)
├── README.md       # Dokumentasi ini
└── LICENSE         # (opsional) MIT License
```

> **Catatan**: seluruh aplikasi frontend berada dalam satu file `index.html` sesuai arsitektur single-file yang disengaja.

Backend `Code.gs` **tidak di-upload ke repo** — dia hidup di Google Apps Script Editor yang terhubung ke spreadsheet.

---

## 🚀 Instalasi

### Prasyarat

- Akun **Google** (untuk Sheets + Apps Script)
- Akun **GitHub** (untuk hosting frontend)
- Browser modern: **Chrome**, **Edge**, **Firefox**, atau **Safari**
- Kamera (untuk dosen — scan QR)

### Langkah 1 — Setup Backend (Google Apps Script)

<details>
<summary>Klik untuk expand instruksi lengkap</summary>

#### 1.1 Buat Spreadsheet

1. Buka https://sheets.new
2. Rename → mis. `Digital Attendance DB`
3. Buat 6 sheet dengan nama **persis**:
   - `Students`
   - `Courses`
   - `Schedules`
   - `Sessions`
   - `Attendance`
   - `Reminders`

> Header kolom akan dibuat otomatis oleh `setupDatabase()`, tapi Anda bisa mengisinya manual:

<details>
<summary>Lihat header setiap sheet</summary>

**Students** — `NPM | Nama | Semester | Kelas | Status`

**Courses** — `CourseID | MataKuliah | Semester`

**Schedules** — `ScheduleID | CourseID | Kelas | Hari | JamMulai | JamSelesai`

**Sessions** — `SessionID | CourseID | Semester | Kelas | Pertemuan | Tanggal | JamMulai | JamSelesai | Status`

**Attendance** — `AttendanceID | SessionID | NPM | WaktuScan | Status`

**Reminders** — `ReminderID | NPM | CourseID | Hari | Jam | MenitSebelum | Aktif`

</details>

#### 1.2 Setup Apps Script

1. Di spreadsheet: **Extensions → Apps Script**
2. Hapus isi default `Code.gs`
3. Paste kode `Code.gs` (lihat file terpisah dari developer / dokumentasi internal)
4. **Simpan** (Ctrl+S)
5. Pilih function `setupDatabase` dari dropdown → **Run** → **Authorize**

#### 1.3 Isi Data Contoh (Minimal)

**Students**
```
NPM         | Nama         | Semester | Kelas | Status
230411234   | Felisa Aziva | 5        | 5.1   | Aktif
```

**Courses**
```
CourseID | MataKuliah                    | Semester
MK-RPL   | Rekayasa Perangkat Lunak      | 5
```

**Schedules**
```
ScheduleID | CourseID | Kelas | Hari  | JamMulai | JamSelesai
SCH-01     | MK-RPL   | 5.1   | Senin | 08:00    | 10:30
```

#### 1.4 Deploy Web App

1. **Deploy → New deployment**
2. Klik gerigi → pilih **Web app**
3. Konfigurasi:
   - **Description**: `Digital Attendance`
   - **Execute as**: **Me**
   - **Who has access**: **Anyone**
4. Klik **Deploy** → **Authorize** (Advanced → Go to unsafe → Allow)
5. **Copy Web App URL** — format: `https://script.google.com/macros/s/AKfycb.../exec`

#### 1.5 Set Timezone

- Di spreadsheet: **File → Settings**
- **Time zone**: `(GMT+07:00) Jakarta`
- Save

> ⚠️ **Penting**: tanpa timezone yang benar, validasi waktu sesi bisa tidak sesuai dengan waktu lokal Anda.

</details>

### Langkah 2 — Konfigurasi Frontend

Buka `index.html`, cari baris ini di dalam `<script>`:

```javascript
const CONFIG = {
    API_URL: '',   // ← GANTI dengan URL Web App Anda
    ...
    DEBUG: false
};
```

Ganti dengan URL Web App yang Anda dapat dari langkah 1.4:

```javascript
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
    ...
    DEBUG: false
};
```

### Langkah 3 — Deploy ke GitHub Pages

1. Buat repository baru di GitHub (Public)
2. Upload `index.html` dan `README.md` (Add file → Upload files → Commit)
3. Buka **Settings → Pages**
4. **Source**: `Deploy from a branch`
5. **Branch**: `main` → folder `/ (root)` → **Save**
6. Tunggu 1–2 menit
7. URL akan muncul: `https://<username>.github.io/<repo-name>/`

---

## 🎯 Penggunaan

### Alur Mahasiswa

```
1. Buka URL GitHub Pages
2. Masukkan NPM → Masuk
3. Dashboard tampil dengan ringkasan kehadiran
4. Buka tab "QR Saya" → QR tampil
5. Tunjukkan QR ke dosen untuk discan
```

### Alur Dosen

```
1. Buka URL GitHub Pages
2. Klik "Mulai Absensi" (kanan atas)
3. Isi form sesi (mata kuliah, kelas, pertemuan, jam)
4. Klik "Mulai Sesi Presensi"
5. Izinkan akses kamera saat diminta
6. Arahkan kamera ke QR mahasiswa
7. Lihat monitor live update
8. Klik "Akhiri Sesi" setelah selesai
9. Export rekap jika diperlukan
```

---

## 🧪 Testing

### Test Cepat (5 menit)

| # | Aksi | Expected |
|---|---|---|
| 1 | Login NPM valid | Masuk dashboard dengan data benar |
| 2 | Login NPM invalid | Toast "Mahasiswa tidak ditemukan" |
| 3 | Buat sesi sebagai dosen | Sesi aktif, scanner terbuka |
| 4 | Scan QR mahasiswa | Toast hijau + row baru di sheet `Attendance` |
| 5 | Scan QR yang sama lagi | Ditolak "sudah melakukan absensi" |
| 6 | Akhiri sesi | Rekap tampil |
| 7 | Export CSV | File terunduh |

### Test Lengkap

Lihat dokumentasi `PHASE 7 — Production Testing` untuk checklist lengkap 22+ item.

### Setup Test 2 Device (Laptop + HP)

1. **Laptop** → Dosen → Create session → Scanner
2. **HP** → Mahasiswa → Login → Buka QR
3. **Laptop** → Arahkan kamera ke QR HP
4. **Verify** → Attendance masuk Google Sheets

> ⚠️ **Wajib HTTPS** — kamera tidak bisa diakses dari `file://` atau `http://`. Gunakan GitHub Pages URL atau `localhost`.

---

## 🔒 Keamanan & Model Ancaman

### Yang Sudah Diterapkan ✅

- ✅ Tidak ada credential di frontend
- ✅ QR hanya berisi identifier (`ATTENDANCE|NPM`), bukan token rahasia
- ✅ Backend memvalidasi **setiap** request (tidak percaya frontend)
- ✅ `LockService` mencegah race condition
- ✅ Timestamp dari server, bukan browser
- ✅ Validasi waktu sesi di backend (bukan bisa dipalsukan)

### Yang **BUKAN** Perlindungan ❌

- ❌ **Bukan autentikasi** — NPM-only, siapa tahu NPM bisa login
- ❌ **Bukan biometric** — QR statis, screenshot bisa dipakai orang lain
- ❌ **Bukan otorisasi role** — endpoint dosen dapat dipanggil siapa pun yang tahu URL
- ❌ **Bukan enkripsi end-to-end** — data via HTTPS tapi Google Sheets tetap plaintext

**Cocok untuk**: prototype, tugas akhir, kelas internal, lingkungan terpercaya.

**Tidak cocok untuk**: sistem produksi kampus skala besar tanpa modifikasi tambahan.

---

## ⚠️ Keterbatasan dan Catatan

| Keterbatasan | Detail |
|---|---|
| 🔔 **Notification** | Hanya jalan saat tab browser terbuka. Tidak ada Service Worker / PWA. |
| 📡 **Realtime** | Pakai **polling** 3 detik, bukan WebSocket. |
| 🌐 **CORS** | Memakai `Content-Type: text/plain` untuk menghindari preflight. |
| ⏱ **Quota Apps Script** | ~20.000 request/minggu, ~90 menit execution/hari (akun gratis). |
| 📱 **LocalStorage** | Per browser, per device. Pindah device = login ulang. |
| 🕐 **Timezone** | Bergantung pengaturan spreadsheet. Wajib Asia/Jakarta. |
| 📷 **Kamera** | Butuh HTTPS + permission + browser modern. |
| 🔐 **Keamanan** | NPM-only, bukan autentikasi kompleks. |
| 📊 **Export** | XLSX bergantung CDN SheetJS — fallback ke CSV jika gagal. |

### Fitur yang **Tidak** Diimplementasikan

- ❌ PWA / offline mode
- ❌ WebSocket / true real-time
- ❌ GPS / geofencing
- ❌ Face recognition / biometric
- ❌ Multi-campus / multi-tenant
- ❌ Admin dashboard
- ❌ Payment / billing
- ❌ Email / push notification (FCM)

---

## 🛠 Troubleshooting

<details>
<summary><b>Kamera tidak terbuka / permission denied</b></summary>

- Pastikan URL **HTTPS** (bukan `http://` atau `file://`)
- Cek ikon 🔒 di address bar → Site settings → Camera → Allow
- Coba browser lain (Chrome direkomendasikan)
- Di iOS Safari, Settings → Safari → Camera → Ask/Allow

</details>

<details>
<summary><b>Toast "API belum dikonfigurasi"</b></summary>

- `CONFIG.API_URL` di `index.html` masih kosong
- Ikuti langkah **Instalasi → Langkah 2**

</details>

<details>
<summary><b>Data tidak muncul / dashboard kosong</b></summary>

- Cek sheet `Students`, `Courses`, `Schedules` sudah terisi
- Buka Console browser (F12) → cek error
- Cek Apps Script **Executions log** untuk error server

</details>

<details>
<summary><b>Scan QR ditolak: "Sesi belum dimulai" / "sudah berakhir"</b></summary>

- Jam mulai/selesai sesi tidak sesuai waktu saat ini
- Cek timezone spreadsheet (File → Settings → Time zone → Asia/Jakarta)
- Buat ulang sesi dengan waktu yang sesuai

</details>

<details>
<summary><b>Duplicate scan ditolak padahal belum scan</b></summary>

- Cooldown frontend 3 detik — tunggu sebentar
- Cek sheet `Attendance`: mungkin sudah ada row dari scan sebelumnya
- Cek `SessionID` — mungkin sesi berbeda tapi NPM sama

</details>

<details>
<summary><b>Export Excel gagal</b></summary>

- CDN SheetJS mungkin tidak termuat
- Cek Network tab → filter `xlsx.full.min.js`
- Alternatif: gunakan **Export CSV**

</details>

---

## 📊 Skema Database

<details>
<summary>Klik untuk melihat detail schema</summary>

### Students
| Kolom | Tipe | Keterangan |
|---|---|---|
| NPM | String | Primary key |
| Nama | String | Nama lengkap |
| Semester | Number | Semester aktif |
| Kelas | String | mis. `5.1` |
| Status | String | `Aktif` / `Nonaktif` |

### Courses
| Kolom | Tipe | Keterangan |
|---|---|---|
| CourseID | String | Primary key, mis. `MK-RPL` |
| MataKuliah | String | Nama mata kuliah |
| Semester | Number | Semester |

### Schedules
| Kolom | Tipe | Keterangan |
|---|---|---|
| ScheduleID | String | Primary key |
| CourseID | String | FK ke Courses |
| Kelas | String | Kelas |
| Hari | String | `Senin`..`Minggu` |
| JamMulai | String | `HH:mm` |
| JamSelesai | String | `HH:mm` |

### Sessions
| Kolom | Tipe | Keterangan |
|---|---|---|
| SessionID | String | Primary key, auto-generated |
| CourseID | String | FK ke Courses |
| Semester | Number | |
| Kelas | String | |
| Pertemuan | Number | Pertemuan ke-N |
| Tanggal | Date | `YYYY-MM-DD` |
| JamMulai | String | `HH:mm` |
| JamSelesai | String | `HH:mm` |
| Status | String | `ACTIVE` / `ENDED` / `CANCELLED` |

### Attendance
| Kolom | Tipe | Keterangan |
|---|---|---|
| AttendanceID | String | Primary key, auto-generated |
| SessionID | String | FK ke Sessions |
| NPM | String | FK ke Students |
| WaktuScan | Timestamp | Server-side |
| Status | String | `HADIR` / `TERLAMBAT` / `IZIN` / `SAKIT` / `ALPHA` |

### Reminders
| Kolom | Tipe | Keterangan |
|---|---|---|
| ReminderID | String | Primary key, auto-generated |
| NPM | String | FK ke Students |
| CourseID | String | FK ke Courses |
| Hari | String | Hari reminder |
| Jam | String | `HH:mm` |
| MenitSebelum | Number | 5/10/15/30/60 |
| Aktif | Boolean | `TRUE` / `FALSE` |

</details>

---

## 🔌 API Endpoints

Semua request via **POST** ke `CONFIG.API_URL` dengan body:

```json
{
  "action": "ACTION_NAME",
  "data": { ... }
}
```

Response selalu:

```json
{
  "success": true,
  "message": "OK",
  "data": { ... }
}
```

<details>
<summary>Lihat daftar lengkap endpoint</summary>

| Action | Data | Deskripsi |
|---|---|---|
| `getStudent` | `{ npm }` | Ambil data mahasiswa |
| `getCourses` | `{ semester? }` | Daftar mata kuliah |
| `getSchedules` | `{ semester, kelas }` | Jadwal per kelas |
| `getAttendanceHistory` | `{ npm }` | Riwayat presensi mahasiswa |
| `getAttendanceSummary` | `{ npm }` | Ringkasan kehadiran |
| `getReminders` | `{ npm }` | Pengingat mahasiswa |
| `getClassStudents` | `{ semester, kelas }` | Daftar mahasiswa kelas |
| `createSession` | `{ courseId, semester, kelas, pertemuan, tanggal, jamMulai, jamSelesai }` | Buat sesi baru |
| `getActiveSession` | `{ courseId, kelas }` | Cari sesi aktif |
| `getSessionById` | `{ sessionId }` | Detail sesi |
| `recordAttendance` | `{ sessionId, npm }` | Catat presensi |
| `getSessionAttendance` | `{ sessionId }` | Daftar presensi sesi |
| `endSession` | `{ sessionId }` | Akhiri sesi |
| `createReminder` | `{ npm, courseId, hari, jam, menitSebelum, aktif }` | Tambah reminder |
| `updateReminder` | `{ reminderId, ... }` | Update reminder |
| `deleteReminder` | `{ reminderId }` | Hapus reminder |

</details>

---

## 🤝 Kontribusi

Proyek ini terbuka untuk pembelajaran. Jika Anda menemukan bug atau ingin menambah fitur:

1. Fork repository
2. Buat branch baru: `git checkout -b feature/fitur-baru`
3. Commit perubahan: `git commit -m 'Tambah fitur X'`
4. Push ke branch: `git push origin feature/fitur-baru`
5. Buka Pull Request

---

## 📄 Lisensi

Proyek ini dilisensikan under **MIT License** — bebas digunakan, dimodifikasi, dan didistribusikan dengan tetap menyertakan atribusi.

```
MIT License

Copyright (c) 2026 [Nama Anda]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
```

---

## 🙏 Kredit

- **[QRCode.js](https://github.com/davidshimjs/qrcodejs)** — generate QR mahasiswa
- **[html5-qrcode](https://github.com/mebjas/html5-qrcode)** — scan QR via kamera
- **[SheetJS](https://sheetjs.com/)** — export Excel
- **[Font Awesome](https://fontawesome.com/)** — ikon
- **[Google Fonts](https://fonts.google.com/)** — Poppins

---

## 📞 Kontak

- **Developer**: [Felisa Aziva]
- **Email**: [felisaans@gmail.com]
- **Repository**: https://github.com/[felisaans]/[presensi-digital]

---

<div align="center">

**⭐ Jika proyek ini bermanfaat, berikan star di repository!**

Dibuat dengan ❤ untuk pembelajaran mata kuliah Rekayasa Perangkat Lunak

</div>