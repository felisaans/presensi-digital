# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/). Riwayat sebelum 2.2.0 tidak dicatat di sini.

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
