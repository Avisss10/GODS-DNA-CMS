/**
 * Runner utama: menjalankan 01-unit-testing.js -> 02-integration-testing.js
 * -> 03-http-testing.js -> 04-performa-enkripsi.js SECARA BERURUTAN,
 * masing-masing sebagai proses Node terpisah (supaya isolasi antar bagian
 * terjaga — mis. mock database di bagian unit testing tidak pernah
 * "bocor" ke bagian integration/HTTP testing yang memakai DB nyata).
 *
 * Mencetak header per bagian, meneruskan seluruh output asli tiap
 * script, lalu mencetak ringkasan akhir gabungan.
 */
const path = require('path');
const { spawnSync } = require('child_process');
const { waktuWIB } = require('./lib/logger');

const BACKEND_DIR = path.join(__dirname, '..');

const STAGES = [
  { file: '01-unit-testing.js', title: 'BAGIAN 1 — UNIT TESTING (UT-01 s.d. UT-17)' },
  { file: '02-integration-testing.js', title: 'BAGIAN 2 — INTEGRATION TESTING (IT-01 s.d. IT-05)' },
  { file: '03-http-testing.js', title: 'BAGIAN 3 — HTTP TESTING (HT-01 s.d. HT-11)' },
  { file: '04-performa-enkripsi.js', title: 'BAGIAN 4 — PERFORMA ENKRIPSI AES-256-CBC (Tabel 4.6 s.d. 4.9)' },
];

const SUMMARY_MARKER = '__EVIDENCE_SUMMARY__ ';

function parseMachineSummary(output) {
  const lines = output.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const idx = lines[i].indexOf(SUMMARY_MARKER);
    if (idx !== -1) {
      try {
        return JSON.parse(lines[i].slice(idx + SUMMARY_MARKER.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function runStage(stage, nomor) {
  console.log('');
  console.log('#'.repeat(80));
  console.log(`# ${nomor}. ${stage.title}`);
  console.log('#'.repeat(80));

  const scriptPath = path.join(__dirname, stage.file);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: BACKEND_DIR,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.error(`GAGAL menjalankan ${stage.file}: ${result.error.message}`);
    return { title: stage.title, total: 0, passed: 0, gagalDijalankan: true };
  }

  const summary = parseMachineSummary(result.stdout || '');
  if (!summary) {
    console.error(`⚠ Tidak menemukan ringkasan mesin-terbaca dari ${stage.file} (exit code ${result.status}) — dianggap gagal dijalankan.`);
    return { title: stage.title, total: 0, passed: 0, gagalDijalankan: true };
  }
  return { title: stage.title, ...summary };
}

function main() {
  console.log('='.repeat(80));
  console.log("GOD'S DNA CMS — EVIDENCE RUNNER (bukti eksekusi nyata terhadap kode di src/)");
  console.log('='.repeat(80));
  console.log(`Waktu mulai    : ${waktuWIB()}`);
  console.log(`Versi Node.js  : ${process.version}`);
  console.log(`Working dir    : ${BACKEND_DIR}`);

  const hasil = STAGES.map((stage, i) => runStage(stage, i + 1));

  console.log('');
  console.log('='.repeat(80));
  console.log('RINGKASAN AKHIR — SEMUA BAGIAN');
  console.log('='.repeat(80));

  const headers = ['Bagian', 'Sesuai/Total', 'Status'];
  const rows = hasil.map((h) => [
    h.title,
    `${h.passed}/${h.total}`,
    h.gagalDijalankan ? 'GAGAL DIJALANKAN' : (h.passed === h.total ? 'SEMUA SESUAI' : 'ADA YANG TIDAK SESUAI'),
  ]);
  const widths = [0, 1, 2].map((c) => Math.max(headers[c].length, ...rows.map((r) => String(r[c]).length)));
  const fmt = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ');
  console.log(fmt(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));
  rows.forEach((r) => console.log(fmt(r)));

  const grandTotal = hasil.reduce((s, h) => s + h.total, 0);
  const grandPassed = hasil.reduce((s, h) => s + h.passed, 0);
  const adaGagalDijalankan = hasil.some((h) => h.gagalDijalankan);

  console.log('');
  console.log(`GRAND TOTAL: ${grandPassed}/${grandTotal} skenario sesuai ekspektasi di seluruh bagian.`);
  console.log(`Waktu selesai  : ${waktuWIB()}`);

  process.exitCode = adaGagalDijalankan ? 1 : 0;
}

main();
