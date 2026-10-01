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
  const ctx = vm.createContext(Object.assign({ console: console }, stubs));
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

/* ---------- Fase 6: daftar kelas ---------- */
function fakeSelect(optionsHtmlValues, initial) {
  const sel = { options: optionsHtmlValues.map(function (v) { return { value: v[0], textContent: v[1] }; }), value: initial === undefined ? '' : initial };
  sel.appendChild = function (o) { sel.options.push(o); };
  sel.removeChild = function (o) { sel.options.splice(sel.options.indexOf(o), 1); };
  return sel;
}
function kelasEnv() {
  const sels = {
    'lecturer-kelas': fakeSelect([], ''), 'sched-filter-kelas': fakeSelect([['', 'Semua Kelas']], ''),
    'sched-kelas': fakeSelect([], ''), 'reg-kelas': fakeSelect([['', 'Pilih kelas']], '')
  };
  const ctx = vm.createContext({
    CONFIG: { KELAS_LIST: ['5_1', '5_2', '5_3', '5_4', '5_5'] },
    document: { getElementById: function (id) { return sels[id] || null; }, createElement: function () { return { value: '', textContent: '' }; } }
  });
  vm.runInContext(extractFn(html, 'populateKelasSelects'), ctx);
  return { ctx: ctx, sels: sels };
}
test('kelas: index.html tidak lagi punya <option value="5_x"> hardcoded; 5_x hanya di CONFIG.KELAS_LIST', function () {
  assert.strictEqual((html.match(/<option value="5_[1-5]"/g) || []).length, 0);
  const lines = html.split('\n').filter(function (l) { return /5_[1-5]/.test(l); });
  assert.strictEqual(lines.length, 1); assert.ok(/KELAS_LIST:/.test(lines[0]));
});
test('kelas: populateKelasSelects mengisi 4 select; placeholder dipertahankan; default form dosen 5_1', function () {
  const e = kelasEnv(); e.ctx.populateKelasSelects();
  const vals = function (id) { return e.sels[id].options.map(function (o) { return o.value; }).join(','); };
  assert.strictEqual(vals('lecturer-kelas'), '5_1,5_2,5_3,5_4,5_5');
  assert.strictEqual(vals('sched-kelas'), '5_1,5_2,5_3,5_4,5_5');
  assert.strictEqual(vals('sched-filter-kelas'), ',5_1,5_2,5_3,5_4,5_5');   // + "Semua Kelas"
  assert.strictEqual(e.sels['sched-filter-kelas'].options[0].textContent, 'Semua Kelas');
  assert.strictEqual(vals('reg-kelas'), ',5_1,5_2,5_3,5_4,5_5');           // + "Pilih kelas"
  assert.strictEqual(e.sels['reg-kelas'].options[0].textContent, 'Pilih kelas');
  assert.strictEqual(e.sels['lecturer-kelas'].value, '5_1');
  assert.strictEqual(e.sels['sched-filter-kelas'].value, ''); assert.strictEqual(e.sels['reg-kelas'].value, '');
});
test('kelas: dipanggil dua kali tidak menggandakan opsi; nilai terpilih dipertahankan', function () {
  const e = kelasEnv(); e.ctx.populateKelasSelects();
  e.sels['sched-filter-kelas'].value = '5_3'; e.ctx.populateKelasSelects();
  assert.strictEqual(e.sels['sched-filter-kelas'].options.length, 6); assert.strictEqual(e.sels['sched-filter-kelas'].value, '5_3');
  assert.strictEqual(e.sels['lecturer-kelas'].options.length, 5);
});
test('kelas: mengubah CONFIG.KELAS_LIST saja cukup untuk semua select (satu sumber)', function () {
  const e = kelasEnv(); e.ctx.CONFIG.KELAS_LIST = ['6_1', '6_2']; e.ctx.populateKelasSelects();
  ['lecturer-kelas', 'sched-kelas'].forEach(function (id) { assert.strictEqual(e.sels[id].options.map(function (o) { return o.value; }).join(','), '6_1,6_2'); });
  assert.strictEqual(e.sels['lecturer-kelas'].value, '6_1');
});
test('kelas: initializeApp memanggil populateKelasSelects sebelum renderApp', function () {
  const body = extractFn(html, 'initializeApp');
  assert.ok(body.indexOf('populateKelasSelects()') !== -1);
  assert.ok(body.indexOf('populateKelasSelects()') < body.indexOf('renderApp()'));
});

(async function () {
  let pass = 0, fail = 0;
  for (const [n, f] of T) {
    try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + (e && e.message)); }
  }
  console.log('\n' + pass + ' lolos, ' + fail + ' gagal (frontend logic)');
  process.exit(fail ? 1 : 0);
})();
