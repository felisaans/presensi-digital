/* Cek sintaks frontend: ekstrak <script> inline terbesar dari index.html → node --check.
 * Jalankan: node tests/frontend.check.js */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const cp = require('child_process');
// Komentar HTML dibuang dulu agar teks "script" di dalam komentar tidak terbaca sebagai tag.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, best = '';
while ((m = re.exec(html))) if (m[1].length > best.length) best = m[1];
if (!best) { console.error('Tidak ada <script> inline'); process.exit(1); }
const tmp = path.join(os.tmpdir(), 'presensi-frontend-check.js');
fs.writeFileSync(tmp, best);
try { cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); console.log('node --check frontend: OK (' + best.split('\n').length + ' baris script)'); }
catch (e) { console.error(String(e.stderr || e)); process.exit(1); }
