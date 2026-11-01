/* ============================================================
 * DIGITAL ATTENDANCE SYSTEM — GOOGLE APPS SCRIPT (v2.2.0)
 * ============================================================
 * Arsitektur: GitHub Pages (index.html) → Apps Script (file ini) → Google Sheets
 *
 * Cara pakai:
 *   1. Buat spreadsheet kosong (atau pakai yang sudah ada).
 *   2. Extensions → Apps Script → paste seluruh file ini ke Code.gs.
 *   3. Project Settings → Time zone: (GMT+07:00) Asia/Jakarta.
 *      Spreadsheet: File → Settings → Time zone: samakan (Asia/Jakarta).
 *   4. Simpan → jalankan  seedDatabase()  sekali → authorize.
 *      (aman dijalankan berulang kali / idempotent)
 *   5. Deploy → New deployment → Web app
 *      Execute as: Me | Who has access: Anyone
 *   6. Copy Web App URL → isi CONFIG.API_URL di index.html.
 *
 * Format kelas: 5_1, 5_2, 5_3, 5_4, 5_5 (underscore, bukan titik).
 * ============================================================ */

/* ============================================================
 * 1. CONFIG
 * ============================================================ */
const SPREADSHEET_ID = '1p6pKwugoqQmIcU0Gz2fvf_2mUA4Fe_uHIIdyGXTcctU'; // Kosongkan jika script dibuat dari dalam spreadsheet
const APP_VERSION = '2.2.0';
// Zona waktu tetap untuk semua perhitungan jam/tanggal (tidak bergantung setting spreadsheet).
const APP_TIMEZONE = 'Asia/Jakarta';

// Header baris 1 — HARUS persis seperti ini.
const SHEETS = {
  Students:   ['NPM', 'Nama', 'Semester', 'Kelas', 'Status'],
  Courses:    ['CourseID', 'MataKuliah', 'Semester', 'Dosen'],
  Schedules:  ['ScheduleID', 'CourseID', 'Kelas', 'Hari', 'JamMulai', 'JamSelesai', 'Ruang'],
  Sessions:   ['SessionID', 'CourseID', 'Semester', 'Kelas', 'Pertemuan', 'Tanggal', 'JamMulai', 'JamSelesai', 'Status'],
  Attendance: ['AttendanceID', 'SessionID', 'NPM', 'WaktuScan', 'Status'],
  Reminders:  ['ReminderID', 'NPM', 'CourseID', 'Hari', 'Jam', 'MenitSebelum', 'Aktif']
};

// Tipe kolom → menentukan cara normalisasi saat membaca dari Sheets.
// Kolom yang tidak terdaftar dianggap 'text'.
const COLUMN_TYPES = {
  Kelas: 'kelas',
  JamMulai: 'time',
  JamSelesai: 'time',
  Jam: 'time',
  Tanggal: 'date',
  WaktuScan: 'datetime',
  Semester: 'number',
  Pertemuan: 'number',
  MenitSebelum: 'number',
  Aktif: 'bool'
};

// Daftar kelas resmi (struktur kelas semester 5).
const CLASS_LIST = ['5_1', '5_2', '5_3', '5_4', '5_5'];

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

const SESSION_STATUS = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED'
};

const ATTENDANCE_STATUS = {
  HADIR: 'HADIR',
  TERLAMBAT: 'TERLAMBAT',
  IZIN: 'IZIN',
  SAKIT: 'SAKIT',
  ALPHA: 'ALPHA'
};

// Toleransi keterlambatan (menit) dari JamMulai session
const LATE_THRESHOLD_MINUTES = 10;

// Action yang mengubah data → dijalankan di dalam lock agar tidak tabrakan.
const WRITE_ACTIONS = {
  createSession: true, endSession: true, recordAttendance: true,
  createReminder: true, updateReminder: true, deleteReminder: true,
  createSchedule: true, updateSchedule: true, deleteSchedule: true,
  registerStudent: true
};

/* ============================================================
 * 2. SPREADSHEET & TIMEZONE HELPERS
 * ============================================================ */
var _SS = null;
var _TZ = null;
var _ENSURED = {};

function getSpreadsheet() {
  if (_SS) return _SS;
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') {
    _SS = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    return _SS;
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('Spreadsheet tidak ditemukan. Isi SPREADSHEET_ID atau gunakan bound script.');
  _SS = active;
  return _SS;
}

// Timezone yang dipakai untuk membaca/menulis tanggal & jam.
function getTz() {
  if (_TZ) return _TZ;
  if (APP_TIMEZONE) { _TZ = APP_TIMEZONE; return _TZ; }
  try { _TZ = getSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }
  catch (e) { _TZ = Session.getScriptTimeZone(); }
  return _TZ;
}

function getSheet(sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet "' + sheetName + '" tidak ditemukan. Jalankan seedDatabase() dahulu.');
  ensureColumns(sheet, sheetName);
  return sheet;
}

// Self-heal ringan: pastikan jumlah kolom cukup & header kosong terisi
// (mis. sheet MVP lama belum punya kolom Dosen / Ruang).
function ensureColumns(sheet, sheetName) {
  if (_ENSURED[sheetName]) return;
  const headers = SHEETS[sheetName];
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  let changed = false;
  const merged = headers.map(function (h, i) {
    if (current[i] === '' || current[i] === null) { changed = true; return h; }
    return current[i];
  });
  if (changed) sheet.getRange(1, 1, 1, headers.length).setValues([merged]);
  _ENSURED[sheetName] = true;
}

/* ============================================================
 * 3. NORMALISASI DATA (inti perbaikan bug Date / tipe data)
 * ============================================================ */
function pad2(n) { return (n < 10 ? '0' : '') + n; }

/**
 * Kelas → selalu string "5_1".
 * - Date (Sheets mengubah 5.1 jadi 1 Mei)  → bulan_tanggal → "5_1"
 * - number 5.1                              → "5_1"
 * - string "5.1" / "5-1" / "5 1" / "5_1"    → "5_1"
 */
function normalizeKelas(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return Utilities.formatDate(value, getTz(), 'M_d');
  if (typeof value === 'number') return String(value).replace('.', '_');
  return String(value).trim().replace(/[.\-\/\s]+/g, '_').toUpperCase();
}

function isValidKelas(kelas) {
  return CLASS_LIST.indexOf(kelas) !== -1;
}

function parseTimeString(s) {
  s = String(s === null || s === undefined ? '' : s).trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (m[3]) {
    const pm = /p/i.test(m[3]);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  if (h > 23 || mi > 59) return '';
  return pad2(h) + ':' + pad2(mi);
}

/**
 * Jam → "HH:mm".
 * Sheets sering mengubah "08:00" jadi Date (tahun 1899) atau angka pecahan hari.
 * Untuk Date kita pakai teks yang tampil di sel (display) supaya tidak kena
 * selisih offset zona waktu historis 1899.
 */
function normalizeTime(value, display) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    const fromDisplay = display ? parseTimeString(display) : '';
    if (fromDisplay) return fromDisplay;
    return Utilities.formatDate(value, getTz(), 'HH:mm');
  }
  if (typeof value === 'number') {
    if (value >= 0 && value < 1) {
      const total = Math.round(value * 1440);
      return pad2(Math.floor(total / 60) % 24) + ':' + pad2(total % 60);
    }
    return String(value);
  }
  return parseTimeString(value) || String(value).trim();
}

function parseMinutes(hhmm) {
  const t = parseTimeString(hhmm);
  if (!t) return null;
  const p = t.split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

/** Tanggal → "yyyy-MM-dd". */
function toISODate(value) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, getTz(), 'yyyy-MM-dd');
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.substring(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const p = str.split('/');
    return p[2] + '-' + p[1] + '-' + p[0];
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, getTz(), 'yyyy-MM-dd');
  return str;
}

/** WaktuScan → "yyyy-MM-dd HH:mm:ss" (Sheets sering mengubahnya jadi Date). */
function normalizeDateTime(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return Utilities.formatDate(value, getTz(), 'yyyy-MM-dd HH:mm:ss');
  return String(value).trim();
}

function normalizeBool(value) {
  if (value === true) return 'TRUE';
  if (value === false || value === '' || value === null || value === undefined) return 'FALSE';
  return String(value).trim().toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
}

function normalizeDay(value) {
  const s = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  for (let i = 0; i < DAYS.length; i++) {
    if (DAYS[i].toLowerCase() === s) return DAYS[i];
  }
  if (s === "jum'at" || s === 'jumat') return 'Jumat';
  return '';
}

function cleanCell(type, value, display) {
  switch (type) {
    case 'kelas':    return normalizeKelas(value);
    case 'time':     return normalizeTime(value, display);
    case 'date':     return toISODate(value);
    case 'datetime': return normalizeDateTime(value);
    case 'bool':     return normalizeBool(value);
    case 'number':
      if (value === '' || value === null || value === undefined) return '';
      return isNaN(Number(value)) ? String(value) : Number(value);
    default:
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return display ? String(display).trim() : Utilities.formatDate(value, getTz(), 'yyyy-MM-dd');
      return String(value).trim();
  }
}

/* ============================================================
 * 4. GENERIC RECORD HELPERS
 * ============================================================ */
function getAllRecords(sheetName) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const headers = SHEETS[sheetName];
  const range = sheet.getRange(2, 1, lastRow - 1, headers.length);
  const values = range.getValues();
  let display = null;
  const out = [];

  values.forEach(function (row, idx) {
    const blank = row.every(function (c) { return c === '' || c === null; });
    if (blank) return;
    const obj = { _row: idx + 2 };
    headers.forEach(function (h, i) {
      const type = COLUMN_TYPES[h] || 'text';
      const raw = row[i];
      let disp = '';
      if (raw instanceof Date) {
        if (!display) display = range.getDisplayValues();
        disp = display[idx][i];
      }
      obj[h] = cleanCell(type, raw, disp);
    });
    out.push(obj);
  });
  return out;
}

function findRecordsByValue(sheetName, columnName, value) {
  const target = String(value);
  return getAllRecords(sheetName).filter(function (r) {
    return String(r[columnName]) === target;
  });
}

function findRecordByValue(sheetName, columnName, value) {
  const list = findRecordsByValue(sheetName, columnName, value);
  return list.length ? list[0] : null;
}

// Format sel per kolom: teks polos ('@') supaya Sheets tidak auto-convert.
function columnFormats(sheetName) {
  return SHEETS[sheetName].map(function (h) {
    return COLUMN_TYPES[h] === 'number' ? '0' : '@';
  });
}

function appendRecord(sheetName, record) {
  const sheet = getSheet(sheetName);
  const headers = SHEETS[sheetName];
  const row = headers.map(function (h) {
    return record[h] !== undefined && record[h] !== null ? record[h] : '';
  });
  const target = sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length);
  target.setNumberFormats([columnFormats(sheetName)]);
  target.setValues([row]);
  return row;
}

function updateRecord(sheetName, rowNumber, patch) {
  const sheet = getSheet(sheetName);
  const headers = SHEETS[sheetName];
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  const current = range.getValues()[0];
  const merged = headers.map(function (h, i) {
    return patch[h] !== undefined ? patch[h] : current[i];
  });
  range.setNumberFormats([columnFormats(sheetName)]);
  range.setValues([merged]);
  return merged;
}

/* ============================================================
 * 5. UTILITIES
 * ============================================================ */
function generateId(prefix) {
  const ts = new Date().getTime().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return prefix + '-' + ts + '-' + rand;
}

function nowString() {
  return Utilities.formatDate(new Date(), getTz(), 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Validasi waktu sesi (dihitung di timezone spreadsheet, bukan timezone server).
 * Return { ok: true, status: 'HADIR'|'TERLAMBAT' } atau { ok:false, message }
 */
function computeSessionTiming(session) {
  const dateISO = toISODate(session.Tanggal);
  const start = parseMinutes(session.JamMulai);
  const end = parseMinutes(session.JamSelesai);
  if (!dateISO) return { ok: false, message: 'Tanggal sesi tidak valid' };
  if (start === null || end === null) return { ok: false, message: 'Waktu sesi tidak valid' };

  const tz = getTz();
  const now = new Date();
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const hms = Utilities.formatDate(now, tz, 'HH:mm:ss').split(':').map(Number);
  const nowMin = hms[0] * 60 + hms[1] + hms[2] / 60;

  const clock = Utilities.formatDate(now, tz, 'HH:mm');
  const info = ' (sesi: ' + dateISO + ' ' + String(session.JamMulai) + '–' + String(session.JamSelesai) +
               ', waktu server: ' + today + ' ' + clock + ' ' + tz + ')';
  if (today < dateISO) return { ok: false, message: 'Sesi belum dimulai' + info };
  if (today > dateISO) return { ok: false, message: 'Sesi sudah berakhir' + info };
  if (nowMin < start) return { ok: false, message: 'Sesi belum dimulai' + info };
  if (nowMin > end) return { ok: false, message: 'Sesi sudah berakhir' + info };

  const status = (nowMin - start) <= LATE_THRESHOLD_MINUTES ? ATTENDANCE_STATUS.HADIR : ATTENDANCE_STATUS.TERLAMBAT;
  return { ok: true, status: status };
}

/* ============================================================
 * 6. RESPONSE HELPERS  —  format tetap: { success, message, data }
 * ============================================================ */
function successResponse(message, data) {
  return { success: true, message: message || 'OK', data: data === undefined ? null : data };
}
function errorResponse(message, data) {
  return { success: false, message: message || 'Terjadi kesalahan', data: data === undefined ? null : data };
}
// Error penolakan bisnis: data.code membantu frontend membedakan
// "ditolak server" dari "gagal koneksi".
function rejectResponse(code, message) {
  return errorResponse(message, { code: code });
}

/* ============================================================
 * 7. SETUP, MIGRASI & SEEDER
 * ============================================================ */

/** Buat sheet + header baris 1 persis sesuai skema (idempotent). */
function setupDatabase() {
  const ss = getSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const headers = SHEETS[name];
    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setNumberFormat('@');
    range.setValues([headers]);
    range.setFontWeight('bold');
    sheet.setFrozenRows(1);
    _ENSURED[name] = true;
  });

  // Penting: migrasi data lama DULU (selagi nilai Date masih terbaca sebagai Date),
  // baru setelah itu format kolom dikunci jadi teks.
  migrateData();
  Object.keys(SHEETS).forEach(applyColumnFormats);

  Logger.log('setupDatabase() selesai.');
  return true;
}

function applyColumnFormats(sheetName) {
  const sheet = getSheet(sheetName);
  const formats = columnFormats(sheetName);
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  formats.forEach(function (f, i) {
    sheet.getRange(2, i + 1, rows, 1).setNumberFormat(f);
  });
}

/**
 * Rapikan data lama yang sudah terlanjur rusak:
 * Kelas (Date/angka → "5_1"), Jam (Date → "HH:mm"), Tanggal, WaktuScan, Aktif.
 * Idempotent — aman dijalankan berulang kali.
 */
function migrateData() {
  let fixed = 0;
  Object.keys(SHEETS).forEach(function (name) {
    const sheet = getSheet(name);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const headers = SHEETS[name];
    const recs = getAllRecords(name);
    const byRow = {};
    recs.forEach(function (r) { byRow[r._row] = r; });

    headers.forEach(function (h, i) {
      const type = COLUMN_TYPES[h];
      if (!type || type === 'number') return;
      const range = sheet.getRange(2, i + 1, lastRow - 1, 1);
      const before = range.getValues();
      const after = before.map(function (cell, idx) {
        const r = byRow[idx + 2];
        return [r ? r[h] : ''];
      });
      let differs = false;
      for (let k = 0; k < after.length; k++) {
        if (String(before[k][0]) !== String(after[k][0])) { differs = true; fixed++; }
      }
      if (differs) {
        range.setNumberFormat('@');
        range.setValues(after);
      }
    });
  });
  Logger.log('migrateData() selesai. Sel diperbaiki: ' + fixed);
  return fixed;
}

/**
 * Seeder idempotent:
 *  - struktur 6 sheet + header + format teks
 *  - migrasi data lama
 *  - Course MK-RPL (terisi) + placeholder MK-BD & MK-PWEB
 *  - struktur kelas 5_1 … 5_5 (CLASS_LIST)
 * Data mahasiswa asli diisi manual di sheet Students.
 */
function seedDatabase() {
  setupDatabase();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const courses = [
      { CourseID: 'MK-RPL',  MataKuliah: 'Rekayasa Perangkat Lunak', Semester: 5, Dosen: '' },
      { CourseID: 'MK-BD',   MataKuliah: 'Basis Data',               Semester: 5, Dosen: '' },
      { CourseID: 'MK-PWEB', MataKuliah: 'Pemrograman Web',          Semester: 5, Dosen: '' }
    ];
    const existing = {};
    getAllRecords('Courses').forEach(function (c) { existing[c.CourseID] = true; });

    let added = 0;
    courses.forEach(function (c) {
      if (existing[c.CourseID]) return;
      appendRecord('Courses', c);
      added++;
    });

    Logger.log('seedDatabase() selesai. Course baru: ' + added +
               ' | Kelas terdaftar: ' + CLASS_LIST.join(', '));
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
  return true;
}

/* ============================================================
 * 8. ACTION HANDLERS — STUDENT / COURSE / SCHEDULE (READ)
 * ============================================================ */

function handleGetStudent(data) {
  const npm = String(data.npm || '').trim();
  if (!npm) return errorResponse('NPM wajib diisi');
  const student = findRecordByValue('Students', 'NPM', npm);
  if (!student) return rejectResponse('STUDENT_NOT_FOUND', 'Mahasiswa tidak ditemukan');
  if (String(student.Status).toLowerCase() !== 'aktif') return rejectResponse('STUDENT_INACTIVE', 'Mahasiswa tidak aktif');
  return successResponse('OK', {
    npm: String(student.NPM),
    nama: String(student.Nama),
    semester: student.Semester,
    kelas: String(student.Kelas),
    status: String(student.Status)
  });
}

/**
 * Daftar mandiri: NPM yang belum ada di sheet Students ditambahkan sebagai
 * baris baru (Status Aktif). Semester diambil dari kelas (5_1 → 5).
 * Dijalankan di dalam lock (lihat WRITE_ACTIONS), jadi cek duplikat aman.
 */
function handleRegisterStudent(data) {
  const npm = String(data.npm || '').trim();
  // Buang karakter pembuka rumus agar nama tidak dibaca sebagai formula di Sheets.
  const nama = String(data.nama || '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '').trim();
  const kelas = normalizeKelas(data.kelas);

  if (!npm) return errorResponse('NPM wajib diisi');
  if (!/^\d{6,20}$/.test(npm)) return errorResponse('NPM harus berupa angka (6–20 digit)');
  if (nama.length < 3) return errorResponse('Nama wajib diisi (minimal 3 karakter)');
  if (nama.length > 100) return errorResponse('Nama maksimal 100 karakter');
  if (!kelas) return errorResponse('Kelas wajib diisi');
  if (!isValidKelas(kelas)) return errorResponse('Kelas tidak valid. Gunakan: ' + CLASS_LIST.join(', '));

  if (findRecordByValue('Students', 'NPM', npm)) {
    return rejectResponse('STUDENT_EXISTS', 'NPM sudah terdaftar. Silakan masuk dengan NPM tersebut.');
  }

  const semester = Number(kelas.split('_')[0]);
  appendRecord('Students', { NPM: npm, Nama: nama, Semester: semester, Kelas: kelas, Status: 'Aktif' });

  return successResponse('Pendaftaran berhasil', {
    npm: npm, nama: nama, semester: semester, kelas: kelas, status: 'Aktif'
  });
}

function handleGetCourses(data) {
  const semester = String(data.semester || '').trim();
  let list = getAllRecords('Courses');
  if (semester) list = list.filter(function (c) { return String(c.Semester) === semester; });
  return successResponse('OK', list.map(function (c) {
    return {
      courseId: String(c.CourseID),
      mataKuliah: String(c.MataKuliah),
      semester: c.Semester,
      dosen: String(c.Dosen || '')
    };
  }));
}

function buildCourseMap() {
  const map = {};
  getAllRecords('Courses').forEach(function (c) { map[String(c.CourseID)] = c; });
  return map;
}

function scheduleToDto(s, courseMap) {
  const c = courseMap[String(s.CourseID)] || {};
  return {
    scheduleId: String(s.ScheduleID),
    courseId: String(s.CourseID),
    mataKuliah: String(c.MataKuliah || ''),
    dosen: String(c.Dosen || ''),
    kelas: String(s.Kelas),
    hari: String(s.Hari),
    jamMulai: String(s.JamMulai),
    jamSelesai: String(s.JamSelesai),
    ruang: String(s.Ruang || '')
  };
}

function sortSchedules(list) {
  return list.sort(function (a, b) {
    const da = DAYS.indexOf(a.hari), db = DAYS.indexOf(b.hari);
    if (da !== db) return (da === -1 ? 99 : da) - (db === -1 ? 99 : db);
    const ta = parseMinutes(a.jamMulai), tb = parseMinutes(b.jamMulai);
    return (ta === null ? 0 : ta) - (tb === null ? 0 : tb);
  });
}

function handleGetSchedules(data) {
  const semester = String(data.semester || '').trim();
  const kelas = normalizeKelas(data.kelas);
  const courseMap = buildCourseMap();

  let list = getAllRecords('Schedules');
  if (kelas) list = list.filter(function (s) { return String(s.Kelas) === kelas; });
  if (semester) {
    list = list.filter(function (s) {
      const c = courseMap[String(s.CourseID)];
      return c && String(c.Semester) === semester;
    });
  }
  return successResponse('OK', sortSchedules(list.map(function (s) { return scheduleToDto(s, courseMap); })));
}

function handleGetAttendanceHistory(data) {
  const npm = String(data.npm || '').trim();
  if (!npm) return errorResponse('NPM wajib diisi');

  const sessionMap = {};
  getAllRecords('Sessions').forEach(function (s) { sessionMap[String(s.SessionID)] = s; });
  const courseMap = buildCourseMap();

  const records = findRecordsByValue('Attendance', 'NPM', npm);

  const result = records.map(function (a) {
    const s = sessionMap[String(a.SessionID)] || {};
    const c = courseMap[String(s.CourseID)] || {};
    return {
      attendanceId: String(a.AttendanceID),
      sessionId: String(a.SessionID),
      courseId: String(s.CourseID || ''),
      mataKuliah: String(c.MataKuliah || ''),
      pertemuan: s.Pertemuan || '',
      tanggal: toISODate(s.Tanggal),
      jamMulai: String(s.JamMulai || ''),
      waktuScan: String(a.WaktuScan || ''),
      status: String(a.Status || '')
    };
  });

  result.sort(function (a, b) { return String(b.waktuScan).localeCompare(String(a.waktuScan)); });
  return successResponse('OK', result);
}

function handleGetAttendanceSummary(data) {
  const npm = String(data.npm || '').trim();
  if (!npm) return errorResponse('NPM wajib diisi');

  const student = findRecordByValue('Students', 'NPM', npm);
  if (!student) return rejectResponse('STUDENT_NOT_FOUND', 'Mahasiswa tidak ditemukan');
  const kelas = String(student.Kelas);

  const allSessions = getAllRecords('Sessions');
  const records = findRecordsByValue('Attendance', 'NPM', npm);

  let hadir = 0, terlambat = 0, izin = 0, sakit = 0;
  const sessionIdsWithAttendance = {};

  records.forEach(function (a) {
    const st = String(a.Status).toUpperCase();
    if (st === 'HADIR') hadir++;
    else if (st === 'TERLAMBAT') terlambat++;
    else if (st === 'IZIN') izin++;
    else if (st === 'SAKIT') sakit++;
    sessionIdsWithAttendance[String(a.SessionID)] = true;
  });

  const relevant = allSessions.filter(function (s) {
    const st = String(s.Status).toUpperCase();
    return (st === 'ENDED' && String(s.Kelas) === kelas) || sessionIdsWithAttendance[String(s.SessionID)];
  });

  const total = relevant.length;
  const recorded = hadir + terlambat + izin + sakit;
  const alpha = Math.max(0, total - recorded);
  const persentase = total > 0 ? Math.round(((hadir + terlambat) / total) * 100) : 0;

  return successResponse('OK', {
    total: total, hadir: hadir, terlambat: terlambat,
    izin: izin, sakit: sakit, alpha: alpha, persentase: persentase
  });
}

function handleGetReminders(data) {
  const npm = String(data.npm || '').trim();
  if (!npm) return errorResponse('NPM wajib diisi');

  const courseMap = buildCourseMap();
  const list = findRecordsByValue('Reminders', 'NPM', npm);
  return successResponse('OK', list.map(function (r) {
    const c = courseMap[String(r.CourseID)] || {};
    return {
      reminderId: String(r.ReminderID),
      npm: String(r.NPM),
      courseId: String(r.CourseID),
      mataKuliah: String(c.MataKuliah || ''),
      hari: String(r.Hari || ''),
      jam: String(r.Jam || ''),
      menitSebelum: Number(r.MenitSebelum || 0),
      aktif: String(r.Aktif) === 'TRUE'
    };
  }));
}

function handleGetClassStudents(data) {
  const semester = String(data.semester || '').trim();
  const kelas = normalizeKelas(data.kelas);
  if (!kelas) return errorResponse('Kelas wajib diisi');

  // Kelas (mis. 5_1) sudah menentukan semester; semester TIDAK dipakai sebagai filter
  // agar salah pilih semester di form tidak mengosongkan daftar mahasiswa.
  let list = getAllRecords('Students');
  list = list.filter(function (s) { return String(s.Kelas) === kelas; });
  list = list.filter(function (s) { return String(s.Status).toLowerCase() === 'aktif'; });

  return successResponse('OK', list.map(function (s) {
    return { npm: String(s.NPM), nama: String(s.Nama), semester: s.Semester, kelas: String(s.Kelas) };
  }));
}

/* ============================================================
 * 9. ACTION HANDLERS — SESSION & ATTENDANCE
 * ============================================================ */

function sessionToDto(s) {
  return {
    sessionId: String(s.SessionID),
    courseId: String(s.CourseID),
    semester: s.Semester,
    kelas: String(s.Kelas),
    pertemuan: s.Pertemuan,
    tanggal: toISODate(s.Tanggal),
    jamMulai: String(s.JamMulai),
    jamSelesai: String(s.JamSelesai),
    status: String(s.Status)
  };
}

function handleGetSessionById(data) {
  const sessionId = String(data.sessionId || '').trim();
  if (!sessionId) return errorResponse('SessionID wajib diisi');
  const session = findRecordByValue('Sessions', 'SessionID', sessionId);
  if (!session) return rejectResponse('SESSION_NOT_FOUND', 'Sesi tidak ditemukan');
  return successResponse('OK', sessionToDto(session));
}

/**
 * Tutup otomatis sesi ACTIVE yang sudah lewat (tanggal lampau, atau jam selesai terlewati).
 * Mencegah sesi "menggantung" yang memblokir pembuatan sesi berikutnya.
 */
function autoCloseExpiredSessions() {
  const tz = getTz();
  const now = new Date();
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const hms = Utilities.formatDate(now, tz, 'HH:mm:ss').split(':').map(Number);
  const nowMin = hms[0] * 60 + hms[1] + hms[2] / 60;
  let closed = 0;
  getAllRecords('Sessions').forEach(function (s) {
    if (String(s.Status).toUpperCase() !== SESSION_STATUS.ACTIVE) return;
    const d = toISODate(s.Tanggal);
    const end = parseMinutes(s.JamSelesai);
    const expired = !d || (d < today) || (d === today && end !== null && nowMin > end);
    if (expired) { updateRecord('Sessions', s._row, { Status: SESSION_STATUS.ENDED }); closed++; }
  });
  return closed;
}

function handleCreateSession(data) {
  const courseId = String(data.courseId || '').trim();
  const semester = String(data.semester || '').trim();
  const kelas = normalizeKelas(data.kelas);
  const pertemuan = Number(data.pertemuan);
  const tanggal = toISODate(data.tanggal);
  const jamMulai = normalizeTime(String(data.jamMulai || '').trim());
  const jamSelesai = normalizeTime(String(data.jamSelesai || '').trim());

  if (!courseId) return errorResponse('CourseID wajib diisi');
  if (!semester) return errorResponse('Semester wajib diisi');
  if (!kelas) return errorResponse('Kelas wajib diisi');
  if (!isValidKelas(kelas)) return errorResponse('Kelas tidak valid. Gunakan: ' + CLASS_LIST.join(', '));
  if (!pertemuan || pertemuan < 1) return errorResponse('Pertemuan tidak valid');
  if (!tanggal) return errorResponse('Tanggal wajib diisi');
  if (parseMinutes(jamMulai) === null) return errorResponse('JamMulai tidak valid');
  if (parseMinutes(jamSelesai) === null) return errorResponse('JamSelesai tidak valid');
  if (parseMinutes(jamSelesai) <= parseMinutes(jamMulai)) return errorResponse('Jam selesai harus setelah jam mulai');

  const course = findRecordByValue('Courses', 'CourseID', courseId);
  if (!course) return errorResponse('Mata kuliah tidak ditemukan');

  // Sesi ACTIVE yang waktunya sudah lewat (lupa diakhiri) ditutup otomatis.
  autoCloseExpiredSessions();

  const sameClass = getAllRecords('Sessions').filter(function (s) {
    return String(s.CourseID) === courseId && String(s.Kelas) === kelas;
  });
  const existing = sameClass.find(function (s) {
    return String(s.Status).toUpperCase() === SESSION_STATUS.ACTIVE;
  });
  if (existing) {
    return errorResponse('Sudah ada sesi aktif untuk mata kuliah dan kelas ini. Akhiri sesi sebelumnya terlebih dahulu.');
  }
  const dupPertemuan = sameClass.find(function (s) {
    return Number(s.Pertemuan) === pertemuan && String(s.Status).toUpperCase() !== SESSION_STATUS.CANCELLED;
  });
  if (dupPertemuan) {
    return errorResponse('Pertemuan ' + pertemuan + ' untuk mata kuliah dan kelas ini sudah pernah dibuat. Gunakan nomor pertemuan berikutnya (' +
      (Math.max.apply(null, sameClass.map(function (s) { return Number(s.Pertemuan) || 0; })) + 1) + ').');
  }

  const sessionId = generateId('SES');
  appendRecord('Sessions', {
    SessionID: sessionId, CourseID: courseId, Semester: Number(semester) || semester, Kelas: kelas,
    Pertemuan: pertemuan, Tanggal: tanggal, JamMulai: jamMulai, JamSelesai: jamSelesai,
    Status: SESSION_STATUS.ACTIVE
  });

  return successResponse('Sesi berhasil dibuat', {
    sessionId: sessionId, courseId: courseId, semester: Number(semester) || semester, kelas: kelas,
    pertemuan: pertemuan, tanggal: tanggal, jamMulai: jamMulai, jamSelesai: jamSelesai,
    status: SESSION_STATUS.ACTIVE
  });
}

function handleGetActiveSession(data) {
  const courseId = String(data.courseId || '').trim();
  const kelas = normalizeKelas(data.kelas);
  if (!courseId) return errorResponse('CourseID wajib diisi');
  if (!kelas) return errorResponse('Kelas wajib diisi');

  const active = getAllRecords('Sessions').find(function (s) {
    return String(s.CourseID) === courseId &&
           String(s.Kelas) === kelas &&
           String(s.Status).toUpperCase() === SESSION_STATUS.ACTIVE;
  });
  if (!active) return successResponse('Tidak ada sesi aktif', null);
  return successResponse('OK', sessionToDto(active));
}

function handleRecordAttendance(data) {
  const sessionId = String(data.sessionId || '').trim();
  const npm = String(data.npm || '').trim();
  if (!sessionId) return errorResponse('SessionID wajib diisi');
  if (!npm) return errorResponse('NPM wajib diisi');

  const session = findRecordByValue('Sessions', 'SessionID', sessionId);
  if (!session) return errorResponse('Sesi tidak ditemukan');
  if (String(session.Status).toUpperCase() !== SESSION_STATUS.ACTIVE) {
    return errorResponse('Sesi absensi sudah tidak aktif');
  }

  const timing = computeSessionTiming(session);
  if (!timing.ok) return errorResponse(timing.message);

  const student = findRecordByValue('Students', 'NPM', npm);
  if (!student) return errorResponse('Mahasiswa tidak ditemukan');
  if (String(student.Status).toLowerCase() !== 'aktif') return errorResponse('Mahasiswa tidak aktif');
  // Kedua sisi sudah dinormalisasi ke format "5_1" oleh getAllRecords().
  if (String(student.Kelas) !== String(session.Kelas)) {
    return errorResponse('Mahasiswa bukan bagian dari kelas ini');
  }

  const dupe = findRecordsByValue('Attendance', 'SessionID', sessionId)
    .filter(function (a) { return String(a.NPM) === npm; });
  if (dupe.length > 0) return errorResponse('Mahasiswa sudah melakukan absensi pada sesi ini');

  const waktuScan = nowString();
  const attendanceId = generateId('ATT');

  appendRecord('Attendance', {
    AttendanceID: attendanceId, SessionID: sessionId, NPM: npm,
    WaktuScan: waktuScan, Status: timing.status
  });

  return successResponse('Absensi berhasil', {
    attendanceId: attendanceId, sessionId: sessionId, npm: npm,
    nama: String(student.Nama), kelas: String(student.Kelas),
    status: timing.status, waktuScan: waktuScan
  });
}

function handleGetSessionAttendance(data) {
  const sessionId = String(data.sessionId || '').trim();
  if (!sessionId) return errorResponse('SessionID wajib diisi');

  const session = findRecordByValue('Sessions', 'SessionID', sessionId);
  if (!session) return errorResponse('Sesi tidak ditemukan');

  const studentMap = {};
  getAllRecords('Students').forEach(function (s) { studentMap[String(s.NPM)] = s; });

  const records = findRecordsByValue('Attendance', 'SessionID', sessionId);
  return successResponse('OK', records.map(function (a) {
    const s = studentMap[String(a.NPM)] || {};
    return {
      attendanceId: String(a.AttendanceID),
      npm: String(a.NPM),
      nama: String(s.Nama || ''),
      kelas: String(s.Kelas || ''),
      waktuScan: String(a.WaktuScan || ''),
      status: String(a.Status || '')
    };
  }));
}

function handleEndSession(data) {
  const sessionId = String(data.sessionId || '').trim();
  if (!sessionId) return errorResponse('SessionID wajib diisi');

  const session = findRecordByValue('Sessions', 'SessionID', sessionId);
  if (!session) return errorResponse('Sesi tidak ditemukan');

  if (String(session.Status).toUpperCase() !== SESSION_STATUS.ENDED) {
    updateRecord('Sessions', session._row, { Status: SESSION_STATUS.ENDED });
  }
  return successResponse('Sesi berhasil diakhiri', { sessionId: sessionId, status: SESSION_STATUS.ENDED });
}

/* ============================================================
 * 10. ACTION HANDLERS — REMINDER
 * ============================================================ */

function handleCreateReminder(data) {
  const npm = String(data.npm || '').trim();
  const courseId = String(data.courseId || '').trim();
  if (!npm) return errorResponse('NPM wajib diisi');
  if (!courseId) return errorResponse('CourseID wajib diisi');

  const hari = normalizeDay(data.hari);
  const jam = normalizeTime(String(data.jam || '').trim());
  if (!hari) return errorResponse('Hari tidak valid');
  if (parseMinutes(jam) === null) return errorResponse('Jam tidak valid');

  const student = findRecordByValue('Students', 'NPM', npm);
  if (!student) return errorResponse('Mahasiswa tidak ditemukan');

  const course = findRecordByValue('Courses', 'CourseID', courseId);
  if (!course) return errorResponse('Mata kuliah tidak ditemukan');

  const reminderId = generateId('REM');
  appendRecord('Reminders', {
    ReminderID: reminderId, NPM: npm, CourseID: courseId,
    Hari: hari, Jam: jam,
    MenitSebelum: Number(data.menitSebelum || 30),
    Aktif: data.aktif === false ? 'FALSE' : 'TRUE'
  });
  return successResponse('Pengingat disimpan', { reminderId: reminderId });
}

function handleUpdateReminder(data) {
  const reminderId = String(data.reminderId || '').trim();
  if (!reminderId) return errorResponse('ReminderID wajib diisi');

  const reminder = findRecordByValue('Reminders', 'ReminderID', reminderId);
  if (!reminder) return errorResponse('Pengingat tidak ditemukan');

  const patch = {};
  if (data.hari !== undefined) {
    const hari = normalizeDay(data.hari);
    if (!hari) return errorResponse('Hari tidak valid');
    patch.Hari = hari;
  }
  if (data.jam !== undefined) {
    const jam = normalizeTime(String(data.jam));
    if (parseMinutes(jam) === null) return errorResponse('Jam tidak valid');
    patch.Jam = jam;
  }
  if (data.menitSebelum !== undefined) patch.MenitSebelum = Number(data.menitSebelum);
  if (data.aktif !== undefined) patch.Aktif = data.aktif ? 'TRUE' : 'FALSE';

  if (Object.keys(patch).length > 0) updateRecord('Reminders', reminder._row, patch);
  return successResponse('Pengingat diperbarui', { reminderId: reminderId });
}

function handleDeleteReminder(data) {
  const reminderId = String(data.reminderId || '').trim();
  if (!reminderId) return errorResponse('ReminderID wajib diisi');

  const reminder = findRecordByValue('Reminders', 'ReminderID', reminderId);
  if (!reminder) return errorResponse('Pengingat tidak ditemukan');

  getSheet('Reminders').deleteRow(reminder._row);
  return successResponse('Pengingat dihapus', { reminderId: reminderId });
}

/* ============================================================
 * 11. ACTION HANDLERS — KELOLA JADWAL (DOSEN)
 * ============================================================ */

/**
 * Validasi + normalisasi input jadwal.
 * Return { ok:true, value:{CourseID,Kelas,Hari,JamMulai,JamSelesai,Ruang} }
 *     atau { ok:false, message }
 */
function validateScheduleInput(input) {
  const courseId = String(input.courseId || '').trim();
  const kelas = normalizeKelas(input.kelas);
  const hari = normalizeDay(input.hari);
  const jamMulai = normalizeTime(String(input.jamMulai || '').trim());
  const jamSelesai = normalizeTime(String(input.jamSelesai || '').trim());
  const ruang = String(input.ruang === undefined || input.ruang === null ? '' : input.ruang).trim();

  if (!courseId) return { ok: false, message: 'CourseID wajib diisi' };
  if (!findRecordByValue('Courses', 'CourseID', courseId)) {
    return { ok: false, message: 'Mata kuliah tidak ditemukan' };
  }
  if (!kelas) return { ok: false, message: 'Kelas wajib diisi' };
  if (!isValidKelas(kelas)) return { ok: false, message: 'Kelas tidak valid. Gunakan: ' + CLASS_LIST.join(', ') };
  if (!input.hari) return { ok: false, message: 'Hari wajib diisi' };
  if (!hari) return { ok: false, message: 'Hari tidak valid. Gunakan: ' + DAYS.join(', ') };
  const start = parseMinutes(jamMulai);
  const end = parseMinutes(jamSelesai);
  if (start === null) return { ok: false, message: 'Jam mulai tidak valid (format HH:mm)' };
  if (end === null) return { ok: false, message: 'Jam selesai tidak valid (format HH:mm)' };
  if (end <= start) return { ok: false, message: 'Jam selesai harus setelah jam mulai' };
  if (ruang.length > 50) return { ok: false, message: 'Ruang maksimal 50 karakter' };

  return {
    ok: true,
    value: { CourseID: courseId, Kelas: kelas, Hari: hari, JamMulai: jamMulai, JamSelesai: jamSelesai, Ruang: ruang }
  };
}

function findDuplicateSchedule(v, exceptScheduleId) {
  return getAllRecords('Schedules').find(function (s) {
    return String(s.ScheduleID) !== String(exceptScheduleId || '') &&
           String(s.CourseID) === v.CourseID &&
           String(s.Kelas) === v.Kelas &&
           String(s.Hari) === v.Hari &&
           String(s.JamMulai) === v.JamMulai;
  });
}

function handleGetAllSchedules(data) {
  const kelas = normalizeKelas(data.kelas);
  const courseId = String(data.courseId || '').trim();
  const hari = data.hari ? normalizeDay(data.hari) : '';
  const courseMap = buildCourseMap();

  let list = getAllRecords('Schedules');
  if (kelas) list = list.filter(function (s) { return String(s.Kelas) === kelas; });
  if (courseId) list = list.filter(function (s) { return String(s.CourseID) === courseId; });
  if (hari) list = list.filter(function (s) { return String(s.Hari) === hari; });

  return successResponse('OK', sortSchedules(list.map(function (s) { return scheduleToDto(s, courseMap); })));
}

function handleCreateSchedule(data) {
  const v = validateScheduleInput(data);
  if (!v.ok) return errorResponse(v.message);
  if (findDuplicateSchedule(v.value)) return errorResponse('Jadwal yang sama sudah ada');

  const scheduleId = generateId('SCH');
  const record = Object.assign({ ScheduleID: scheduleId }, v.value);
  appendRecord('Schedules', record);
  return successResponse('Jadwal berhasil dibuat', scheduleToDto(record, buildCourseMap()));
}

function handleUpdateSchedule(data) {
  const scheduleId = String(data.scheduleId || '').trim();
  if (!scheduleId) return errorResponse('ScheduleID wajib diisi');

  const current = findRecordByValue('Schedules', 'ScheduleID', scheduleId);
  if (!current) return errorResponse('Jadwal tidak ditemukan');

  // Field yang tidak dikirim tetap memakai nilai lama.
  const merged = {
    courseId: data.courseId !== undefined ? data.courseId : current.CourseID,
    kelas: data.kelas !== undefined ? data.kelas : current.Kelas,
    hari: data.hari !== undefined ? data.hari : current.Hari,
    jamMulai: data.jamMulai !== undefined ? data.jamMulai : current.JamMulai,
    jamSelesai: data.jamSelesai !== undefined ? data.jamSelesai : current.JamSelesai,
    ruang: data.ruang !== undefined ? data.ruang : current.Ruang
  };
  const v = validateScheduleInput(merged);
  if (!v.ok) return errorResponse(v.message);
  if (findDuplicateSchedule(v.value, scheduleId)) return errorResponse('Jadwal yang sama sudah ada');

  updateRecord('Schedules', current._row, v.value);
  const record = Object.assign({ ScheduleID: scheduleId }, v.value);
  return successResponse('Jadwal berhasil diperbarui', scheduleToDto(record, buildCourseMap()));
}

function handleDeleteSchedule(data) {
  const scheduleId = String(data.scheduleId || '').trim();
  if (!scheduleId) return errorResponse('ScheduleID wajib diisi');

  const current = findRecordByValue('Schedules', 'ScheduleID', scheduleId);
  if (!current) return errorResponse('Jadwal tidak ditemukan');

  getSheet('Schedules').deleteRow(current._row);
  return successResponse('Jadwal dihapus', { scheduleId: scheduleId });
}

/* ============================================================
 * 12. ROUTER
 * ============================================================ */
function dispatchAction(action, data) {
  switch (action) {
    case 'ping':
    case 'getVersion':            return successResponse('OK', { version: APP_VERSION, time: nowString() });
    case 'getStudent':            return handleGetStudent(data);
    case 'registerStudent':       return handleRegisterStudent(data);
    case 'getCourses':            return handleGetCourses(data);
    case 'getSchedules':          return handleGetSchedules(data);
    case 'getAllSchedules':       return handleGetAllSchedules(data);
    case 'createSchedule':        return handleCreateSchedule(data);
    case 'updateSchedule':        return handleUpdateSchedule(data);
    case 'deleteSchedule':        return handleDeleteSchedule(data);
    case 'getAttendanceHistory':  return handleGetAttendanceHistory(data);
    case 'getAttendanceSummary':  return handleGetAttendanceSummary(data);
    case 'getReminders':          return handleGetReminders(data);
    case 'getClassStudents':      return handleGetClassStudents(data);
    case 'createSession':         return handleCreateSession(data);
    case 'getActiveSession':      return handleGetActiveSession(data);
    case 'getSessionById':        return handleGetSessionById(data);
    case 'recordAttendance':      return handleRecordAttendance(data);
    case 'getSessionAttendance':  return handleGetSessionAttendance(data);
    case 'endSession':            return handleEndSession(data);
    case 'createReminder':        return handleCreateReminder(data);
    case 'updateReminder':        return handleUpdateReminder(data);
    case 'deleteReminder':        return handleDeleteReminder(data);
    default:                      return errorResponse('Action "' + action + '" tidak dikenal');
  }
}

// Action tulis dibungkus lock (satu lock untuk seluruh request, tidak nested).
function routeAction(action, data) {
  if (!WRITE_ACTIONS[action]) return dispatchAction(action, data);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return errorResponse('Server sedang sibuk, coba lagi sebentar.');
  }
  try {
    return dispatchAction(action, data);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/* ============================================================
 * 13. HTTP HANDLERS
 * ============================================================ */
function doGet(e) {
  const payload = successResponse('Backend aktif', { time: nowString(), version: APP_VERSION });
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let output;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      output = errorResponse('Body request kosong');
    } else {
      let payload = null;
      try { payload = JSON.parse(e.postData.contents); }
      catch (parseErr) { output = errorResponse('Body bukan JSON valid'); }

      if (!output) {
        const action = payload && payload.action;
        const data = (payload && payload.data) || {};
        if (!action) {
          output = errorResponse('Action wajib diisi');
        } else {
          try { output = routeAction(action, data); }
          catch (err) { output = errorResponse('Server error: ' + err.message); }
        }
      }
    }
  } catch (err) { output = errorResponse('Server error: ' + err.message); }

  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 * 14. TEST FUNCTION (jalankan manual dari editor, lihat Execution log)
 * ============================================================ */
function testBackend() {
  const tests = [
    { action: 'getCourses',       data: { semester: 5 } },
    { action: 'getSchedules',     data: { semester: 5, kelas: '5_1' } },
    { action: 'getSchedules',     data: { semester: 5, kelas: '5.1' } },   // format lama tetap dipahami
    { action: 'getAllSchedules',  data: {} },
    { action: 'getClassStudents', data: { semester: 5, kelas: '5_1' } }
  ];
  tests.forEach(function (t) {
    let out;
    try { out = routeAction(t.action, t.data); }
    catch (err) { out = { success: false, message: err.message }; }
    Logger.log(t.action + ' -> ' + JSON.stringify(out));
  });
}

// Uji cepat fungsi normalisasi (tanpa menyentuh data).
function testNormalizers() {
  Logger.log(normalizeKelas('5.1') + ' | ' + normalizeKelas(5.1) + ' | ' + normalizeKelas('5_1') +
             ' | ' + normalizeKelas(new Date(new Date().getFullYear(), 4, 1)));  // 1 Mei → 5_1
  Logger.log(parseTimeString('8.00') + ' | ' + parseTimeString('08:00:00') + ' | ' + parseTimeString('1:30 PM'));
  Logger.log(normalizeDay('senin') + ' | ' + normalizeDay('JUMAT') + ' | [' + normalizeDay('Sunday') + ']');
}
