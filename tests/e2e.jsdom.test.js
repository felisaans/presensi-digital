/* Uji end-to-end: frontend asli (jsdom) ↔ backend v2.4.0 (mock Sheets). Jalankan: npm i jsdom && node tests/e2e.jsdom.test.js */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');   // butuh: npm i jsdom (opsional)
const { newEnv } = require(ROOT + '/tests/backend.test.js');
const env = newEnv({ legacy: true });
// instalasi BARU: kosongkan data
['Students','Schedules','Sessions','Attendance'].forEach(n => env.sheets[n].rows.splice(1));
env.sheets.Courses.rows.splice(1);
let html = fs.readFileSync(ROOT + '/index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/presensi/',
  beforeParse(w) {
    w.fetch = async (url, opts) => {
      const body = (opts && opts.body) ? JSON.parse(opts.body) : null;
      const out = body ? env.call(body.action, body.data) : JSON.parse(env.run('doGet')({}).getContent());
      return { ok: true, status: 200, json: async () => out, text: async () => JSON.stringify(out) };
    };
    w.confirm = () => true;
    w.HTMLCanvasElement.prototype.getContext = () => null;
    w.scrollTo = () => {};
  } });
const w = dom.window, d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = id => d.getElementById(id);
(async () => {
  await sleep(600);
  // 1. Instalasi baru → banner setup tampil
  assert.ok(!$('setup-banner').classList.contains('hidden'), 'banner setup harus tampil');
  // 2. Mahasiswa login NPM baru → ditolak halus karena kelas belum disiapkan
  $('input-npm').value = '2401001'; w.handleStudentLogin({ preventDefault(){} }); await sleep(400);
  assert.ok(!$('register-modal').classList.contains('active'), 'form daftar tidak boleh terbuka');
  // 3. Dosen: Mulai Absensi → diarahkan ke Setup Awal
  await w.openLecturerSetup(); await sleep(400);
  assert.ok(!$('lecturer-config-view').classList.contains('hidden'), 'harus ke Setup Awal');
  assert.strictEqual($('config-title').textContent, 'Setup Awal');
  // 4. Isi wizard: semester 3 kelas A, semester 5 cepat 2 kelas, mata kuliah, PIN
  $('cfg-add-semester').value = '3'; $('cfg-add-kode').value = 'a'; w.addClassDraft();
  $('cfg-add-semester').value = '5'; $('cfg-add-count').value = '2'; w.quickAddClasses();
  assert.ok(/3_A/.test($('cfg-classes').textContent) && /5_2/.test($('cfg-classes').textContent));
  $('cfg-prodi').value = 'Teknik Informatika'; $('cfg-pin').value = 'dosen123';
  await w.saveSetupConfig(); await sleep(500);
  assert.ok($('setup-banner').classList.contains('hidden'), 'banner hilang setelah setup');
  assert.deepStrictEqual(Array.from(w.eval('CONFIG.KELAS_LIST')), ['3_A','5_1','5_2']);
  // 5. Tambah mata kuliah (PIN sudah di memori)
  await w.openSetupManager(); await sleep(400);
  $('cfg-course-name').value = 'Struktur Data'; $('cfg-course-sem').value = '3'; await w.addCourseCfg(); await sleep(400);
  assert.ok(/Struktur Data/.test($('cfg-courses').textContent));
  // 6. Mahasiswa daftar: pilih semester → kelas terfilter
  w.leaveSetupManager();
  await w.openRegisterModal('2401001'); await sleep(200);
  assert.ok($('register-modal').classList.contains('active'));
  assert.deepStrictEqual(Array.from($('reg-semester').options).map(o => o.value), ['', '3', '5']);
  $('reg-nama').value = 'Siti Aminah'; $('reg-semester').value = '5'; w.onSemesterPairChange('reg-semester','reg-kelas');
  assert.deepStrictEqual(Array.from($('reg-kelas').options).map(o => o.value), ['', '5_1', '5_2']);
  $('reg-kelas').value = '5_2';
  await w.handleRegisterStudent({ preventDefault(){} }); await sleep(700);
  assert.strictEqual(w.eval('appState.student.kelas'), '5_2'); assert.strictEqual(Number(w.eval('appState.student.semester')), 5);
  // 7. Mahasiswa naik semester lewat Ubah Kelas
  w.openClassModal(); $('cls-semester').value = '3'; w.onSemesterPairChange('cls-semester','cls-kelas'); $('cls-kelas').value = '3_A';
  await w.handleSaveClass({ preventDefault(){} }); await sleep(700);
  assert.strictEqual(w.eval('appState.student.kelas'), '3_A'); assert.strictEqual(Number(w.eval('appState.student.semester')), 3);
  // 8. Dosen buka form sesi: semester & mata kuliah mengikuti
  await w.openLecturerSetup(); await sleep(500);
  assert.deepStrictEqual(Array.from($('lecturer-semester').options).map(o => o.value), ['3','5']);
  $('lecturer-semester').value = '3'; w.onLecturerSemesterChange();
  assert.ok(/Struktur Data/.test($('lecturer-course').innerHTML));
  $('lecturer-semester').value = '5'; w.onLecturerSemesterChange();
  assert.ok(/Belum ada mata kuliah semester 5/.test($('lecturer-course').innerHTML));
  console.log('E2E OK — semua langkah lolos');
  process.exit(0);
})().catch(e => { console.error('E2E GAGAL:', e.message); process.exit(1); });
