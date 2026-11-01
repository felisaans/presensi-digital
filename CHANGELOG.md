# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/). Riwayat sebelum 2.2.0 tidak dicatat di sini.

## [2.4.0]

### Ditambahkan
- **Setup Awal kelas & semester** untuk dosen (wizard saat pertama kali, bisa dibuka lagi lewat *Pengaturan Kelas & Semester*): kelas bebas per semester 1–8 (`3_1`, `5_A`), "buat cepat" N kelas, mata kuliah per semester, identitas prodi/tahun ajaran.
- Sheet baru `Classes` dan `Settings` (dibuat otomatis). Daftar kelas dibaca dari server; `CLASS_LIST` (backend) dan `KELAS_LIST` (frontend) tidak lagi di-hardcode.
- Mahasiswa memilih **Semester → Kelas** dari daftar saat daftar mandiri; **Profil → Ubah Kelas / Semester** (`updateStudentClass`); diminta memilih ulang bila kelasnya sudah tidak ada/nonaktif.
- Form sesi dosen: semester dari daftar server, kelas & mata kuliah difilter per semester, semester/kelas terakhir diingat di perangkat.
- PIN dosen opsional (SHA-256, dibatasi 10 percobaan/menit) untuk aksi pengaturan; tanpa PIN perilaku seperti sebelumnya.
- Aksi API: `getSetupStatus`, `saveSetup`, `setClassStatus`, `deleteClass`, `createCourse`, `deleteCourse`, `updateStudentClass`. Kode penolakan baru: `CLASS_IN_USE`, `COURSE_IN_USE`, `COURSE_EXISTS`, `PIN_REQUIRED`, `PIN_INVALID`.
- Banner "Sistem belum disiapkan" di halaman utama bila Setup Awal belum dilakukan; cache daftar kelas di perangkat (tetap tampil saat offline).
- `code.gs` (v2.4.0) kini disertakan di repo; tes baru (backend 52, frontend 32) + uji end-to-end jsdom.

### Diubah
- `createSession`: semester diturunkan dari kelas (bukan input klien).
- Instalasi lama: `seedDatabase()` memigrasi kelas yang sudah dipakai data ke sheet `Classes` dan menandai setup selesai (tidak perlu Setup Awal ulang). Bila sheet `Classes` masih kosong, kelas diturunkan dari data secara virtual.
- Pesan "Belum ada mata kuliah" kini mengarah ke Pengaturan (bukan `seedDatabase()`).

### Catatan
- PIN hanya melindungi aksi pengaturan, bukan autentikasi penuh; sesi presensi/jadwal tetap tanpa login.
- Dokumen dan tes v2.3.0 sebelumnya mengacu `code.gs` yang tidak ada di ZIP; `code.gs` v2.4.0 disusun ulang dari `backup/code.v2.2.0.gs` + perilaku 2.3.0 (cache, rate limit, `TerdaftarPada`) dan seluruh tes 2.3.0 lolos.

## [2.3.0]

### Ditambahkan
- Kolom `TerdaftarPada` dan `Sumber` di sheet `Students` (ditambah otomatis pada sheet lama; kosong untuk data manual). Daftar mandiri mengisi `TerdaftarPada` (waktu server, Asia/Jakarta) dan `Sumber = Mandiri`.
- Rate limit `registerStudent`: maksimal 10 pendaftaran/menit (global) → penolakan `RATE_LIMITED`.
- Kode penolakan `INVALID_NPM` untuk NPM berformat salah di `registerStudent`.
- `recordAttendance`: tiap penolakan bisnis kini membawa `data.code` (`SESSION_NOT_FOUND`, `SESSION_NOT_ACTIVE`, `SESSION_OUT_OF_TIME`, `STUDENT_NOT_FOUND`, `STUDENT_INACTIVE`, `CLASS_MISMATCH`, `ALREADY_ATTENDED`); teks pesan tidak berubah.
- `isValidNpm` (6–20 digit angka) dipakai bersama oleh backend dan frontend; login menolak input salah **sebelum** memanggil API (+ `inputmode="numeric"`, spasi di-trim).
- Session recovery: sinkronisasi latar belakang melakukan logout dengan pesan jelas bila server menjawab `STUDENT_INACTIVE` / `STUDENT_NOT_FOUND`; gangguan jaringan tidak pernah logout. Perubahan kelas/semester memperbarui data lokal dan memuat ulang jadwal.
- `CONFIG.KELAS_LIST` + `populateKelasSelects()` sebagai satu-satunya sumber daftar kelas di frontend.
- Test otomatis Node.js (`tests/`) dan folder `backup/` berisi berkas v2.2.0.
- Komentar daftar isi di atas `<script>` pada `index.html`; `CHANGELOG.md`.

### Diubah
- Ringkasan kehadiran (`getAttendanceSummary`): sesi `ENDED` yang dimulai sebelum `TerdaftarPada` tidak dihitung untuk pendaftar baru (tidak jadi alpha). Sesi yang sudah dihadiri tetap dihitung; `TerdaftarPada` kosong → perilaku lama.
- Performa: `findRecordByValue`/`findRecordsByValue` membaca satu kolom lalu hanya baris yang cocok (bukan seluruh sheet); pengecekan duplikat `recordAttendance` hanya membaca baris `Attendance` milik sesi terkait.
- Cache `CacheService` TTL 60 detik untuk lookup mahasiswa per-NPM dan daftar `Courses` (tidak menyimpan nilai >100 KB; diinvalidasi saat penulisan). Perubahan manual di Sheets bisa tertunda ≤ 60 detik.
- Polling monitor dosen 3 dtk → 5 dtk; berhenti saat tab tersembunyi dan lanjut saat terlihat lagi.
- `APP_VERSION` dan `EXPECTED_BACKEND_VERSION` menjadi `2.3.0` (backend perlu di-deploy sebagai *New version*).

### Catatan keamanan (tidak berubah)
- QR masih statis (`ATTENDANCE|NPM`). Tidak ada PIN atau autentikasi dosen.
- Daftar mandiri tidak memverifikasi identitas; gunakan kolom `Sumber` untuk meninjau pendaftar.

## [2.2.0]

### Ditambahkan
- Daftar mandiri (self-registration): NPM yang belum ada di `Students` membuka form Nama + Kelas → action `registerStudent` menambah baris baru (`Status = Aktif`, `Semester` diturunkan dari kelas, mis. `5_1` → 5).
- Kode penolakan `STUDENT_EXISTS` untuk NPM yang sudah terdaftar.
