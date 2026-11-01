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

- 🎓 Proyek tugas mata kuliah RPL / Pemrograman Web
- 🏫 Prototype sistem akademik skala kecil
- 📚 Pembelajaran integrasi frontend + Google Workspace

---

## ✨ Fitur

### 👨‍🎓 Untuk Mahasiswa

| Fitur | Deskripsi |
|---|---|
| 🔐 **Login NPM** | Identifikasi berdasarkan NPM (6–20 digit angka, divalidasi sebelum memanggil server) |
| 📝 **Daftar Mandiri** | NPM belum terdaftar → isi Nama + Kelas → langsung masuk (lihat [Daftar Mandiri](#-daftar-mandiri-self-registration)) |
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
| 🗓️ **Kelola Jadwal** | Tambah / ubah / hapus jadwal kuliah per kelas (mata kuliah, kelas, hari, jam, ruang) |
| 📥 **Export** | Unduh rekap dalam format **CSV** atau **Excel (.xlsx)** |

### ⚙️ Backend

- 🔒 **Anti-duplikat** via `LockService`
- 🕐 **Server-side timestamp** (bukan waktu browser)
- ✅ **Validasi ketat** — tidak percaya data dari frontend
- 📝 **22 API action** (+ alias `ping`) dengan format respons konsisten
- 🚦 **Rate limit pendaftaran mandiri** — maks 10 pendaftaran/menit (global)
- ⚡ **Cache 60 detik** untuk lookup mahasiswa & daftar mata kuliah, pembacaan sheet per-kolom

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
├── code.gs         # Backend Google Apps Script v2.4.0 (tempel ke Apps Script; dipakai juga oleh tests/)
├── README.md       # Dokumentasi ini
├── CHANGELOG.md    # Riwayat versi
├── tests/          # (opsional) test otomatis — lihat bagian Testing
└── LICENSE         # (opsional) MIT License
```

> **Catatan**: seluruh aplikasi frontend berada dalam satu file `index.html` sesuai arsitektur single-file yang disengaja.

`code.gs` disertakan sebagai salinan acuan (dan agar tes otomatis bisa berjalan). Yang berjalan di produksi tetap salinan yang Anda tempel di Google Apps Script Editor — setelah mengubahnya, **deploy versi baru**.

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
3. Tidak perlu membuat sheet manual — 6 sheet berikut dibuat otomatis oleh `seedDatabase()`:
   - `Students`
   - `Courses`
   - `Schedules`
   - `Sessions`
   - `Attendance`
   - `Reminders`

> Header baris 1 dibuat persis seperti di bawah (dan kolom baru `Dosen` / `Ruang` ditambahkan otomatis ke sheet lama):

<details>
<summary>Lihat header setiap sheet</summary>

**Students** — `NPM | Nama | Semester | Kelas | Status | TerdaftarPada | Sumber`  
*(dua kolom terakhir ditambah otomatis pada sheet lama; kosong untuk data yang diisi manual)*

**Courses** — `CourseID | MataKuliah | Semester | Dosen`

**Schedules** — `ScheduleID | CourseID | Kelas | Hari | JamMulai | JamSelesai | Ruang`

**Sessions** — `SessionID | CourseID | Semester | Kelas | Pertemuan | Tanggal | JamMulai | JamSelesai | Status`

**Attendance** — `AttendanceID | SessionID | NPM | WaktuScan | Status`

**Reminders** — `ReminderID | NPM | CourseID | Hari | Jam | MenitSebelum | Aktif`

</details>

#### 1.2 Setup Apps Script

1. Di spreadsheet: **Extensions → Apps Script**
2. Hapus isi default `Code.gs`
3. Paste seluruh isi `Code.gs`
4. **Simpan** (Ctrl+S)
5. **Project Settings** (ikon gerigi) → **Time zone** → `(GMT+07:00) Asia/Jakarta`
6. Pilih function `seedDatabase` dari dropdown → **Run** → **Authorize**
   - Membuat 6 sheet + header, mengunci kolom Kelas/Jam/Tanggal sebagai **teks**, dan mengisi Course `MK-RPL` (+ placeholder `MK-BD`, `MK-PWEB`).
   - **Idempotent**: aman dijalankan berulang kali. Menjalankannya di spreadsheet lama juga memperbaiki data Kelas/Jam yang terlanjur berubah jadi tanggal.
   - `migrateData()` bisa dijalankan sendiri kapan saja jika ada data lama yang rusak.

#### 1.3 Isi Data Contoh (Minimal)

**Students** (isi manual — data mahasiswa asli)
```
NPM         | Nama         | Semester | Kelas | Status
230411234   | Felisa Aziva | 5        | 5_1   | Aktif
```
> Kelas memakai **underscore**: `5_1`, `5_2`, `5_3`, `5_4`, `5_5`. Kolom sudah berformat teks, jadi tidak akan berubah jadi tanggal. Nilai lama `5.1` tetap dikenali dan dinormalisasi ke `5_1`.

**Courses** (diisi oleh `seedDatabase()`)
```
CourseID | MataKuliah                | Semester | Dosen
MK-RPL   | Rekayasa Perangkat Lunak  | 5        |
MK-BD    | Basis Data                | 5        |
MK-PWEB  | Pemrograman Web           | 5        |
```

**Schedules** — tidak perlu diisi manual; buat lewat menu **Kelola Jadwal** di aplikasi.

#### 1.4 Deploy Web App

1. **Deploy → New deployment**
2. Klik gerigi → pilih **Web app**
3. Konfigurasi:
   - **Description**: `Digital Attendance`
   - **Execute as**: **Me**
   - **Who has access**: **Anyone**
4. Klik **Deploy** → **Authorize** (Advanced → Go to unsafe → Allow)
5. **Copy Web App URL** — format: `https://script.google.com/macros/s/AKfycb.../exec`

#### 1.4b Setup Awal Kelas & Semester (BARU di v2.4.0)

Daftar kelas **tidak lagi di-hardcode**. Setelah deploy, dosen menyiapkannya sekali dari aplikasi:

1. Buka URL aplikasi. Pada instalasi baru muncul banner kuning **"Sistem belum disiapkan"** → tekan **Setup Awal (Dosen)** (atau tekan *Mulai Absensi*, otomatis diarahkan).
2. **Identitas** (opsional): program studi & tahun ajaran.
3. **Kelas per semester**: pilih semester 1–8 + kode kelas (mis. `A`, `1`) → **+**, atau **Buat cepat** (mis. semester 5 → `5_1` … `5_5`). Format kelas: `semester_kode` (`3_1`, `5_A`).
4. **Mata kuliah** per semester (bisa dilengkapi nanti).
5. **PIN Dosen** (opsional, 4–12 huruf/angka): melindungi halaman pengaturan dari mahasiswa.
6. **Simpan & Selesai** → mahasiswa sekarang bisa mendaftar dan memilih semester + kelas dari daftar itu.

Kelas disimpan di sheet `Classes`, pengaturan di sheet `Settings` (dibuat otomatis). Kelas yang sudah dipakai mahasiswa/jadwal/sesi **tidak bisa dihapus**, hanya dinonaktifkan. Pengaturan bisa dibuka lagi kapan saja lewat **Pengaturan Kelas & Semester (Dosen)**.

> **PIN bukan autentikasi penuh.** PIN hanya melindungi aksi pengaturan (kelas & mata kuliah). Sesi presensi, jadwal, dan rekap tetap tanpa login — sama seperti sebelumnya. Hash PIN (SHA-256) disimpan di sheet `Settings`; jangan bagikan akses edit spreadsheet.

#### 1.5a Memperbarui dari v2.3.0 / v2.2.0 ke v2.4.0

1. Tempel `code.gs` baru ke Apps Script (ganti seluruh isi, **pertahankan `SPREADSHEET_ID`** Anda).
2. Jalankan `seedDatabase()` sekali (aman diulang). Pada instalasi lama, kelas yang sudah dipakai data (`Students`/`Schedules`/`Sessions`) otomatis dipindah ke sheet `Classes` dan setup ditandai selesai — **tidak perlu Setup Awal ulang**. Tambah kelas/semester baru lewat Pengaturan.
3. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.** URL tidak berubah.
4. Upload `index.html` baru. Banner merah muncul bila versi backend bukan `2.4.0`.

#### 1.5 Memperbarui dari v2.2.0 ke v2.3.0 (riwayat)

1. Tempel `Code.gs` baru ke Apps Script (ganti seluruh isi, **pertahankan `SPREADSHEET_ID`** Anda).
2. Jalankan `seedDatabase()` sekali (aman diulang) — memastikan kolom `TerdaftarPada` & `Sumber` ada dan terkunci sebagai teks. Tanpa langkah ini kolom tetap ditambah otomatis saat request pertama.
3. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.** URL Web App tidak berubah.
4. Upload `index.html` baru ke GitHub. Jika versi backend belum sesuai, frontend menampilkan banner merah di atas halaman.

#### 1.6 Set Timezone

- Di spreadsheet: **File → Settings**
- **Time zone**: `(GMT+07:00) Jakarta`
- Save
- Lakukan hal yang sama di Apps Script: **Project Settings → Time zone → Asia/Jakarta**

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
2. Masukkan NPM → Masuk (login **bertahan** setelah refresh / tutup tab, sampai menekan "Keluar Akun")
   - NPM belum terdaftar → form **Daftar Mandiri** (Nama + Kelas) → langsung masuk
   - Jika kemudian akun dinonaktifkan atau dihapus dari sheet, sesi otomatis berakhir dengan pesan jelas; gangguan internet **tidak** pernah memicu logout
3. Dashboard tampil dengan ringkasan kehadiran
4. Buka tab "QR Saya" → QR tampil
5. Tunjukkan QR ke dosen untuk discan
```

### Alur Dosen

```
0. (Sekali saja) Setup Awal: kelas, semester, mata kuliah — lihat 1.4b
1. Buka URL GitHub Pages
2. Klik "Mulai Absensi" (kanan atas)
3. Isi form sesi: pilih semester → kelas & mata kuliah ikut terfilter (semester & kelas terakhir diingat di perangkat)
4. Klik "Mulai Sesi Presensi"
5. Izinkan akses kamera saat diminta
6. Arahkan kamera ke QR mahasiswa
7. Lihat monitor live update
8. Klik "Akhiri Sesi" setelah selesai
9. Export rekap jika diperlukan
```

### 📝 Daftar Mandiri (self-registration)

Mahasiswa yang NPM-nya belum ada di sheet `Students` dapat mendaftar sendiri:

```
Masukkan NPM → "NPM belum terdaftar" → isi Nama Lengkap + pilih Semester lalu Kelas (dari daftar yang disiapkan dosen) → Daftar & Masuk
```

Mahasiswa juga bisa memperbarui kelas/semester kapan saja (mis. naik semester) lewat **Profil → Ubah Kelas / Semester**. Bila kelasnya dihapus/dinonaktifkan dosen, ia diminta memilih ulang saat login berikutnya.

```
```

- Backend (`registerStudent`) menambah baris baru di `Students`: `Status = Aktif`, `Semester` diturunkan dari kelas (`5_1` → 5), `TerdaftarPada` = waktu server (Asia/Jakarta), `Sumber = Mandiri`.
- Baris yang diisi **manual** di Sheets dibiarkan kosong pada kedua kolom itu — dosen dapat memfilter `Sumber = Mandiri` untuk memeriksa pendaftar baru.
- **Ringkasan kehadiran pendaftar baru:** sesi `ENDED` yang *dimulai sebelum* `TerdaftarPada` tidak dihitung (tidak jadi alpha). Sesi yang sudah dihadiri tetap dihitung. Mahasiswa lama (kolom kosong) tidak berubah.
- **Rate limit:** maksimal **10 pendaftaran per menit** untuk seluruh pengguna; selebihnya ditolak `RATE_LIMITED` dan bisa dicoba lagi semenit kemudian.
- NPM sudah ada → `STUDENT_EXISTS` (frontend menyarankan menekan Masuk lagi).

### Kelola Jadwal (Dosen)

```
1. Klik "Kelola Jadwal" (kiri atas halaman awal, atau tombol di bawah form Pengaturan Sesi)
2. Filter per kelas bila perlu
3. Tekan "Tambah" → pilih mata kuliah, kelas (dari daftar), hari, jam mulai/selesai, ruang → Simpan
4. Ikon pensil = ubah, ikon tempat sampah = hapus
```

Validasi (di frontend **dan** backend): mata kuliah harus terdaftar, hari valid (Senin–Minggu), jam selesai harus setelah jam mulai, kelas harus salah satu kelas aktif di sheet `Classes`. Jadwal identik (mata kuliah + kelas + hari + jam mulai) ditolak.

---

## 🧪 Testing

### Test Cepat (5 menit)

| # | Aksi | Expected |
|---|---|---|
| 1 | Login NPM valid | Masuk dashboard dengan data benar |
| 2a | Login dengan NPM **belum terdaftar** (format valid, mis. `9999999`) | Membuka form **Daftar Mandiri** — *bukan* toast "Mahasiswa tidak ditemukan" seperti versi lama |
| 2b | Login dengan NPM berformat salah (huruf, <6 atau >20 digit) | Toast validasi, **tanpa** memanggil server |
| 2c | Isi form Daftar Mandiri | Masuk dashboard; sheet `Students` dapat baris baru dengan `TerdaftarPada` & `Sumber = Mandiri` |
| 2d | Daftar 11 kali dalam satu menit | Pendaftaran ke-11 ditolak (`RATE_LIMITED`) |
| 3 | Buat sesi sebagai dosen | Sesi aktif, scanner terbuka |
| 4 | Scan QR mahasiswa | Toast hijau + row baru di sheet `Attendance` |
| 5 | Scan QR yang sama lagi | Ditolak "sudah melakukan absensi" |
| 6 | Akhiri sesi | Rekap tampil |
| 7 | Export CSV | File terunduh |
| 8 | Refresh / tutup-buka tab setelah login | Tetap login, dashboard langsung tampil |
| 9 | Matikan internet lalu buka ulang | Tetap login (data cache), tidak logout |
| 9b | Ubah `Status` mahasiswa jadi `Nonaktif` di Sheets, tunggu >60 detik, buka ulang app | Otomatis keluar dengan pesan "akun tidak aktif" |
| 10 | Kelola Jadwal: tambah, ubah, hapus | Sheet `Schedules` ikut berubah |
| 11 | Ketik `5.1` manual di kolom Kelas lalu jalankan `seedDatabase()` | Berubah jadi teks `5_1` |

### Test Otomatis (Node.js, tanpa dependency)

Dari folder proyek (`code.gs` dan `backup/code.v2.2.0.gs` harus ada di tempatnya):

```bash
node tests/backend.test.js        # backend: Code.gs dimuat ke vm dengan mock Sheets/Cache/Lock
node tests/frontend.logic.test.js # logika frontend (validasi NPM, session recovery, polling, daftar kelas)
node tests/frontend.check.js      # node --check pada <script> inline index.html
```

Tes uji-asap end-to-end (opsional, butuh `jsdom`: `npm i jsdom`) ada di `tests/e2e.jsdom.test.js` — menjalankan frontend asli terhadap backend mock dari Setup Awal sampai mahasiswa daftar.

```bash
node tests/e2e.jsdom.test.js
```

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
- ✅ Rate limit pendaftaran mandiri (10/menit, global) + validasi format NPM di frontend **dan** backend

### Yang **BUKAN** Perlindungan ❌

- ❌ **Bukan autentikasi** — NPM-only, siapa tahu NPM bisa login
- ❌ **Bukan biometric** — **QR masih statis** (`ATTENDANCE|NPM`); screenshot bisa dipakai orang lain
- ❌ **Tidak ada PIN / autentikasi dosen** — siapa pun yang tahu URL dapat memanggil endpoint dosen
- ❌ **Daftar mandiri tidak memverifikasi identitas** — siapa pun bisa mendaftarkan NPM yang belum terpakai dengan nama apa saja; rate limit hanya meredam spam, bukan mencegah pemalsuan. Gunakan kolom `Sumber` untuk meninjau pendaftar baru
- ❌ **Bukan otorisasi role** — endpoint dosen dapat dipanggil siapa pun yang tahu URL
- ❌ **Bukan enkripsi end-to-end** — data via HTTPS tapi Google Sheets tetap plaintext

**Cocok untuk**: prototype, tugas akhir, kelas internal, lingkungan terpercaya.

**Tidak cocok untuk**: sistem produksi kampus skala besar tanpa modifikasi tambahan.

---

## ⚠️ Keterbatasan dan Catatan

| Keterbatasan | Detail |
|---|---|
| 🔔 **Notification** | Hanya jalan saat tab browser terbuka. Tidak ada Service Worker / PWA. |
| 📡 **Realtime** | Pakai **polling** 5 detik (berhenti otomatis saat tab tersembunyi, lanjut saat terlihat lagi), bukan WebSocket. |
| 🗄️ **Cache** | Lookup mahasiswa & daftar mata kuliah di-cache **60 detik** (`CacheService`). Perubahan **manual** di Google Sheets (mis. mengubah `Status`, `Kelas`, atau mata kuliah) bisa tertunda **≤ 60 detik**. Penulisan lewat aplikasi (mis. pendaftaran) langsung menginvalidasi cache. |
| 🌐 **CORS** | Memakai `Content-Type: text/plain` untuk menghindari preflight. |
| ⏱ **Quota Apps Script** | ~20.000 request/minggu, ~90 menit execution/hari (akun gratis). |
| 📱 **LocalStorage** | Per browser, per device. Pindah device = login ulang. Sesi hanya berakhir lewat tombol **Keluar Akun** atau jika data browser dihapus. |
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
<summary><b>Kelas di Sheets berubah jadi tanggal (mis. 5.1 → 1 Mei)</b></summary>

- Jalankan `seedDatabase()` (atau `migrateData()`) sekali — data lama dinormalisasi ke `5_1` dan kolom dikunci sebagai teks
- Gunakan format `5_1` … `5_5` saat mengisi kolom Kelas

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
<summary><b>Banner merah "Backend Apps Script belum versi terbaru"</b></summary>

- Tempel `Code.gs` terbaru, lalu **Deploy → Manage deployments → Edit → Version: New version**
- Menyimpan kode saja tidak cukup; Web App tetap menjalankan versi deploy lama

</details>

<details>
<summary><b>Pendaftaran ditolak "Terlalu banyak pendaftaran" (RATE_LIMITED)</b></summary>

- Batas 10 pendaftaran/menit berlaku untuk **semua** pengguna sekaligus; coba lagi setelah ±1 menit

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
| Kelas | String | `semester_kode`, mis. `5_1`, `3_A` (harus ada di sheet `Classes`) |
| Status | String | `Aktif` / `Nonaktif` |
| TerdaftarPada | Timestamp (teks) | `yyyy-MM-dd HH:mm:ss` Asia/Jakarta; diisi saat daftar mandiri, kosong untuk data manual |
| Sumber | String | `Mandiri` untuk daftar mandiri; kosong untuk data manual |

### Classes (v2.4.0)
| Kolom | Tipe | Keterangan |
|---|---|---|
| Kelas | String | Primary key, format `[1-8]_[A-Z0-9]{1,6}` |
| Semester | Number | Diturunkan dari kelas (`5_A` → 5) |
| Status | String | `Aktif` (atau kosong) / `Nonaktif` |

### Settings (v2.4.0)
| Key | Keterangan |
|---|---|
| `SETUP_DONE` | `TRUE` bila Setup Awal selesai |
| `PRODI`, `TAHUN_AJARAN` | Identitas (opsional) |
| `DOSEN_PIN_HASH` | SHA-256 PIN dosen (kosong = tanpa PIN) |

### Courses
| Kolom | Tipe | Keterangan |
|---|---|---|
| CourseID | String | Primary key, mis. `MK-RPL` |
| MataKuliah | String | Nama mata kuliah |
| Semester | Number | Semester |
| Dosen | String | Nama dosen pengampu (boleh kosong) |

### Schedules
| Kolom | Tipe | Keterangan |
|---|---|---|
| ScheduleID | String | Primary key |
| CourseID | String | FK ke Courses |
| Kelas | String | `5_1` … `5_5` |
| Hari | String | `Senin`..`Minggu` |
| JamMulai | String | `HH:mm` |
| JamSelesai | String | `HH:mm` (harus > JamMulai) |
| Ruang | String | Ruang kuliah (opsional, maks 50 karakter) |

### Sessions
| Kolom | Tipe | Keterangan |
|---|---|---|
| SessionID | String | Primary key, auto-generated |
| CourseID | String | FK ke Courses |
| Semester | Number | |
| Kelas | String | `5_1` … `5_5` |
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
| `ping` / `getVersion` | — | Cek backend & versi (`2.4.0`) |
| `getSetupStatus` | `{ admin? }` | Status setup, semester & kelas aktif (`admin:true` → semua kelas + jumlah mahasiswa) |
| `saveSetup` | `{ classes[], prodi?, tahunAjaran?, newPin?, pin? }` | Setup Awal / tambah kelas (idempotent). Perlu `pin` bila PIN sudah di-set |
| `setClassStatus` | `{ kelas, aktif, pin? }` | Aktif/nonaktifkan kelas |
| `deleteClass` | `{ kelas, pin? }` | Hapus kelas (ditolak `CLASS_IN_USE` bila dipakai) |
| `createCourse` / `deleteCourse` | `{ mataKuliah, semester, dosen?, pin? }` / `{ courseId, pin? }` | Kelola mata kuliah |
| `updateStudentClass` | `{ npm, kelas }` | Mahasiswa mengganti kelas/semester |
| `getStudent` | `{ npm }` | Ambil data mahasiswa |
| `registerStudent` | `{ npm, nama, kelas }` | Daftar mandiri (rate limit 10/menit) |
| `getCourses` | `{ semester? }` | Daftar mata kuliah |
| `getSchedules` | `{ semester, kelas }` | Jadwal per kelas (tampilan mahasiswa) |
| `getAllSchedules` | `{ kelas?, courseId?, hari? }` | Semua jadwal untuk Kelola Jadwal (terurut hari & jam) |
| `createSchedule` | `{ courseId, kelas, hari, jamMulai, jamSelesai, ruang? }` | Tambah jadwal |
| `updateSchedule` | `{ scheduleId, courseId?, kelas?, hari?, jamMulai?, jamSelesai?, ruang? }` | Ubah jadwal (field yang tidak dikirim tetap) |
| `deleteSchedule` | `{ scheduleId }` | Hapus jadwal |
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

**Catatan respons error.** Penolakan tertentu menyertakan `data.code` sehingga frontend dapat membedakan "ditolak server" dari "gagal koneksi". Kegagalan jaringan/timeout ditandai di sisi frontend dengan `networkError: true` dan tidak pernah memicu logout.

| Kode | Arti |
|---|---|
| `STUDENT_NOT_FOUND` | NPM tidak ada di `Students` (saat login → tawarkan daftar; saat sinkron di latar belakang → logout) |
| `STUDENT_INACTIVE` | Status bukan `Aktif` (saat sinkron di latar belakang → logout) |
| `STUDENT_EXISTS` | `registerStudent` dengan NPM yang sudah terdaftar |
| `INVALID_NPM` | `registerStudent` dengan NPM bukan 6–20 digit angka |
| `RATE_LIMITED` | Lebih dari 10 pendaftaran dalam satu menit |
| `SESSION_NOT_FOUND` | Sesi tidak ditemukan (`getSessionById`, `recordAttendance`) |
| `SESSION_NOT_ACTIVE` / `SESSION_OUT_OF_TIME` | `recordAttendance`: sesi tidak aktif / di luar jam sesi |
| `CLASS_MISMATCH` / `ALREADY_ATTENDED` | `recordAttendance`: kelas tidak cocok / sudah absen di sesi ini |

Penolakan lain (validasi input, `createSession`, jadwal, dst.) tetap berupa `success: false` dengan pesan teks tanpa kode.

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

Versi dokumen: 2.0.0

</div>
