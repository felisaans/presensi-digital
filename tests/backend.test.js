/* ============================================================
 * TEST BACKEND — Presensi Digital (tanpa dependency)
 * Jalankan:  node tests/backend.test.js
 *
 * Cara kerja: Code.gs dimuat ke dalam `vm` context dengan mock
 * SpreadsheetApp / LockService / CacheService / PropertiesService /
 * Utilities / ContentService / Logger / Session. Sheet = array 2D.
 * Jam (Date) dikendalikan lewat `env.clock` agar test deterministik.
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const CODE_FILE = path.join(ROOT, 'code.gs');
const OLD_FILE = path.join(ROOT, 'backup', 'code.v2.2.0.gs');

/* ------------------------------------------------------------
 * MOCK: waktu
 * ---------------------------------------------------------- */
// 2026-09-30 10:30 WIB (= 03:30 UTC)
const T0 = Date.parse('2026-09-30T03:30:00Z');

function pad(n) { return (n < 10 ? '0' : '') + n; }

function formatInTz(date, tz, fmt) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date);
  const p = {};
  parts.forEach(function (x) { p[x.type] = x.value; });
  const map = {
    yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second,
    M: String(Number(p.month)), d: String(Number(p.day))
  };
  return fmt.replace(/yyyy|MM|dd|HH|mm|ss|M|d/g, function (t) { return map[t]; });
}

/* ------------------------------------------------------------
 * MOCK: Spreadsheet (strict: range di luar batas → error, seperti Sheets asli)
 * ---------------------------------------------------------- */
function MockSheet(env, name, rows, maxCols, maxRows) {
  this.env = env; this.name = name; this.rows = rows;
  this.maxCols = maxCols; this.maxRows = maxRows || Math.max(rows.length + 50, 100);
  this.formats = {}; // "r,c" → format terakhir yang di-set
}
MockSheet.prototype.getMaxColumns = function () { return this.maxCols; };
MockSheet.prototype.getMaxRows = function () { return this.maxRows; };
MockSheet.prototype.insertColumnsAfter = function (pos, n) { this.maxCols += n; };
MockSheet.prototype.getLastRow = function () {
  for (let i = this.rows.length - 1; i >= 0; i--) {
    if (this.rows[i].some(function (c) { return c !== '' && c !== null && c !== undefined; })) return i + 1;
  }
  return 0;
};
MockSheet.prototype.setFrozenRows = function () {};
MockSheet.prototype.deleteRow = function (r) { this.rows.splice(r - 1, 1); };
MockSheet.prototype.getRange = function (r, c, nr, nc) {
  nr = nr || 1; nc = nc || 1;
  if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('Range tidak valid');
  if (c + nc - 1 > this.maxCols) throw new Error('The coordinates of the range are outside the dimensions of the sheet (kolom ' + (c + nc - 1) + ' > ' + this.maxCols + ')');
  if (r + nr - 1 > this.maxRows) throw new Error('The coordinates of the range are outside the dimensions of the sheet (baris)');
  return new MockRange(this, r, c, nr, nc);
};

function MockRange(sheet, r, c, nr, nc) { this.sheet = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
MockRange.prototype.getValues = function () {
  const s = this.sheet, out = [];
  s.env.stats.rangeReads++;
  s.env.stats.cellsRead += this.nr * this.nc;
  for (let i = 0; i < this.nr; i++) {
    const row = s.rows[this.r - 1 + i] || [];
    const line = [];
    for (let j = 0; j < this.nc; j++) {
      const v = row[this.c - 1 + j];
      line.push(v === undefined || v === null ? '' : v);
    }
    out.push(line);
  }
  return out;
};
MockRange.prototype.getDisplayValues = function () {
  return this.getValues().map(function (row) {
    return row.map(function (v) { return v instanceof Date ? v.toISOString() : String(v); });
  });
};
MockRange.prototype.setValues = function (vals) {
  const s = this.sheet;
  for (let i = 0; i < this.nr; i++) {
    const idx = this.r - 1 + i;
    while (s.rows.length <= idx) s.rows.push([]);
    for (let j = 0; j < this.nc; j++) s.rows[idx][this.c - 1 + j] = vals[i][j];
  }
  return this;
};
MockRange.prototype.setNumberFormat = function (f) {
  for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) {
    this.sheet.formats[(this.r + i) + ',' + (this.c + j)] = f;
  }
  return this;
};
MockRange.prototype.setNumberFormats = function (fs2) {
  for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) {
    this.sheet.formats[(this.r + i) + ',' + (this.c + j)] = fs2[i][j];
  }
  return this;
};
MockRange.prototype.setFontWeight = function () { return this; };

/* ------------------------------------------------------------
 * SEED: 8 mahasiswa (6 × 5_1, 2 × 5_2), 1 sesi ENDED + 1 ACTIVE
 * ---------------------------------------------------------- */
const HEADERS_V22 = {
  Students:   ['NPM', 'Nama', 'Semester', 'Kelas', 'Status'],
  Courses:    ['CourseID', 'MataKuliah', 'Semester', 'Dosen'],
  Schedules:  ['ScheduleID', 'CourseID', 'Kelas', 'Hari', 'JamMulai', 'JamSelesai', 'Ruang'],
  Sessions:   ['SessionID', 'CourseID', 'Semester', 'Kelas', 'Pertemuan', 'Tanggal', 'JamMulai', 'JamSelesai', 'Status'],
  Attendance: ['AttendanceID', 'SessionID', 'NPM', 'WaktuScan', 'Status'],
  Reminders:  ['ReminderID', 'NPM', 'CourseID', 'Hari', 'Jam', 'MenitSebelum', 'Aktif']
};

function seedRows() {
  const students = [];
  ['2301001', '2301002', '2301003', '2301004', '2301005', '2301006'].forEach(function (n, i) {
    students.push([n, 'Mahasiswa A' + (i + 1), 5, '5_1', 'Aktif']);
  });
  students.push(['2302001', 'Mahasiswa B1', 5, '5_2', 'Aktif']);
  students.push(['2302002', 'Mahasiswa B2', 5, '5_2', 'Aktif']);
  return {
    Students: students,
    Courses: [
      ['MK-RPL', 'Rekayasa Perangkat Lunak', 5, 'Dosen X'],
      ['MK-BD', 'Basis Data', 5, ''],
      ['MK-PWEB', 'Pemrograman Web', 5, '']
    ],
    Schedules: [['SCH-1', 'MK-RPL', '5_1', 'Rabu', '10:00', '12:00', 'Lab 1']],
    Sessions: [
      ['SES-OLD1', 'MK-RPL', 5, '5_1', 1, '2026-09-29', '08:00', '10:00', 'ENDED'],
      ['SES-ACT1', 'MK-RPL', 5, '5_1', 2, '2026-09-30', '10:00', '12:00', 'ACTIVE']
    ],
    Attendance: [['ATT-1', 'SES-OLD1', '2301001', '2026-09-29 08:05:00', 'HADIR']],
    Reminders: []
  };
}

/* ------------------------------------------------------------
 * ENV: satu context baru per test (state bersih)
 * opts.file        — path Code.gs yang dimuat (default: code.gs saat ini)
 * opts.studentCols — jumlah kolom sheet Students (default 5 = sheet lama v2.2.0)
 * ---------------------------------------------------------- */
function newEnv(opts) {
  opts = opts || {};
  const env = {
    clock: { now: T0 },
    stats: { rangeReads: 0, cellsRead: 0, cachePuts: 0, cacheGets: 0 },
    logs: [], sheets: {}, cacheStore: {}, cacheMaxBytes: 0, lockDepth: 0
  };

  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(env.clock.now); }
    static now() { return env.clock.now; }
  }

  const seed = seedRows();
  Object.keys(HEADERS_V22).forEach(function (name) {
    const h = HEADERS_V22[name];
    const rows = [h.slice()].concat(seed[name].map(function (r) { return r.slice(); }));
    const cols = (name === 'Students' && opts.studentCols) ? opts.studentCols : h.length;
    env.sheets[name] = new MockSheet(env, name, rows, cols);
  });

  const ss = {
    getSheetByName: function (n) { return env.sheets[n] || null; },
    insertSheet: function (n) { env.sheets[n] = new MockSheet(env, n, [], 26); return env.sheets[n]; },
    getSpreadsheetTimeZone: function () { return 'Asia/Jakarta'; }
  };

  const cache = {
    get: function (k) {
      env.stats.cacheGets++;
      const e = env.cacheStore[k];
      if (!e) return null;
      if (e.exp <= env.clock.now) { delete env.cacheStore[k]; return null; }
      return e.v;
    },
    put: function (k, v, ttl) {
      if (Buffer.byteLength(String(v), 'utf8') > 100 * 1024) throw new Error('Argument too large: value');
      env.stats.cachePuts++;
      env.cacheMaxBytes = Math.max(env.cacheMaxBytes, Buffer.byteLength(String(v), 'utf8'));
      env.cacheStore[k] = { v: String(v), exp: env.clock.now + (ttl || 600) * 1000 };
    },
    remove: function (k) { delete env.cacheStore[k]; },
    removeAll: function (ks) { ks.forEach(function (k) { delete env.cacheStore[k]; }); }
  };

  const props = {};
  const sandbox = {
    Date: FakeDate,
    console: console,
    SpreadsheetApp: {
      openById: function () { return ss; },
      getActiveSpreadsheet: function () { return ss; }
    },
    LockService: {
      getScriptLock: function () {
        return {
          waitLock: function () { if (env.lockDepth > 0) throw new Error('Lock nested (tidak boleh)'); env.lockDepth++; },
          releaseLock: function () { env.lockDepth = Math.max(0, env.lockDepth - 1); }
        };
      }
    },
    CacheService: { getScriptCache: function () { return cache; } },
    PropertiesService: {
      getScriptProperties: function () {
        return {
          getProperty: function (k) { return props[k] === undefined ? null : props[k]; },
          setProperty: function (k, v) { props[k] = String(v); }
        };
      }
    },
    Utilities: {
      formatDate: function (d, tz, fmt) { return formatInTz(d, tz, fmt); },
      sleep: function () {}
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: function (s) {
        return { _s: s, setMimeType: function () { return this; }, getContent: function () { return this._s; } };
      }
    },
    Logger: { log: function (m) { env.logs.push(String(m)); } },
    Session: { getScriptTimeZone: function () { return 'Asia/Jakarta'; } }
  };
  env.ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(opts.file || CODE_FILE, 'utf8'), env.ctx, { filename: opts.file || CODE_FILE });

  /** Panggil lewat doPost asli (routing + lock + JSON), kembalikan respons ter-parse. */
  env.call = function (action, data) {
    const out = vm.runInContext('doPost', env.ctx)({ postData: { contents: JSON.stringify({ action: action, data: data || {} }) } });
    return JSON.parse(out.getContent());
  };
  env.run = function (code) { return vm.runInContext(code, env.ctx); };
  env.rows = function (name) { return env.sheets[name].rows; };
  env.header = function (name) { return env.sheets[name].rows[0]; };
  env.setClock = function (iso) { env.clock.now = Date.parse(iso); };
  env.advance = function (ms) { env.clock.now += ms; };
  env.addSession = function (row) { env.sheets.Sessions.rows.push(row); };
  env.resetStats = function () { env.stats.rangeReads = 0; env.stats.cellsRead = 0; env.stats.cachePuts = 0; env.stats.cacheGets = 0; };
  return env;
}

/* ------------------------------------------------------------
 * Runner mini
 * ---------------------------------------------------------- */
const TESTS = [];
function test(name, fn) { TESTS.push({ name: name, fn: fn }); }

module.exports = { newEnv, test, T0, CODE_FILE, OLD_FILE, ROOT };

/* ============================================================
 * FASE 0 — TEST DASAR
 * ============================================================ */
test('F0 versi backend = 2.3.0 (getVersion, ping, doGet)', function () {
  const t = newEnv();
  assert.strictEqual(t.call('getVersion').data.version, '2.3.0');
  assert.strictEqual(t.call('ping').data.version, '2.3.0');
  const g = JSON.parse(t.run('doGet')({}).getContent());
  assert.strictEqual(g.data.version, '2.3.0');
});

test('F0 seed: 8 mahasiswa (6×5_1, 2×5_2), 1 ENDED + 1 ACTIVE', function () {
  const t = newEnv();
  const s = t.rows('Students').slice(1);
  assert.strictEqual(s.length, 8);
  assert.strictEqual(s.filter(function (r) { return r[3] === '5_1'; }).length, 6);
  assert.strictEqual(s.filter(function (r) { return r[3] === '5_2'; }).length, 2);
  const ss = t.rows('Sessions').slice(1).map(function (r) { return r[8]; }).sort();
  assert.deepStrictEqual(ss, ['ACTIVE', 'ENDED']);
});

test('F0 getStudent: ditemukan', function () {
  const t = newEnv();
  const r = t.call('getStudent', { npm: '2301001' });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.data.nama, 'Mahasiswa A1');
  assert.strictEqual(r.data.kelas, '5_1');
});

test('F0 getStudent: tidak ditemukan → STUDENT_NOT_FOUND', function () {
  const t = newEnv();
  const r = t.call('getStudent', { npm: '9999999' });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.data.code, 'STUDENT_NOT_FOUND');
});

test('F0 getStudent: nonaktif → STUDENT_INACTIVE', function () {
  const t = newEnv();
  t.rows('Students')[1][4] = 'Nonaktif';
  const r = t.call('getStudent', { npm: '2301001' });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.data.code, 'STUDENT_INACTIVE');
});

test('F0 registerStudent: sukses (Semester dari kelas, Status Aktif)', function () {
  const t = newEnv();
  const r = t.call('registerStudent', { npm: '2303001', nama: 'Budi Baru', kelas: '5_3' });
  assert.strictEqual(r.success, true, r.message);
  assert.strictEqual(r.data.semester, 5);
  assert.strictEqual(r.data.status, 'Aktif');
  assert.strictEqual(t.rows('Students').length, 10);
  assert.strictEqual(t.call('getStudent', { npm: '2303001' }).success, true);
});

test('F0 registerStudent: duplikat → STUDENT_EXISTS', function () {
  const t = newEnv();
  const r = t.call('registerStudent', { npm: '2301001', nama: 'Siapa Saja', kelas: '5_1' });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.data.code, 'STUDENT_EXISTS');
  assert.strictEqual(t.rows('Students').length, 9);
});

test('F0 registerStudent: NPM invalid ditolak (huruf / pendek / panjang / kosong)', function () {
  const t = newEnv();
  ['ABC12345', '12345', '123456789012345678901', ''].forEach(function (npm) {
    const r = t.call('registerStudent', { npm: npm, nama: 'Budi Baru', kelas: '5_1' });
    assert.strictEqual(r.success, false, 'npm=' + npm);
  });
  assert.strictEqual(t.rows('Students').length, 9, 'tidak boleh ada baris baru');
});

test('F0 recordAttendance: sukses (HADIR ≤10 menit / TERLAMBAT setelahnya)', function () {
  const t = newEnv();                       // 10:30, sesi mulai 10:00 → TERLAMBAT
  const r = t.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301002' });
  assert.strictEqual(r.success, true, r.message);
  assert.strictEqual(r.data.status, 'TERLAMBAT');
  const t2 = newEnv(); t2.setClock('2026-09-30T03:05:00Z');   // 10:05 WIB → HADIR
  assert.strictEqual(t2.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301002' }).data.status, 'HADIR');
  assert.strictEqual(t.rows('Attendance').length, 3);
});

test('F0 recordAttendance: duplikat ditolak', function () {
  const t = newEnv();
  assert.strictEqual(t.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301002' }).success, true);
  const r = t.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301002' });
  assert.strictEqual(r.success, false);
  assert.ok(/sudah melakukan absensi/i.test(r.message));
  assert.strictEqual(t.rows('Attendance').length, 3);
});

test('F0 recordAttendance: kelas salah ditolak', function () {
  const t = newEnv();
  const r = t.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2302001' });   // 5_2 di sesi 5_1
  assert.strictEqual(r.success, false);
  assert.ok(/bukan bagian dari kelas/i.test(r.message));
  assert.strictEqual(t.rows('Attendance').length, 2);
});

/* ============================================================
 * FASE 1 — TerdaftarPada + Sumber
 * ============================================================ */
test('F1 registerStudent mengisi TerdaftarPada (waktu server) & Sumber=Mandiri', function () {
  const t = newEnv();
  assert.strictEqual(t.call('registerStudent', { npm: '2303001', nama: 'Budi Baru', kelas: '5_3' }).success, true);
  const h = t.header('Students');
  assert.deepStrictEqual(h.slice(5), ['TerdaftarPada', 'Sumber']);
  const row = t.rows('Students')[9];
  assert.strictEqual(row[h.indexOf('TerdaftarPada')], '2026-09-30 10:30:00');
  assert.strictEqual(row[h.indexOf('Sumber')], 'Mandiri');
});

test('F1 sheet lama (5 kolom, tanpa kolom baru) tetap terbaca & kolom baru ditambah otomatis', function () {
  const t = newEnv({ studentCols: 5 });
  assert.strictEqual(t.call('getStudent', { npm: '2301001' }).success, true);
  assert.strictEqual(t.header('Students').length, 7);
  const rec = t.run("findRecordByValue('Students','NPM','2301001')");
  assert.strictEqual(rec.TerdaftarPada, '');
  assert.strictEqual(rec.Sumber, '');
});

test('F1 data lama/manual tetap kosong untuk kolom baru setelah ada pendaftar baru', function () {
  const t = newEnv();
  t.call('registerStudent', { npm: '2303001', nama: 'Budi Baru', kelas: '5_3' });
  const h = t.header('Students');
  for (let i = 1; i <= 8; i++) {
    assert.strictEqual(t.rows('Students')[i][h.indexOf('TerdaftarPada')] || '', '');
    assert.strictEqual(t.rows('Students')[i][h.indexOf('Sumber')] || '', '');
  }
});

test('F1 applyColumnFormats mengunci TerdaftarPada & Sumber sebagai teks (@)', function () {
  const t = newEnv();
  t.run("applyColumnFormats('Students')");
  assert.strictEqual(t.sheets.Students.formats['2,6'], '@');   // TerdaftarPada
  assert.strictEqual(t.sheets.Students.formats['2,7'], '@');   // Sumber
  assert.strictEqual(t.sheets.Students.formats['2,3'], '0');   // Semester tetap angka
});

test('F1 getClassStudents & getSessionAttendance identik dengan v2.2.0', function () {
  const o = newEnv({ file: OLD_FILE }), n = newEnv();
  [o, n].forEach(function (e) { e.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301002' }); });
  assert.deepStrictEqual(n.call('getClassStudents', { kelas: '5_1' }), o.call('getClassStudents', { kelas: '5_1' }));
  const strip = function (r) { r.data.forEach(function (x) { delete x.attendanceId; }); return r; };   // ID acak
  assert.deepStrictEqual(strip(n.call('getSessionAttendance', { sessionId: 'SES-ACT1' })), strip(o.call('getSessionAttendance', { sessionId: 'SES-ACT1' })));
  // DTO getStudent tidak membocorkan kolom baru
  assert.deepStrictEqual(Object.keys(n.call('getStudent', { npm: '2301001' }).data).sort(), ['kelas', 'nama', 'npm', 'semester', 'status']);
  n.call('registerStudent', { npm: '2303001', nama: 'Budi Baru', kelas: '5_3' });
  assert.deepStrictEqual(Object.keys(n.call('getStudent', { npm: '2303001' }).data).sort(), ['kelas', 'nama', 'npm', 'semester', 'status']);
});

/* ============================================================
 * FASE 2 — Attendance Summary pendaftar baru
 * ============================================================ */
function addOldEnded(t) {   // 2 sesi ENDED tambahan sebelum "sekarang" (total ENDED 5_1 = 3)
  t.addSession(['SES-OLD2', 'MK-RPL', 5, '5_1', 3, '2026-09-22', '08:00', '10:00', 'ENDED']);
  t.addSession(['SES-OLD3', 'MK-RPL', 5, '5_1', 4, '2026-09-26', '13:00', '15:00', 'ENDED']);
}

test('F2 pendaftar baru: hanya sesi setelah daftar dihitung, alpha=0 bila hadir', function () {
  const t = newEnv(); addOldEnded(t);
  t.call('registerStudent', { npm: '2303001', nama: 'Budi Baru', kelas: '5_1' });   // 30 Sep 10:30
  t.addSession(['SES-NEW1', 'MK-RPL', 5, '5_1', 5, '2026-09-30', '14:00', '16:00', 'ENDED']);
  t.rows('Attendance').push(['ATT-N1', 'SES-NEW1', '2303001', '2026-09-30 14:02:00', 'HADIR']);
  const r = t.call('getAttendanceSummary', { npm: '2303001' }).data;
  assert.strictEqual(r.total, 1);
  assert.strictEqual(r.hadir, 1);
  assert.strictEqual(r.alpha, 0);
  assert.strictEqual(r.persentase, 100);
});

test('F2 pendaftar baru yang tidak hadir di sesi setelah daftar tetap alpha', function () {
  const t = newEnv(); addOldEnded(t);
  t.call('registerStudent', { npm: '2303001', nama: 'Budi Baru', kelas: '5_1' });
  t.addSession(['SES-NEW1', 'MK-RPL', 5, '5_1', 5, '2026-09-30', '14:00', '16:00', 'ENDED']);
  const r = t.call('getAttendanceSummary', { npm: '2303001' }).data;
  assert.strictEqual(r.total, 1);
  assert.strictEqual(r.alpha, 1);
  assert.strictEqual(r.persentase, 0);
});

test('F2 mahasiswa lama (TerdaftarPada kosong) identik dengan v2.2.0', function () {
  const o = newEnv({ file: OLD_FILE }), n = newEnv();
  [o, n].forEach(addOldEnded);
  ['2301001', '2301002', '2302001'].forEach(function (npm) {
    assert.deepStrictEqual(n.call('getAttendanceSummary', { npm: npm }), o.call('getAttendanceSummary', { npm: npm }));
  });
  assert.strictEqual(n.call('getAttendanceSummary', { npm: '2301002' }).data.total, 3);
  assert.strictEqual(n.call('getAttendanceSummary', { npm: '2301002' }).data.alpha, 3);
});

test('F2 pendaftar baru yang hadir di sesi lama tetap tercatat (sesi dihitung)', function () {
  const t = newEnv(); addOldEnded(t);
  t.call('registerStudent', { npm: '2303001', nama: 'Budi Baru', kelas: '5_1' });
  t.rows('Attendance').push(['ATT-N0', 'SES-OLD2', '2303001', '2026-09-22 08:03:00', 'HADIR']);
  const r = t.call('getAttendanceSummary', { npm: '2303001' }).data;
  assert.strictEqual(r.total, 1);        // hanya SES-OLD2 (sudah dihadiri); OLD1 & OLD3 sebelum daftar
  assert.strictEqual(r.hadir, 1);
  assert.strictEqual(r.alpha, 0);
});

test('F2 batas: sesi mulai tepat saat TerdaftarPada dihitung (≥), semenit sebelumnya tidak', function () {
  const t = newEnv();
  t.call('registerStudent', { npm: '2303001', nama: 'Budi Baru', kelas: '5_1' });   // 10:30:00
  t.addSession(['SES-EQ', 'MK-RPL', 5, '5_1', 6, '2026-09-30', '10:30', '11:30', 'ENDED']);
  t.addSession(['SES-BEF', 'MK-RPL', 5, '5_1', 7, '2026-09-30', '10:29', '11:30', 'ENDED']);
  assert.strictEqual(t.call('getAttendanceSummary', { npm: '2303001' }).data.total, 1);
});

/* ============================================================
 * FASE 3 — Rate limit pendaftaran
 * ============================================================ */
function reg(t, i) {
  return t.call('registerStudent', { npm: String(2400000 + i), nama: 'Pendaftar ' + i, kelas: '5_3' });
}

test('F3 pendaftaran ke-11 dalam satu menit ditolak RATE_LIMITED (10 pertama sukses)', function () {
  const t = newEnv();
  for (let i = 1; i <= 10; i++) assert.strictEqual(reg(t, i).success, true, 'pendaftar ke-' + i);
  const r = reg(t, 11);
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.data.code, 'RATE_LIMITED');
  assert.strictEqual(t.rows('Students').length, 1 + 8 + 10, 'baris ke-11 tidak boleh masuk');
});

test('F3 kuota pulih di menit berikutnya', function () {
  const t = newEnv();
  for (let i = 1; i <= 10; i++) reg(t, i);
  assert.strictEqual(reg(t, 11).data.code, 'RATE_LIMITED');
  t.advance(61 * 1000);
  assert.strictEqual(reg(t, 11).success, true);
});

test('F3 hanya registerStudent yang dibatasi (getStudent, recordAttendance, dll. tetap jalan)', function () {
  const t = newEnv();
  for (let i = 1; i <= 10; i++) reg(t, i);
  assert.strictEqual(reg(t, 11).data.code, 'RATE_LIMITED');
  assert.strictEqual(t.call('getStudent', { npm: '2301001' }).success, true);
  assert.strictEqual(t.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301002' }).success, true);
  assert.strictEqual(t.call('getAttendanceSummary', { npm: '2301001' }).success, true);
});

test('F3 duplikat / validasi gagal tidak menghabiskan kuota', function () {
  const t = newEnv();
  for (let i = 0; i < 15; i++) {
    t.call('registerStudent', { npm: '2301001', nama: 'Dup', kelas: '5_1' });      // STUDENT_EXISTS
    t.call('registerStudent', { npm: 'abc', nama: 'Salah', kelas: '5_1' });        // invalid
  }
  assert.strictEqual(reg(t, 1).success, true);
});

test('F3 cache bermasalah → fail-open (pendaftaran tetap berjalan)', function () {
  const t = newEnv();
  t.run("CacheService.getScriptCache = function () { throw new Error('cache down'); }");
  assert.strictEqual(reg(t, 1).success, true);
});

/* ============================================================
 * FASE 4 — Validasi NPM (isValidNpm)
 * ============================================================ */
test('F4 isValidNpm backend: 6–20 digit angka', function () {
  const t = newEnv();
  ['123456', '2301001', '12345678901234567890'].forEach(function (v) { assert.strictEqual(t.run('isValidNpm')(v), true, v); });
  ['12345', '123456789012345678901', 'abc12345', '12 3456', '', null].forEach(function (v) { assert.strictEqual(t.run('isValidNpm')(v), false, String(v)); });
});

test('F4 registerStudent NPM format salah → rejectResponse INVALID_NPM (bukan tulis sheet)', function () {
  const t = newEnv();
  const r = t.call('registerStudent', { npm: 'ABC12345', nama: 'Budi Baru', kelas: '5_1' });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.data.code, 'INVALID_NPM');
  assert.strictEqual(t.rows('Students').length, 9);
});

/* ============================================================
 * FASE 5 — Performa backend + cache
 * ============================================================ */
function bigAttendance(t, nSessions, perSession) {   // data besar milik sesi lain
  const rows = t.sheets.Attendance.rows;
  for (let s = 0; s < nSessions; s++) {
    for (let k = 0; k < perSession; k++) {
      rows.push(['ATT-B' + s + '-' + k, 'SES-BIG' + s, String(2500000 + k), '2026-09-01 08:00:00', 'HADIR']);
    }
  }
  t.sheets.Attendance.maxRows = rows.length + 50;
}

test('F5 findRecordByValue/findRecordsByValue identik dengan implementasi v2.2.0 (semua sheet)', function () {
  const o = newEnv({ file: OLD_FILE }), n = newEnv();
  [o, n].forEach(function (e) {
    // sel Date (Sheets kadang mengubah teks jadi Date) + baris kosong di tengah data
    e.sheets.Sessions.rows.push(['SES-DATE', 'MK-BD', 5, '5_2', 1, e.run('new Date(2026, 8, 29)'), e.run('new Date(1899, 11, 30, 8, 0)'), '10:00', 'ENDED']);
    e.sheets.Sessions.rows.push(['', '', '', '', '', '', '', '', '']);
    e.sheets.Students.rows.splice(3, 0, ['', '', '', '', '']);
    e.sheets.Attendance.rows.push(['ATT-X', 'SES-ACT1', '2301003', '2026-09-30 10:20:00', 'TERLAMBAT']);
  });
  const cases = [
    ['Students', 'NPM', '2301001'], ['Students', 'NPM', '2302002'], ['Students', 'NPM', '404'], ['Students', 'Kelas', '5_1'],
    ['Courses', 'CourseID', 'MK-BD'], ['Sessions', 'SessionID', 'SES-DATE'], ['Sessions', 'Kelas', '5_1'],
    ['Sessions', 'Tanggal', '2026-09-29'], ['Attendance', 'SessionID', 'SES-ACT1'], ['Attendance', 'NPM', '2301001'],
    ['Schedules', 'Kelas', '5_1'], ['Students', 'NPM', '']
  ];
  // v2.2.0 belum punya kolom TerdaftarPada/Sumber → bandingkan tanpa kedua kunci itu.
  const norm = function (v) {
    return JSON.stringify(v, function (k, x) { return (k === 'TerdaftarPada' || k === 'Sumber') ? undefined : x; });
  };
  cases.forEach(function (c) {
    const q1 = "findRecordsByValue('" + c[0] + "','" + c[1] + "','" + c[2] + "')";
    const q2 = "findRecordByValue('" + c[0] + "','" + c[1] + "','" + c[2] + "')";
    assert.strictEqual(norm(n.run(q1)), norm(o.run(q1)), q1);
    assert.strictEqual(norm(n.run(q2)), norm(o.run(q2)), q2);
  });
  ['Students', 'Courses', 'Schedules', 'Sessions', 'Attendance', 'Reminders'].forEach(function (name) {
    assert.strictEqual(norm(n.run("getAllRecords('" + name + "')")), norm(o.run("getAllRecords('" + name + "')")), 'getAllRecords ' + name);
  });
  // _row dipertahankan
  assert.strictEqual(n.run("findRecordByValue('Students','NPM','2301002')")._row, 3);
});

test('F5 recordAttendance membaca ≥4× lebih sedikit sel daripada v2.2.0 (Attendance 2000 baris; 1 kolom vs 5 kolom)', function () {
  const o = newEnv({ file: OLD_FILE }), n = newEnv();
  [o, n].forEach(function (e) { bigAttendance(e, 40, 50); e.resetStats(); });   // 2000 baris
  const ro = o.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301002' });
  const rn = n.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301002' });
  assert.strictEqual(ro.success, true); assert.strictEqual(rn.success, true);
  assert.strictEqual(rn.data.status, ro.data.status);
  assert.ok(n.stats.cellsRead * 4 < o.stats.cellsRead, 'baru=' + n.stats.cellsRead + ' lama=' + o.stats.cellsRead);
  // duplikat tetap terdeteksi di data besar
  assert.ok(/sudah melakukan absensi/i.test(n.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301002' }).message));
});

test('F5 getStudent kedua kali dilayani dari cache (0 pembacaan sheet)', function () {
  const t = newEnv();
  assert.strictEqual(t.call('getStudent', { npm: '2301001' }).success, true);
  t.resetStats();
  const r = t.call('getStudent', { npm: '2301001' });
  assert.strictEqual(r.success, true); assert.strictEqual(r.data.nama, 'Mahasiswa A1');
  assert.strictEqual(t.stats.cellsRead, 0);
});

test('F5 cache TTL ~60 dtk: perubahan manual di Sheets terlihat setelah TTL, bukan sebelum', function () {
  const t = newEnv();
  assert.strictEqual(t.call('getStudent', { npm: '2301001' }).success, true);
  t.rows('Students')[1][4] = 'Nonaktif';                       // diubah manual di Sheets
  t.advance(30 * 1000);
  assert.strictEqual(t.call('getStudent', { npm: '2301001' }).success, true, 'masih cache pada 30 dtk');
  t.advance(31 * 1000);
  assert.strictEqual(t.call('getStudent', { npm: '2301001' }).data.code, 'STUDENT_INACTIVE', 'cache kedaluwarsa setelah >60 dtk');
});

test('F5 registerStudent menginvalidasi cache → getStudent langsung menemukan NPM baru', function () {
  const t = newEnv();
  // cache usang sengaja ditanam untuk NPM yang akan didaftarkan
  t.run("CacheService.getScriptCache().put('stu:2399999', JSON.stringify({NPM:'2399999',Nama:'USANG',Semester:5,Kelas:'5_9',Status:'Nonaktif'}), 60)");
  assert.strictEqual(t.call('registerStudent', { npm: '2399999', nama: 'Nama Asli', kelas: '5_2' }).success, true);
  const r = t.call('getStudent', { npm: '2399999' });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.data.nama, 'Nama Asli'); assert.strictEqual(r.data.kelas, '5_2');
});

test('F5 NPM belum terdaftar tidak di-cache (negatif): langsung ketemu setelah ditambah manual', function () {
  const t = newEnv();
  assert.strictEqual(t.call('getStudent', { npm: '2307777' }).data.code, 'STUDENT_NOT_FOUND');
  t.rows('Students').push(['2307777', 'Manual', 5, '5_1', 'Aktif']);
  assert.strictEqual(t.call('getStudent', { npm: '2307777' }).success, true);
});

test('F5 cache Courses: dipakai ulang; di-invalidasi saat sheet Courses ditulis', function () {
  const t = newEnv();
  assert.strictEqual(t.call('getCourses', { semester: 5 }).data.length, 3);
  t.resetStats();
  assert.strictEqual(t.call('getCourses', { semester: 5 }).data.length, 3);
  assert.strictEqual(t.stats.cellsRead, 0, 'getCourses ke-2 dari cache');
  t.run("appendRecord('Courses', {CourseID:'MK-NEW', MataKuliah:'Baru', Semester:5, Dosen:''})");
  assert.strictEqual(t.call('getCourses', { semester: 5 }).data.length, 4, 'cache terinvalidasi oleh appendRecord');
});

test('F5 cache tidak menyimpan nilai >100 KB dan tidak error', function () {
  const t = newEnv();
  for (let i = 0; i < 1500; i++) t.rows('Courses').push(['MK-' + i, 'Mata Kuliah Panjang Sekali Nomor ' + i + ' '.padEnd(40, 'x'), 5, 'Dosen ' + i]);
  t.sheets.Courses.maxRows = t.rows('Courses').length + 50;
  const r = t.call('getCourses', { semester: 5 });
  assert.strictEqual(r.success, true); assert.ok(r.data.length > 1500);
  assert.strictEqual(t.cacheStore['courses:all'], undefined, 'terlalu besar → tidak di-cache');
  assert.ok(t.cacheMaxBytes <= 100 * 1024);
});

test('F5 seluruh nilai yang di-cache ≤100 KB & TTL ≤ 70 dtk dalam alur normal', function () {
  const t = newEnv();
  t.call('getStudent', { npm: '2301001' }); t.call('getCourses', { semester: 5 });
  t.call('registerStudent', { npm: '2303001', nama: 'Budi Baru', kelas: '5_3' });
  assert.ok(t.cacheMaxBytes > 0 && t.cacheMaxBytes <= 100 * 1024);
  Object.keys(t.cacheStore).forEach(function (k) { assert.ok(t.cacheStore[k].exp - t.clock.now <= 70 * 1000, k); });
});

/* ============================================================
 * ATURAN GLOBAL #4 — penolakan bisnis recordAttendance membawa data.code (pesan tetap sama dengan v2.2.0)
 * ============================================================ */
test('G4 recordAttendance: setiap penolakan bisnis punya data.code & pesan identik v2.2.0', function () {
  const o = newEnv({ file: OLD_FILE }), n = newEnv();
  const scen = [
    ['SESSION_NOT_FOUND', function (e) { return e.call('recordAttendance', { sessionId: 'NOPE', npm: '2301002' }); }],
    ['SESSION_NOT_ACTIVE', function (e) { return e.call('recordAttendance', { sessionId: 'SES-OLD1', npm: '2301002' }); }],
    ['SESSION_OUT_OF_TIME', function (e) { e.setClock('2026-09-30T08:00:00Z'); const r = e.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301002' }); e.setClock('2026-09-30T03:30:00Z'); return r; }],
    ['STUDENT_NOT_FOUND', function (e) { return e.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '9999999' }); }],
    ['STUDENT_INACTIVE', function (e) { e.rows('Students')[2][4] = 'Nonaktif'; return e.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301002' }); }],
    ['CLASS_MISMATCH', function (e) { return e.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2302001' }); }],
    ['ALREADY_ATTENDED', function (e) { e.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301003' }); return e.call('recordAttendance', { sessionId: 'SES-ACT1', npm: '2301003' }); }]
  ];
  scen.forEach(function (sc) {
    const rn = sc[1](n), ro = sc[1](o);
    assert.strictEqual(rn.success, false, sc[0]);
    assert.strictEqual(rn.data && rn.data.code, sc[0]);
    assert.strictEqual(rn.message, ro.message, 'pesan harus sama: ' + sc[0]);
  });
});

/* ============================================================
 * RUNNER
 * ============================================================ */
if (require.main === module) {
  let pass = 0, fail = 0;
  TESTS.forEach(function (t) {
    try { t.fn(); pass++; console.log('  ✓ ' + t.name); }
    catch (e) { fail++; console.log('  ✗ ' + t.name + '\n      ' + (e && e.message ? e.message : e)); }
  });
  console.log('\n' + pass + ' lolos, ' + fail + ' gagal (total ' + TESTS.length + ')');
  process.exit(fail ? 1 : 0);
}
