/* Test logika frontend tanpa browser: fungsi dipetik dari index.html (pencocokan kurung kurawal)
 * lalu dijalankan di vm dengan stub. Jalankan: node tests/frontend.logic.test.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const backend = fs.readFileSync(path.join(__dirname, '..', 'code.gs'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src); if (!m) throw new Error('fungsi tidak ditemukan: ' + name);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) break; } }
  return src.slice(m.index, j + 1);
}
function load(names, stubs) {
  const ctx = vm.createContext(Object.assign({ console: console, ensureStudentClassValid: function () {} }, stubs));
  names.forEach(function (n) { vm.runInContext(extractFn(html, n), ctx); });
  return ctx;
}

const T = []; function test(n, f) { T.push([n, f]); }

/* ---------- isValidNpm ---------- */
test('isValidNpm frontend: 6–20 digit saja', function () {
  const c = load(['isValidNpm'], {});
  ['123456', '2301001', '12345678901234567890'].forEach(function (v) { assert.strictEqual(c.isValidNpm(v), true, v); });
  ['12345', '123456789012345678901', 'abc12345', '12 3456', '', '12-3456', ' 123456', null, undefined].forEach(function (v) { assert.strictEqual(c.isValidNpm(v), false, String(v)); });
});
test('isValidNpm frontend ≡ backend (aturan identik)', function () {
  const f = load(['isValidNpm'], {}), b = vm.createContext({});
  vm.runInContext(extractFn(backend, 'isValidNpm'), b);
  ['', '1', '12345', '123456', '2301001', '12345678901234567890', '123456789012345678901', 'a123456', '123 456', '１２３４５６'].forEach(function (v) {
    assert.strictEqual(f.isValidNpm(v), b.isValidNpm(v), JSON.stringify(v));
  });
});

/* ---------- handleStudentLogin: tolak sebelum API ---------- */
test('login: NPM tidak valid ditolak SEBELUM apiRequest; spasi di-trim', async function () {
  const calls = [], toasts = [];
  const input = { value: '  23a1001 ' };
  const c = load(['isValidNpm', 'handleStudentLogin'], {
    document: { getElementById: function () { return input; } },
    showToast: function (t, m) { toasts.push([t, m]); }, setLoading: function () {},
    isApiConfigured: function () { return true; },
    apiRequest: async function (a, d) { calls.push([a, d]); return { success: false, networkError: true, message: 'x' }; },
    openRegisterModal: function () { throw new Error('tidak boleh membuka form'); },
    handleApiError: function () {}
  });
  await c.handleStudentLogin({ preventDefault: function () {} });
  assert.strictEqual(calls.length, 0); assert.strictEqual(toasts[0][0], 'error');
  input.value = '  2301001  ';
  await c.handleStudentLogin({ preventDefault: function () {} });
  assert.strictEqual(JSON.stringify(calls[0]), JSON.stringify(['getStudent', { npm: '2301001' }]));   // JSON: objek vm beda realm
});
test('login: networkError TIDAK membuka form daftar', async function () {
  let opened = false;
  const c = load(['isValidNpm', 'handleStudentLogin'], {
    document: { getElementById: function () { return { value: '2301001' }; } },
    showToast: function () {}, setLoading: function () {}, isApiConfigured: function () { return true; },
    apiRequest: async function () { return { success: false, networkError: true, message: 'offline', data: null }; },
    openRegisterModal: function () { opened = true; }, handleApiError: function () {}
  });
  await c.handleStudentLogin({ preventDefault: function () {} });
  assert.strictEqual(opened, false);
});
test('login: STUDENT_NOT_FOUND (format valid) membuka form daftar', async function () {
  let openedNpm = null;
  const c = load(['isValidNpm', 'handleStudentLogin'], {
    document: { getElementById: function () { return { value: '2399999' }; } },
    showToast: function () {}, setLoading: function () {}, isApiConfigured: function () { return true; },
    apiRequest: async function () { return { success: false, data: { code: 'STUDENT_NOT_FOUND' } }; },
    openRegisterModal: function (n) { openedNpm = n; }, handleApiError: function () {}
  });
  await c.handleStudentLogin({ preventDefault: function () {} });
  assert.strictEqual(openedNpm, '2399999');
});

/* ---------- syncStudentInBackground ---------- */
function syncEnv(apiResult, student) {
  const log = { forced: null, saved: null, refreshed: 0, toasts: [] };
  const state = { student: student || { npm: '2301001', nama: 'A', semester: 5, kelas: '5_1', status: 'Aktif' }, schedule: ['lama'], nextClass: { x: 1 } };
  const c = load(['syncStudentInBackground'], {
    appState: state,
    apiRequest: async function () { return apiResult; },
    forceLogout: function (m) { log.forced = m; state.student = null; },
    saveStudent: function (s) { log.saved = s; state.student = s; },
    refreshStudentData: async function () { log.refreshed++; },
    renderStudentHeader: function () {}, renderProfileModal: function () {}, renderStudentDashboard: function () {},
    renderAttendanceHistory: function () {}, renderCalendar: function () {}, renderReminders: function () {}, renderSchedule: function () {},
    showToast: function (t, m) { log.toasts.push(m); }
  });
  return { c: c, log: log, state: state };
}
test('sync: STUDENT_INACTIVE → forceLogout', async function () {
  const e = syncEnv({ success: false, data: { code: 'STUDENT_INACTIVE' } });
  await e.c.syncStudentInBackground();
  assert.ok(/tidak aktif/i.test(e.log.forced)); assert.strictEqual(e.log.refreshed, 0);
});
test('sync: STUDENT_NOT_FOUND → forceLogout + arahan masuk ulang', async function () {
  const e = syncEnv({ success: false, data: { code: 'STUDENT_NOT_FOUND' } });
  await e.c.syncStudentInBackground();
  assert.ok(/masuk kembali/i.test(e.log.forced)); assert.strictEqual(e.log.refreshed, 0);
});
test('sync: networkError → TIDAK logout, sesi dipertahankan', async function () {
  const e = syncEnv({ success: false, networkError: true, message: 'offline', data: null });
  await e.c.syncStudentInBackground();
  assert.strictEqual(e.log.forced, null); assert.ok(e.state.student);
});
test('sync: error server lain tanpa kode (mis. "Server error") → TIDAK logout', async function () {
  const e = syncEnv({ success: false, message: 'Server error: x', data: null });
  await e.c.syncStudentInBackground();
  assert.strictEqual(e.log.forced, null);
});
test('sync: kelas berubah → data disimpan, jadwal lama dikosongkan, refresh dipanggil', async function () {
  const e = syncEnv({ success: true, data: { npm: '2301001', nama: 'A', semester: 5, kelas: '5_2', status: 'Aktif' } });
  await e.c.syncStudentInBackground();
  assert.strictEqual(e.log.saved.kelas, '5_2'); assert.strictEqual(JSON.stringify(e.state.schedule), '[]');
  assert.strictEqual(e.state.nextClass, null); assert.strictEqual(e.log.refreshed, 1);
});
test('sync: kelas sama → jadwal tidak dikosongkan', async function () {
  const e = syncEnv({ success: true, data: { npm: '2301001', nama: 'A', semester: 5, kelas: '5_1', status: 'Aktif' } });
  await e.c.syncStudentInBackground();
  assert.strictEqual(JSON.stringify(e.state.schedule), '["lama"]');
});
test('sync: pengguna logout selama menunggu respons → diabaikan', async function () {
  const e = syncEnv({ success: false, data: { code: 'STUDENT_INACTIVE' } });
  const c = e.c; e.state.student = { npm: '2301001' };
  const orig = c.apiRequest;
  c.apiRequest = async function () { e.state.student = null; return orig.apply(null, arguments); };
  await c.syncStudentInBackground();
  assert.strictEqual(e.log.forced, null);
});

/* ---------- polling monitor ---------- */
function pollEnv(visibility) {
  const intervals = {}; let nextId = 1, refreshes = 0;
  const doc = { visibilityState: visibility || 'visible', _l: {}, addEventListener: function (e, f) { this._l[e] = f; } };
  const ctx = vm.createContext({
    document: doc, POLL_INTERVAL_MS: 5000,
    refreshSessionAttendance: function () { refreshes++; },
    setInterval: function (f, ms) { const id = nextId++; intervals[id] = ms; return id; },
    clearInterval: function (id) { delete intervals[id]; }
  });
  vm.runInContext('let _attendancePollingId = null; let _pollingWanted = false;', ctx);
  ['startAttendancePolling', 'stopAttendancePolling', 'handlePollingVisibility'].forEach(function (n) { vm.runInContext(extractFn(html, n), ctx); });
  vm.runInContext("document.addEventListener('visibilitychange', handlePollingVisibility);", ctx);
  return { ctx: ctx, doc: doc, active: function () { return Object.keys(intervals).map(function (k) { return intervals[k]; }); }, refreshes: function () { return refreshes; } };
}
test('polling: konstanta 5000 ms (bukan 3000) di index.html', function () {
  assert.ok(/const POLL_INTERVAL_MS = 5000;/.test(html)); assert.ok(!/POLL_INTERVAL_MS = 3000/.test(html));
});
test('polling: start → 1 interval 5000 ms; stop → 0 interval', function () {
  const e = pollEnv(); e.ctx.startAttendancePolling();
  assert.strictEqual(JSON.stringify(e.active()), '[5000]');
  e.ctx.startAttendancePolling();                       // start ulang tidak menggandakan
  assert.strictEqual(e.active().length, 1);
  e.ctx.stopAttendancePolling(); assert.strictEqual(e.active().length, 0);
});
test('polling: tab hidden → berhenti; visible → segarkan sekali + lanjut', function () {
  const e = pollEnv(); e.ctx.startAttendancePolling();
  e.doc.visibilityState = 'hidden'; e.doc._l.visibilitychange();
  assert.strictEqual(e.active().length, 0);
  e.doc.visibilityState = 'visible'; e.doc._l.visibilitychange();
  assert.strictEqual(e.refreshes(), 1); assert.strictEqual(JSON.stringify(e.active()), '[5000]');
  e.doc._l.visibilitychange(); assert.strictEqual(e.active().length, 1, 'visible berulang tidak menggandakan');
});
test('polling: setelah stop sungguhan, tab visible TIDAK menghidupkan polling lagi', function () {
  const e = pollEnv(); e.ctx.startAttendancePolling(); e.ctx.stopAttendancePolling();
  e.doc.visibilityState = 'visible'; e.doc._l.visibilitychange();
  assert.strictEqual(e.active().length, 0); assert.strictEqual(e.refreshes(), 0);
});
test('polling: start saat tab hidden → tidak jalan sampai tab terlihat', function () {
  const e = pollEnv('hidden'); e.ctx.startAttendancePolling();
  assert.strictEqual(e.active().length, 0);
  e.doc.visibilityState = 'visible'; e.doc._l.visibilitychange();
  assert.strictEqual(e.active().length, 1);
});

/* ---------- Fase 6: daftar kelas & semester DINAMIS (v2.4.0) ---------- */
function fakeSelect(optionsHtmlValues, initial) {
  const sel = { options: optionsHtmlValues.map(function (v) { return { value: v[0], textContent: v[1] }; }), value: initial === undefined ? '' : initial, disabled: false };
  Object.defineProperty(sel, 'firstChild', { get: function () { return sel.options[0] || null; } });
  sel.appendChild = function (o) { sel.options.push(o); };
  sel.removeChild = function (o) { sel.options.splice(sel.options.indexOf(o), 1); };
  return sel;
}
const KELAS_FNS = ['semesterOfKelas', 'setupSemesters', 'kelasForSemester', 'selectPlaceholder', 'fillSemesterSelect', 'fillKelasSelect', 'onSemesterPairChange', 'populateKelasSelects'];
function kelasEnv(list, semesters) {
  const sels = {
    'lecturer-semester': fakeSelect([], ''), 'lecturer-kelas': fakeSelect([], ''),
    'sched-filter-kelas': fakeSelect([['', 'Semua Kelas']], ''), 'sched-kelas': fakeSelect([], ''),
    'reg-semester': fakeSelect([['', 'Pilih']], ''), 'reg-kelas': fakeSelect([['', 'Pilih kelas']], ''),
    'cls-semester': fakeSelect([['', 'Pilih']], ''), 'cls-kelas': fakeSelect([['', 'Pilih kelas']], '')
  };
  const ctx = vm.createContext({
    CONFIG: { KELAS_LIST: list || ['5_1', '5_2', '5_3', '5_4', '5_5'] },
    appState: { setup: { semesters: semesters || [5] } },
    document: { getElementById: function (id) { return sels[id] || null; }, createElement: function () { return { value: '', textContent: '' }; } }
  });
  KELAS_FNS.forEach(function (n) { vm.runInContext(extractFn(html, n), ctx); });
  return { ctx: ctx, sels: sels };
}
const vals = function (e, id) { return e.sels[id].options.map(function (o) { return o.value; }).join(','); };

test('kelas: tidak ada kelas/semester hardcoded di index.html (daftar kelas berasal dari server)', function () {
  assert.strictEqual((html.match(/<option value="[1-8]_[A-Z0-9]+"/g) || []).length, 0);
  assert.ok(/KELAS_LIST: \[\],/.test(html), 'CONFIG.KELAS_LIST harus kosong di kode');
  assert.strictEqual(html.split('\n').filter(function (l) { return /'5_[1-5]'/.test(l) && !/Demo|demo|\/\/ mode demo/.test(l); }).length <= 2, true);
  const sem = html.slice(html.indexOf('id="lecturer-semester"'), html.indexOf('id="lecturer-semester"') + 200);
  assert.ok(!/<option/.test(sem), 'semester dosen tidak lagi hardcoded 4/5/6');
});
test('kelas: semesterOfKelas ≡ kelasSemester backend (semester 1–8, selain itu 0)', function () {
  const e = kelasEnv(); const b = vm.createContext({}); vm.runInContext(extractFn(backend, 'kelasSemester'), b);
  ['5_1', '3_A', '8_Z', '1_1'].forEach(function (k) { assert.strictEqual(e.ctx.semesterOfKelas(k), b.kelasSemester(k), k); });
  ['9_1', '0_1', '', 'ABC', null].forEach(function (k) { assert.strictEqual(e.ctx.semesterOfKelas(k), 0, String(k)); });
});
test('kelas: populateKelasSelects — semester dari server, kelas difilter per semester, placeholder dipertahankan', function () {
  const e = kelasEnv(); e.ctx.populateKelasSelects();
  assert.strictEqual(vals(e, 'lecturer-semester'), '5');
  assert.strictEqual(vals(e, 'lecturer-kelas'), '5_1,5_2,5_3,5_4,5_5');
  assert.strictEqual(vals(e, 'sched-kelas'), '5_1,5_2,5_3,5_4,5_5');
  assert.strictEqual(vals(e, 'sched-filter-kelas'), ',5_1,5_2,5_3,5_4,5_5');
  assert.strictEqual(e.sels['sched-filter-kelas'].options[0].textContent, 'Semua Kelas');
  assert.strictEqual(vals(e, 'reg-semester'), ',5');                    // placeholder + semester tersedia
  assert.strictEqual(vals(e, 'reg-kelas'), '');                         // belum pilih semester → hanya placeholder
  assert.strictEqual(e.sels['reg-kelas'].disabled, true);
  assert.strictEqual(e.sels['lecturer-semester'].value, '5'); assert.strictEqual(e.sels['lecturer-kelas'].value, '5_1');
  assert.strictEqual(e.sels['reg-semester'].value, '');
});
test('kelas: banyak semester & kode bebas (3_A) — ganti semester memfilter kelas', function () {
  const e = kelasEnv(['3_1', '3_A', '5_1', '7_B'], [3, 5, 7]); e.ctx.populateKelasSelects();
  assert.strictEqual(vals(e, 'lecturer-semester'), '3,5,7');
  assert.strictEqual(vals(e, 'lecturer-kelas'), '3_1,3_A');
  e.sels['lecturer-semester'].value = '7'; e.ctx.onSemesterPairChange('lecturer-semester', 'lecturer-kelas');
  assert.strictEqual(vals(e, 'lecturer-kelas'), '7_B'); assert.strictEqual(e.sels['lecturer-kelas'].value, '7_B');
  e.sels['reg-semester'].value = '3'; e.ctx.onSemesterPairChange('reg-semester', 'reg-kelas');
  assert.strictEqual(vals(e, 'reg-kelas'), ',3_1,3_A'); assert.strictEqual(e.sels['reg-kelas'].disabled, false);
});
test('kelas: dipanggil dua kali tidak menggandakan opsi; nilai terpilih dipertahankan', function () {
  const e = kelasEnv(); e.ctx.populateKelasSelects();
  e.sels['sched-filter-kelas'].value = '5_3'; e.sels['lecturer-kelas'].value = '5_4'; e.ctx.populateKelasSelects();
  assert.strictEqual(e.sels['sched-filter-kelas'].options.length, 6); assert.strictEqual(e.sels['sched-filter-kelas'].value, '5_3');
  assert.strictEqual(e.sels['lecturer-kelas'].options.length, 5); assert.strictEqual(e.sels['lecturer-kelas'].value, '5_4');
  assert.strictEqual(e.sels['lecturer-semester'].options.length, 1);
});
test('kelas: mengubah daftar dari server (CONFIG.KELAS_LIST + semesters) cukup untuk semua select', function () {
  const e = kelasEnv(); e.ctx.CONFIG.KELAS_LIST = ['6_1', '6_2']; e.ctx.appState.setup.semesters = [6]; e.ctx.populateKelasSelects();
  ['lecturer-kelas', 'sched-kelas'].forEach(function (id) { assert.strictEqual(vals(e, id), '6_1,6_2'); });
  assert.strictEqual(e.sels['lecturer-semester'].value, '6'); assert.strictEqual(e.sels['lecturer-kelas'].value, '6_1');
});
test('kelas: daftar kosong (belum setup) → select kosong tanpa error', function () {
  const e = kelasEnv([], []); e.ctx.populateKelasSelects();
  assert.strictEqual(vals(e, 'lecturer-kelas'), ''); assert.strictEqual(vals(e, 'reg-semester'), '');
});
test('kelas: initializeApp memuat cache setup & memanggil populateKelasSelects sebelum renderApp', function () {
  const body = extractFn(html, 'initializeApp');
  assert.ok(body.indexOf('populateKelasSelects()') !== -1);
  assert.ok(body.indexOf('populateKelasSelects()') < body.indexOf('renderApp()'));
  assert.ok(body.indexOf('loadCachedSetup()') !== -1 && body.indexOf('loadCachedSetup()') < body.indexOf('populateKelasSelects()'));
});

/* ---------- Setup awal & pendaftaran ---------- */
test('daftar: kelas belum disiapkan dosen → form daftar TIDAK dibuka, mahasiswa diberi arahan', async function () {
  const toasts = []; let opened = false;
  const c = load(['openRegisterModal'], {
    CONFIG: { KELAS_LIST: [] }, appState: { setup: { loaded: true } }, isApiConfigured: function () { return true; },
    loadSetupStatus: async function () {}, showToast: function (t, m) { toasts.push(m); },
    openModal: function () { opened = true; }, document: { getElementById: function () { return { value: '' }; } },
    fillSemesterSelect: function () {}, fillKelasSelect: function () {}, setupSemesters: function () { return []; }
  });
  await c.openRegisterModal('2301001');
  assert.strictEqual(opened, false); assert.ok(/Setup Awal/.test(toasts[0]));
});
test('daftar: hanya satu semester tersedia → langsung terpilih & kelas terisi', async function () {
  const sSel = { value: '' }; const filled = [];
  const c = load(['openRegisterModal'], {
    CONFIG: { KELAS_LIST: ['5_1'] }, appState: { setup: { loaded: true } }, isApiConfigured: function () { return true; },
    loadSetupStatus: async function () {}, showToast: function () {}, openModal: function () {},
    document: { getElementById: function (id) { return id === 'reg-semester' ? sSel : { value: '' }; } },
    fillSemesterSelect: function () {}, fillKelasSelect: function (id, sem) { filled.push([id, sem]); }, setupSemesters: function () { return [5]; }
  });
  await c.openRegisterModal('2301001');
  assert.strictEqual(sSel.value, '5'); assert.strictEqual(JSON.stringify(filled[0]), JSON.stringify(['reg-kelas', '5']));
});
test('PIN: callAdmin meminta PIN saat server menolak, mengulang dengan PIN benar', async function () {
  const calls = []; let asked = 0;
  const c = load(['callAdmin'], {
    appState: { setup: { hasPin: false } }, _dosenPin: '', showToast: function () {},
    requestPin: async function () { asked++; return '1234'; },
    apiRequest: async function (a, d) {
      calls.push(d.pin);
      return d.pin === '1234' ? { success: true, data: {} } : { success: false, message: 'PIN dosen diperlukan', data: { code: 'PIN_REQUIRED' } };
    }
  });
  const r = await c.callAdmin('saveSetup', { classes: [] });
  assert.strictEqual(r.success, true); assert.strictEqual(asked, 1);
  assert.strictEqual(JSON.stringify(calls), JSON.stringify(['', '1234']));
});
test('PIN: dibatalkan → callAdmin mengembalikan cancelled tanpa memanggil server', async function () {
  let hit = 0;
  const c = load(['callAdmin'], {
    appState: { setup: { hasPin: true } }, _dosenPin: '', showToast: function () {},
    requestPin: async function () { return null; }, apiRequest: async function () { hit++; return { success: true }; }
  });
  const r = await c.callAdmin('deleteClass', {});
  assert.strictEqual(r.cancelled, true); assert.strictEqual(hit, 0);
});
test('PIN: networkError TIDAK dianggap PIN salah (PIN tidak dibuang)', async function () {
  const c = load(['callAdmin'], {
    appState: { setup: { hasPin: true } }, showToast: function () {}, requestPin: async function () { return null; },
    apiRequest: async function () { return { success: false, networkError: true, message: 'offline', data: null }; }
  });
  vm.runInContext("_dosenPin = 'abcd'", c);
  const r = await c.callAdmin('createCourse', {});
  assert.strictEqual(r.networkError, true); assert.strictEqual(vm.runInContext('_dosenPin', c), 'abcd');
});
test('dosen: mata kuliah difilter menurut semester terpilih', function () {
  const sel = { value: '', innerHTML: '' }; const hint = { innerHTML: '', textContent: '' };
  const c = load(['renderLecturerCourseOptions'], {
    escapeHtml: function (x) { return String(x); }, _lecturerCoursesLoaded: true,
    document: { getElementById: function (id) { return { 'lecturer-course': sel, 'lecturer-semester': { value: '3' }, 'lecturer-course-hint': hint }[id] || null; } },
    appState: { lecturer: { courses: [
      { courseId: 'A', mataKuliah: 'Kalkulus', semester: 1 }, { courseId: 'B', mataKuliah: 'Struktur Data', semester: 3 }, { courseId: 'C', mataKuliah: 'Basis Data', semester: 5 }
    ] } }
  });
  c.renderLecturerCourseOptions();
  assert.ok(/Struktur Data/.test(sel.innerHTML) && !/Kalkulus/.test(sel.innerHTML) && !/Basis Data/.test(sel.innerHTML));
  c.document.getElementById('lecturer-semester').value = '8';
  const sel2 = { value: '', innerHTML: '' };
  const c2 = load(['renderLecturerCourseOptions'], {
    escapeHtml: function (x) { return String(x); }, _lecturerCoursesLoaded: true,
    document: { getElementById: function (id) { return { 'lecturer-course': sel2, 'lecturer-semester': { value: '8' }, 'lecturer-course-hint': hint }[id] || null; } },
    appState: { lecturer: { courses: [{ courseId: 'A', mataKuliah: 'Kalkulus', semester: 1 }] } }
  });
  c2.renderLecturerCourseOptions();
  assert.ok(/Belum ada mata kuliah semester 8/.test(sel2.innerHTML)); assert.ok(/Pengaturan/.test(hint.innerHTML));
});
test('kelas mahasiswa tidak ada di daftar → diminta memilih ulang (sekali per sesi); kelas valid → diam', function () {
  const opened = [];
  const mk = function (kelas) {
    return load(['ensureStudentClassValid'], {
      appState: { student: { kelas: kelas }, setup: { loaded: true } }, CONFIG: { KELAS_LIST: ['5_1', '5_2'] },
      normalizeKelasClient: function (v) { return String(v).trim().toUpperCase(); }, openClassModal: function (n) { opened.push(n); }, _classPromptShown: false
    });
  };
  mk('5_1').ensureStudentClassValid(); assert.strictEqual(opened.length, 0);
  const c = mk('4_9'); c.ensureStudentClassValid(); c.ensureStudentClassValid();
  assert.strictEqual(opened.length, 1); assert.ok(/4_9/.test(opened[0]));
});

(async function () {
  let pass = 0, fail = 0;
  for (const [n, f] of T) {
    try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e && e.message)); }
  }
  console.log('\n' + pass + ' lolos, ' + fail + ' gagal (frontend logic)');
  process.exit(fail ? 1 : 0);
})();
