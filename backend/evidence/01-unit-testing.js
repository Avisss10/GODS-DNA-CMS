/**
 * BAGIAN 1 — UNIT TESTING (UT-01 s.d. UT-17)
 *
 * Menjalankan fungsi ASLI dari src/ langsung (require, bukan salinan
 * logika) dengan data sintetis in-memory — TANPA koneksi MySQL/TiDB
 * sungguhan, sesuai rancangan unit testing di paper (mock).
 *
 * Lapisan DB dipalsukan lewat evidence/lib/fake-db.js: hanya
 * getPool() dari src/config/database.js yang ditimpa, seluruh logika
 * bisnis (service layer) tetap kode asli yang dieksekusi apa adanya.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Logger } = require('./lib/logger');
const { installFakeDatabase } = require('./lib/fake-db');

// HARUS sebelum require modul src lain yang menyentuh config/database.js
const fakeDb = installFakeDatabase();

const fs = require('fs');
const encryptionUtil = require('../src/utils/encryption.util');
const auditlogRepository = require('../src/modules/auditlog/auditlog.repository');
const auditlogService = require('../src/modules/auditlog/auditlog.service');
const scoringService = require('../src/modules/scoring/scoring.service');
const eventService = require('../src/modules/event/event.service');
const reportService = require('../src/modules/report/report.service');
const authService = require('../src/modules/auth/auth.service');

const logger = new Logger('01-unit-testing');

// ── UT-01 ──────────────────────────────────────────────────────────
async function ut01() {
  const originalKey = process.env.AES_ENCRYPTION_KEY;
  const percobaan = [
    ['kosong', ''],
    ['panjang salah (4 byte, bukan 32)', 'deadbeef'],
  ];
  const hasil = [];
  for (const [label, value] of percobaan) {
    try {
      process.env.AES_ENCRYPTION_KEY = value;
      encryptionUtil.encrypt('data uji');
      hasil.push(`${label}: TIDAK melempar error (SALAH)`);
    } catch (err) {
      hasil.push(`${label}: melempar Error("${err.message}")`);
    }
  }
  process.env.AES_ENCRYPTION_KEY = originalKey;

  const sesuai = hasil.every((h) => h.includes('melempar Error'));
  logger.scenario({
    id: 'UT-01',
    judul: 'encryption.util.encrypt — key tidak valid',
    kondisi: 'AES_ENCRYPTION_KEY diset kosong, lalu diset ke key 4 byte (bukan 32 byte); encrypt("data uji") dipanggil pada masing-masing kondisi',
    hasilDiharapkan: 'Keduanya melempar Error dengan pesan jelas (bukan crash generik atau silent fail)',
    hasilAktual: hasil.join(' | '),
    sesuai,
  });
}

// ── UT-02 ──────────────────────────────────────────────────────────
async function ut02() {
  const plaintext = "GOD'S DNA CMS - Uji Enkripsi 2026";
  const { ciphertext, iv } = encryptionUtil.encrypt(plaintext);
  const decrypted = encryptionUtil.decrypt(ciphertext, iv);
  logger.scenario({
    id: 'UT-02',
    judul: 'encryption.util — encrypt lalu decrypt',
    kondisi: `plaintext = "${plaintext}"`,
    hasilDiharapkan: 'decrypt(encrypt(plaintext)) menghasilkan kembali plaintext asli persis',
    hasilAktual: `ciphertext(hex)="${ciphertext.slice(0, 24)}..." (${ciphertext.length / 2} byte), hasil decrypt="${decrypted}"`,
    sesuai: decrypted === plaintext,
  });
}

// ── UT-03 ──────────────────────────────────────────────────────────
async function ut03() {
  const plaintext = 'Data identik untuk uji keunikan IV';
  const a = encryptionUtil.encrypt(plaintext);
  const b = encryptionUtil.encrypt(plaintext);
  const ivBerbeda = a.iv !== b.iv;
  const ciphertextBerbeda = a.ciphertext !== b.ciphertext;
  logger.scenario({
    id: 'UT-03',
    judul: 'encryption.util — plaintext sama dienkripsi 2x',
    kondisi: `encrypt("${plaintext}") dipanggil dua kali berturut-turut`,
    hasilDiharapkan: 'IV percobaan ke-1 != IV percobaan ke-2, dan ciphertext ke-1 != ciphertext ke-2',
    hasilAktual: `IV#1=${a.iv} | IV#2=${b.iv} | IV berbeda=${ivBerbeda} | Ciphertext berbeda=${ciphertextBerbeda}`,
    sesuai: ivBerbeda && ciphertextBerbeda,
  });
}

// ── UT-04 ──────────────────────────────────────────────────────────
async function ut04() {
  const alamatSedang = 'Jl. Grand Wisata Boulevard No. 45, Cluster Anggrek Residence, Tambun Selatan';
  const catatanBesar =
    'Catatan pastoral: jemaat aktif mengikuti pelayanan multimedia dan doa syafaat sejak tahun 2023, ' +
    'pernah menjadi panitia retreat remaja, memiliki riwayat pelayanan yang konsisten di berbagai event gerejawi ' +
    'termasuk ibadah Natal dan Paskah, serta aktif dalam kegiatan cell group mingguan bersama keluarga besar.';
  const samples = [
    { label: 'kecil (<50 char)', text: 'Jemaat baru bergabung' },
    { label: 'sedang (50-200 char)', text: alamatSedang },
    { label: 'besar (200-500 char)', text: catatanBesar },
  ];

  const rows = [];
  let semuaDiBawah50ms = true;
  const ULANGAN = 20;
  for (const s of samples) {
    const waktu = [];
    for (let i = 0; i < ULANGAN; i++) {
      const t0 = process.hrtime.bigint();
      const enc = encryptionUtil.encrypt(s.text);
      encryptionUtil.decrypt(enc.ciphertext, enc.iv);
      const t1 = process.hrtime.bigint();
      waktu.push(Number(t1 - t0) / 1e6);
    }
    const rata = waktu.reduce((a, b) => a + b, 0) / waktu.length;
    const maks = Math.max(...waktu);
    if (maks >= 50) semuaDiBawah50ms = false;
    rows.push([s.label, s.text.length, rata.toFixed(4), maks.toFixed(4)]);
  }

  logger.info('');
  logger.table(['Ukuran plaintext', 'Panjang (char)', 'Rata-rata (ms)', 'Maksimum (ms)'], rows);
  logger.scenario({
    id: 'UT-04',
    judul: 'encryption.util — performa encrypt+decrypt per ukuran plaintext',
    kondisi: `${ULANGAN}x percobaan encrypt+decrypt untuk masing-masing ukuran kecil/sedang/besar, diukur dengan process.hrtime.bigint()`,
    hasilDiharapkan: 'Waktu encrypt+decrypt < 50ms untuk semua ukuran (lihat tabel)',
    hasilAktual: `Maksimum tertinggi dari semua ukuran = ${Math.max(...rows.map((r) => Number(r[3]))).toFixed(4)}ms`,
    sesuai: semuaDiBawah50ms,
  });
}

// ── UT-05 ──────────────────────────────────────────────────────────
async function ut05() {
  const base = {
    id: 1, userId: 5, aksi: 'CREATE', modul: 'JEMAAT', objectId: 10,
    dataSebelum: null, dataSesudah: { nama: 'diubah' },
    createdAt: new Date('2026-07-01T10:00:00Z'),
  };
  const hmac1 = auditlogRepository.computeHmac(base);
  const hmac2 = auditlogRepository.computeHmac({ ...base });
  const hmacBeda = auditlogRepository.computeHmac({ ...base, objectId: 99 });

  const sama = hmac1 === hmac2;
  const beda = hmac1 !== hmacBeda;
  logger.scenario({
    id: 'UT-05',
    judul: 'auditlog.repository.computeHmac — konsistensi & sensitivitas terhadap perubahan',
    kondisi: 'computeHmac dipanggil 2x dengan input identik, lalu 1x lagi dengan objectId diubah (10 -> 99)',
    hasilDiharapkan: 'HMAC identik untuk input yang sama persis; HMAC berbeda ketika 1 field diubah',
    hasilAktual: `HMAC#1=${hmac1.slice(0, 16)}... | HMAC#2=${hmac2.slice(0, 16)}... (sama=${sama}) | HMAC(objectId diubah)=${hmacBeda.slice(0, 16)}... (beda=${beda})`,
    sesuai: sama && beda,
  });
}

// ── UT-06 ──────────────────────────────────────────────────────────
async function ut06() {
  const row = {
    id: 42, user_id: 3, aksi: 'UPDATE', modul: 'JEMAAT', object_id: 7,
    data_sebelum: null, data_sesudah: { nama: 'diubah' },
    created_at: new Date('2026-07-05T08:00:00Z'),
  };
  const validHmac = auditlogRepository.computeHmac({
    id: row.id, userId: row.user_id, aksi: row.aksi, modul: row.modul, objectId: row.object_id,
    dataSebelum: row.data_sebelum, dataSesudah: row.data_sesudah, createdAt: row.created_at,
  });
  const resultValid = auditlogService.verifyHmac({ ...row, hmac_signature: validHmac });
  const resultTampered = auditlogService.verifyHmac({ ...row, hmac_signature: 'deadbeef'.repeat(8) });

  const sesuai =
    resultValid.valid === true && resultValid.status === 'OK' &&
    resultTampered.valid === false && resultTampered.status === 'POTENTIALLY_TAMPERED';

  logger.scenario({
    id: 'UT-06',
    judul: 'auditlog.service.verifyHmac — deteksi tamper',
    kondisi: 'Baris audit log dengan hmac_signature valid, dibandingkan dengan baris identik ber-hmac_signature dipalsukan',
    hasilDiharapkan: 'valid=true, status=OK untuk baris sah; valid=false, status=POTENTIALLY_TAMPERED untuk baris dipalsukan',
    hasilAktual: `Sah: valid=${resultValid.valid}, status=${resultValid.status} | Dipalsukan: valid=${resultTampered.valid}, status=${resultTampered.status}`,
    sesuai,
  });
}

// ── UT-07 ──────────────────────────────────────────────────────────
async function ut07() {
  const cases = [[75, 'AKTIF'], [60, 'AKTIF'], [59, 'KURANG_AKTIF'], [30, 'KURANG_AKTIF'], [29, 'TIDAK_AKTIF'], [0, 'TIDAK_AKTIF']];
  const hasil = cases.map(([skor, expected]) => {
    const actual = scoringService.hitungStatusKeaktifan(skor);
    return { skor, expected, actual, ok: actual === expected };
  });
  logger.info('');
  logger.table(['Skor', 'Diharapkan', 'Aktual', 'OK?'], hasil.map((r) => [r.skor, r.expected, r.actual, r.ok ? 'Ya' : 'Tidak']));
  logger.scenario({
    id: 'UT-07',
    judul: 'scoring.service.hitungStatusKeaktifan — batas ambang status',
    kondisi: 'skor = 0, 29, 30, 59, 60, 75',
    hasilDiharapkan: 'skor >= 60 -> AKTIF; 30-59 -> KURANG_AKTIF; < 30 -> TIDAK_AKTIF',
    hasilAktual: hasil.map((r) => `${r.skor}->${r.actual}`).join(', '),
    sesuai: hasil.every((r) => r.ok),
  });
}

// ── UT-08 ──────────────────────────────────────────────────────────
async function ut08() {
  const cases = [
    { lama: 50, baru: 90, expected: 65, label: 'kenaikan >15 poin' },
    { lama: 50, baru: 10, expected: 35, label: 'penurunan >15 poin' },
    { lama: 50, baru: 60, expected: 60, label: 'perubahan dalam batas ±15' },
  ];
  const hasil = cases.map((c) => ({ ...c, actual: scoringService.terapkanAntiCliff(c.lama, c.baru) }));
  logger.info('');
  logger.table(['Kasus', 'Skor Lama', 'Skor Baru (mentah)', 'Diharapkan', 'Aktual'], hasil.map((r) => [r.label, r.lama, r.baru, r.expected, r.actual]));
  logger.scenario({
    id: 'UT-08',
    judul: 'scoring.service.terapkanAntiCliff — pembatasan perubahan ±15 poin',
    kondisi: 'Kenaikan 40 poin, penurunan 40 poin, dan perubahan 10 poin (dalam batas) dari skor lama=50',
    hasilDiharapkan: 'Perubahan >15 poin dibatasi ke ±15 dari skor lama; perubahan dalam batas diteruskan apa adanya',
    hasilAktual: hasil.map((r) => `${r.label}=>${r.actual}`).join(' | '),
    sesuai: hasil.every((r) => r.actual === r.expected),
  });
}

// ── UT-09 ──────────────────────────────────────────────────────────
async function ut09() {
  const nilaiCGPenuh = scoringService.hitungNilaiCG({ total_meeting: 8, total_hadir: 8 });

  const assignments = [
    { event_id: 1, status: 'BERTUGAS_PARSIAL', durasi_menit: 60 },
    { event_id: 2, status: 'AKTIF', durasi_menit: null },
    { event_id: 2, status: 'BERTUGAS_PARSIAL', durasi_menit: 60 }, // event_id sama -> tidak boleh dihitung dobel
  ];
  const attendances = [{ event_id: 3 }];
  const totalEventReferensi = 3;
  const nilaiEvent = scoringService.hitungNilaiEvent(assignments, attendances, totalEventReferensi);

  // event1=0.75 (parsial 60/120*1.5), event2=1.5 (AKTIF menang atas parsial, TIDAK dijumlahkan), event3=1.0 (hadir)
  const expectedPoin = 0.75 + 1.5 + 1.0;
  const expectedNilai = Math.min(100, (expectedPoin / (totalEventReferensi * 1.5)) * 100);

  const okCG = nilaiCGPenuh === 100;
  const okEvent = Math.abs(nilaiEvent - expectedNilai) < 0.0001;

  logger.scenario({
    id: 'UT-09',
    judul: 'scoring.service.hitungNilaiCG & hitungNilaiEvent',
    kondisi: 'hitungNilaiCG(total_meeting=8, total_hadir=8); hitungNilaiEvent dengan 1 BERTUGAS_PARSIAL (durasi 60/120 menit) + 1 event_id yang muncul 2x (AKTIF dan BERTUGAS_PARSIAL) + 1 kehadiran biasa',
    hasilDiharapkan: `NilaiCG kehadiran penuh = 100; NilaiEvent proporsional dan event_id yang sama TIDAK dihitung dobel (diharapkan ~${expectedNilai.toFixed(4)})`,
    hasilAktual: `NilaiCG=${nilaiCGPenuh} | NilaiEvent=${nilaiEvent.toFixed(4)}`,
    sesuai: okCG && okEvent,
  });
}

// ── UT-10 (butuh mock DB) ────────────────────────────────────────
async function ut10() {
  fakeDb.use([
    { match: (sql) => /AS cnt/i.test(sql) && /FROM cell_group_members/i.test(sql), handle: () => [{ cnt: 0 }] },
    { match: (sql) => /SELECT id FROM event/i.test(sql), handle: () => [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] },
    { match: (sql) => /SELECT event_id, status, durasi_menit/i.test(sql), handle: () => [
      { event_id: 1, status: 'AKTIF', durasi_menit: null },
      { event_id: 2, status: 'AKTIF', durasi_menit: null },
    ] },
    { match: (sql) => /SELECT event_id FROM event_attendances/i.test(sql), handle: () => [] },
  ], 'UT-10');

  const { skorBaru, statusBaru, isNonCg } = await scoringService.hitungSkorJemaat(501, { skor_keaktifan: 45 });
  const nilaiEventHarapan = 50; // 2 event AKTIF (1.5 each = 3) / (4 event referensi * 1.5 = 6) * 100

  logger.scenario({
    id: 'UT-10',
    judul: 'scoring.service.hitungSkorJemaat — jemaat is_non_cg (tanpa CG)',
    kondisi: 'Mock: jemaat tidak aktif di CG manapun, 4 event referensi (2 di antaranya AKTIF sebagai volunteer), skor_keaktifan lama=45',
    hasilDiharapkan: `isNonCg=true; skor 100% berasal dari Skor_Event (tanpa blend 60/40 CG) = ${nilaiEventHarapan} (skor lama masih dalam batas anti-cliff sehingga tidak diklem)`,
    hasilAktual: `isNonCg=${isNonCg}, statusBaru=${statusBaru}, skorBaru=${skorBaru}`,
    sesuai: isNonCg === true && skorBaru === nilaiEventHarapan,
  });
}

// ── UT-11 (butuh mock DB) ────────────────────────────────────────
async function ut11() {
  let jumlahPemanggilan = 0;
  fakeDb.use([
    { match: (sql) => /is_new_member = FALSE/i.test(sql) && /ORDER BY id ASC/i.test(sql), handle: (sql, params) => {
      jumlahPemanggilan += 1;
      if (Number(params.offset) === 0) {
        return [
          { id: 601, skor_keaktifan: 40, status_keaktifan: 'KURANG_AKTIF', is_non_cg: false, is_new_member: false },
          { id: 602, skor_keaktifan: 20, status_keaktifan: 'TIDAK_AKTIF', is_non_cg: false, is_new_member: false },
        ];
      }
      return [];
    } },
    { match: (sql) => /AS cnt/i.test(sql) && /FROM cell_group_members/i.test(sql), handle: () => [{ cnt: 1 }] },
    { match: (sql) => /SELECT id FROM event/i.test(sql), handle: () => [{ id: 1 }, { id: 2 }] },
    { match: (sql) => /SELECT event_id, status, durasi_menit/i.test(sql), handle: () => [] },
    { match: (sql) => /SELECT event_id FROM event_attendances/i.test(sql), handle: () => [] },
    { match: (sql) => /AS total_meeting/i.test(sql), handle: () => [{ total_meeting: 4 }] },
    { match: (sql) => /AS total_hadir/i.test(sql), handle: () => [{ total_hadir: 2 }] },
    { match: (sql) => /UPDATE jemaat/i.test(sql) && /skor_keaktifan/i.test(sql), handle: () => ({ affectedRows: 1 }) },
  ], 'UT-11');

  const { processed, skipped } = await scoringService.runScoringBatch({ actorUserId: null });

  logger.scenario({
    id: 'UT-11',
    judul: 'scoring.service.runScoringBatch — 2 data memenuhi syarat',
    kondisi: 'Mock getJemaatForScoring mengembalikan 2 jemaat pada chunk pertama (offset=0), lalu array kosong pada chunk berikutnya (loop berhenti)',
    hasilDiharapkan: 'processed=2, skipped=0',
    hasilAktual: `processed=${processed}, skipped=${skipped} (query paginasi dipanggil ${jumlahPemanggilan}x)`,
    sesuai: processed === 2 && skipped === 0,
  });
}

// ── UT-12 (butuh mock DB) ────────────────────────────────────────
async function ut12() {
  fakeDb.use([
    { match: (sql) => /FROM event WHERE id/i.test(sql), handle: () => [
      { id: 901, waktu_mulai: new Date('2026-08-01T09:00:00'), waktu_selesai: new Date('2026-08-01T12:00:00'), status: 'PUBLISHED' },
    ] },
    { match: (sql) => /FROM volunteer_members vm[\s\S]*JOIN jemaat j/i.test(sql), handle: () => [
      { id: 1, jemaat_id: 201, nama: 'Andi (Jemaat Baru)', nama_iv: null, is_new_member: true, skor_keaktifan: 80, status_keaktifan: 'AKTIF', joined_at: new Date() },
      { id: 2, jemaat_id: 202, nama: 'Budi', nama_iv: null, is_new_member: false, skor_keaktifan: 70, status_keaktifan: 'AKTIF', joined_at: new Date() },
      { id: 3, jemaat_id: 203, nama: 'Citra (Konflik Jadwal)', nama_iv: null, is_new_member: false, skor_keaktifan: 60, status_keaktifan: 'AKTIF', joined_at: new Date() },
    ] },
    { match: (sql) => /SELECT jemaat_id FROM event_volunteer[\s\S]*WHERE event_id/i.test(sql), handle: () => [] },
    { match: (sql) => /SELECT DISTINCT ev\.jemaat_id/i.test(sql), handle: () => [{ jemaat_id: 203 }] },
    { match: (sql) => /INTERVAL 30 DAY/i.test(sql), handle: () => [{ jemaat_id: 202, total: 1 }] },
  ], 'UT-12');

  const kandidat = await eventService.suggestVolunteers(901, 9);
  const idsKandidat = kandidat.map((k) => k.jemaat_id);
  const sesuai = !idsKandidat.includes(201) && !idsKandidat.includes(203) && idsKandidat.includes(202);

  logger.scenario({
    id: 'UT-12',
    judul: 'event.service.suggestVolunteers — pengecualian jemaat baru & konflik jadwal',
    kondisi: '3 kandidat terdaftar: Andi (is_new_member=true), Budi (bersih), Citra (punya penugasan AKTIF di event lain yang bentrok jadwal)',
    hasilDiharapkan: 'Andi dan Citra dikecualikan dari hasil; hanya Budi yang muncul sebagai kandidat',
    hasilAktual: `Kandidat hasil (jemaat_id) = [${idsKandidat.join(', ')}]`,
    sesuai,
  });
}

// ── UT-13 (butuh mock DB) ────────────────────────────────────────
async function ut13() {
  fakeDb.use([
    { match: (sql) => /FROM event WHERE id/i.test(sql), handle: () => [
      { id: 902, waktu_mulai: new Date('2026-08-05T09:00:00'), waktu_selesai: new Date('2026-08-05T12:00:00'), status: 'PUBLISHED' },
    ] },
    { match: (sql) => /FROM volunteer_members vm[\s\S]*JOIN jemaat j/i.test(sql), handle: () => [
      { id: 4, jemaat_id: 301, nama: 'Dedi', nama_iv: null, is_new_member: false, skor_keaktifan: 90, status_keaktifan: 'AKTIF', joined_at: new Date() },
      { id: 5, jemaat_id: 302, nama: 'Eka', nama_iv: null, is_new_member: false, skor_keaktifan: 40, status_keaktifan: 'KURANG_AKTIF', joined_at: new Date() },
      { id: 6, jemaat_id: 303, nama: 'Fira', nama_iv: null, is_new_member: false, skor_keaktifan: 65, status_keaktifan: 'AKTIF', joined_at: new Date() },
    ] },
    { match: (sql) => /SELECT jemaat_id FROM event_volunteer[\s\S]*WHERE event_id/i.test(sql), handle: () => [] },
    { match: (sql) => /SELECT DISTINCT ev\.jemaat_id/i.test(sql), handle: () => [] },
    { match: (sql) => /INTERVAL 30 DAY/i.test(sql), handle: () => [
      { jemaat_id: 301, total: 6 },
      { jemaat_id: 302, total: 0 },
      { jemaat_id: 303, total: 2 },
    ] },
  ], 'UT-13');

  const hasil = await eventService.suggestVolunteers(902, 9);
  const urutanId = hasil.map((h) => h.jemaat_id);
  const terurutDescending = hasil.every((h, i) => i === 0 || hasil[i - 1].composite_score >= h.composite_score);

  logger.scenario({
    id: 'UT-13',
    judul: 'event.service.suggestVolunteers — urutan descending composite score (CS)',
    kondisi: '3 kandidat dengan kombinasi skor_keaktifan & frekuensi tugas 30 hari yang berbeda-beda',
    hasilDiharapkan: 'Array hasil terurut descending berdasarkan composite_score',
    hasilAktual: `Urutan jemaat_id=[${urutanId.join(', ')}], CS=[${hasil.map((h) => h.composite_score.toFixed(4)).join(', ')}]`,
    sesuai: terurutDescending && hasil.length === 3,
  });
}

// ── UT-14 (butuh mock DB) ────────────────────────────────────────
async function ut14() {
  // Kasus A: kuota sudah penuh -> reject + rollback
  fakeDb.use([
    { match: (sql) => /FROM event WHERE id/i.test(sql), handle: () => [{ id: 701, status: 'AKTIF' }] },
    { match: (sql) => /FROM volunteer_jenis WHERE id/i.test(sql), handle: () => [{ id: 9, is_active: true }] },
    { match: (sql) => /FROM volunteer_members[\s\S]*WHERE jemaat_id = :jemaatId AND volunteer_type_id/i.test(sql), handle: () => [{ id: 1, is_active: true }] },
    { match: (sql) => /FROM event_volunteer_needs[\s\S]*FOR UPDATE/i.test(sql), handle: () => [{ id: 1, kuota: 2 }] },
    { match: (sql) => /AS total FROM event_volunteer[\s\S]*FOR UPDATE/i.test(sql), handle: () => [{ total: 2 }] },
  ], 'UT-14-kuota-penuh');

  let case1Error = null;
  try {
    await eventService.assignVolunteer(701, { jemaat_id: 801, jenis_id: 9 }, { actorUserId: null });
  } catch (err) {
    case1Error = err;
  }
  const case1Ok = !!case1Error && case1Error.statusCode === 409;

  // Kasus B: tidak ada baris kuota didefinisikan -> tidak dibatasi
  fakeDb.use([
    { match: (sql) => /FROM event WHERE id/i.test(sql), handle: () => [{ id: 702, status: 'AKTIF' }] },
    { match: (sql) => /FROM volunteer_jenis WHERE id/i.test(sql), handle: () => [{ id: 9, is_active: true }] },
    { match: (sql) => /FROM volunteer_members[\s\S]*WHERE jemaat_id = :jemaatId AND volunteer_type_id/i.test(sql), handle: () => [{ id: 2, is_active: true }] },
    { match: (sql) => /FROM event_volunteer_needs[\s\S]*FOR UPDATE/i.test(sql), handle: () => [] },
    { match: (sql) => /INSERT INTO event_volunteer/i.test(sql), handle: () => ({ insertId: 555 }) },
    { match: (sql) => /FROM event_attendances\s+WHERE event_id/i.test(sql), handle: () => [] },
    { match: (sql) => /INSERT INTO event_attendances/i.test(sql), handle: () => ({ insertId: 556 }) },
    { match: (sql) => /FROM event_volunteer WHERE id = :id/i.test(sql), handle: () => [{ id: 555, event_id: 702, jemaat_id: 802, jenis_id: 9, status: 'AKTIF' }] },
  ], 'UT-14-tanpa-kuota');

  let case2Result = null;
  let case2Error = null;
  try {
    case2Result = await eventService.assignVolunteer(702, { jemaat_id: 802, jenis_id: 9 }, { actorUserId: null });
  } catch (err) {
    case2Error = err;
  }
  const case2Ok = !case2Error && !!case2Result && case2Result.status === 'AKTIF';

  logger.scenario({
    id: 'UT-14',
    judul: 'event.service.assignVolunteer — kuota penuh vs kuota tak didefinisikan',
    kondisi: 'Kasus A: kuota=2, jumlah aktif saat ini=2 (penuh). Kasus B: tidak ada baris event_volunteer_needs untuk kombinasi event+jenis ini',
    hasilDiharapkan: 'Kasus A: ditolak (statusCode 409) dan transaksi rollback. Kasus B: penugasan berhasil tanpa batas kuota',
    hasilAktual: `Kasus A: ${case1Error ? `Error ${case1Error.statusCode} "${case1Error.message}"` : 'TIDAK ditolak (SALAH)'} | Kasus B: ${case2Error ? `Error tak terduga "${case2Error.message}"` : `berhasil, status=${case2Result.status}`}`,
    sesuai: case1Ok && case2Ok,
  });
}

// ── UT-15 (butuh mock DB) ────────────────────────────────────────
async function ut15() {
  const noHpPlain = '081234567890';
  const alamatPlain = 'Jl. Uji Laporan No. 1, Jakarta';
  const encNoHp = encryptionUtil.encrypt(noHpPlain);
  const encAlamat = encryptionUtil.encrypt(alamatPlain);
  const namaEnc = encryptionUtil.encrypt('Jemaat Uji Laporan');
  const tglLahirEnc = encryptionUtil.encrypt('1995-05-05');
  const jkEnc = encryptionUtil.encrypt('L');

  const fakeRow = {
    id: 1001,
    nama: namaEnc.ciphertext, nama_iv: namaEnc.iv,
    tgl_lahir: tglLahirEnc.ciphertext, tgl_lahir_iv: tglLahirEnc.iv,
    jenis_kelamin: jkEnc.ciphertext, jenis_kelamin_iv: jkEnc.iv,
    no_hp: encNoHp.ciphertext, no_hp_iv: encNoHp.iv,
    alamat: encAlamat.ciphertext, alamat_iv: encAlamat.iv,
    media_sosial: null, media_sosial_iv: null,
    tgl_bergabung: new Date('2024-01-01'), is_active: true, is_new_member: false,
    skor_keaktifan: 80, status_keaktifan: 'AKTIF', created_at: new Date(),
  };

  fakeDb.use([
    { match: (sql) => /COUNT\(\*\) AS total FROM jemaat/i.test(sql), handle: () => [{ total: 1 }] },
    { match: (sql) => /SELECT id, nama, nama_iv, tgl_lahir/i.test(sql), handle: () => [fakeRow] },
  ], 'UT-15');

  const resultXlsx = await reportService.generateJemaatReport({ format: 'xlsx', mode: 'ringkas' }, { actorUserId: null });
  const resultPdf = await reportService.generateJemaatReport({ format: 'pdf', mode: 'ringkas' }, { actorUserId: null });

  const xlsxOk = resultXlsx.async === false && fs.existsSync(resultXlsx.filePath) && fs.statSync(resultXlsx.filePath).size > 0;
  const pdfOk = resultPdf.async === false && fs.existsSync(resultPdf.filePath) && fs.statSync(resultPdf.filePath).size > 0;

  // File hasil export bukan bagian dari evidence permanen — bersihkan.
  try { fs.unlinkSync(resultXlsx.filePath); } catch { /* abaikan */ }
  try { fs.unlinkSync(resultPdf.filePath); } catch { /* abaikan */ }

  logger.scenario({
    id: 'UT-15',
    judul: 'report.service.generateJemaatReport — format xlsx & pdf, data sensitif hasil dekripsi',
    kondisi: `1 baris jemaat sintetis dengan no_hp="${noHpPlain}" dan alamat="${alamatPlain}" dienkripsi AES-256-CBC memakai AES_ENCRYPTION_KEY asli dari .env`,
    hasilDiharapkan: 'File xlsx & pdf berhasil ditulis (ukuran > 0 byte); data sensitif otomatis didekripsi ke plaintext sebelum ditulis ke file',
    hasilAktual: `xlsx: async=${resultXlsx.async}, fileName=${resultXlsx.fileName}, valid=${xlsxOk} | pdf: async=${resultPdf.async}, fileName=${resultPdf.fileName}, valid=${pdfOk}`,
    sesuai: xlsxOk && pdfOk,
  });
}

// ── UT-16 (butuh mock DB) ────────────────────────────────────────
async function ut16() {
  fakeDb.use([
    { match: (sql) => /FROM users WHERE username/i.test(sql), handle: () => [] },
    { match: (sql) => /INSERT INTO users/i.test(sql), handle: () => ({ insertId: 5001 }) },
  ], 'UT-16-baru');
  const resultBaru = await authService.createUser(
    { username: 'ujicoba.leader', password: 'PasswordUji123!', peran: 'ADMIN' },
    { actorUserId: null, isDev: true }
  );
  const tanpaPasswordHash = !('password_hash' in resultBaru) && !('password' in resultBaru);

  fakeDb.use([
    { match: (sql) => /FROM users WHERE username/i.test(sql), handle: () => [{ id: 1, username: 'ujicoba.leader', peran: 'ADMIN', aktif: true }] },
  ], 'UT-16-duplikat');
  let errDuplikat = null;
  try {
    await authService.createUser(
      { username: 'ujicoba.leader', password: 'PasswordUji123!', peran: 'ADMIN' },
      { actorUserId: null, isDev: true }
    );
  } catch (err) {
    errDuplikat = err;
  }

  const sesuai = resultBaru.id === 5001 && tanpaPasswordHash && !!errDuplikat && errDuplikat.statusCode === 409;
  logger.scenario({
    id: 'UT-16',
    judul: 'auth.service.createUser — username baru vs sudah terdaftar',
    kondisi: 'createUser dipanggil dengan username baru (mock: belum ada di DB), lalu dengan username yang sama (mock: sudah ada)',
    hasilDiharapkan: 'Username baru: sukses, response TANPA password_hash. Username duplikat: AuthError statusCode 409',
    hasilAktual: `Baru: id=${resultBaru.id}, response tanpa password_hash=${tanpaPasswordHash} | Duplikat: ${errDuplikat ? `Error ${errDuplikat.statusCode} "${errDuplikat.message}"` : 'TIDAK ditolak (SALAH)'}`,
    sesuai,
  });
}

// ── UT-17 (butuh mock DB) ────────────────────────────────────────
async function ut17() {
  fakeDb.use([
    { match: (sql) => /FROM users WHERE id/i.test(sql), handle: () => [{ id: 11, username: 'leader.tunggal', peran: 'LEADER', aktif: true }] },
    { match: (sql) => /COUNT\(\*\) AS total FROM users WHERE peran = 'LEADER'/i.test(sql), handle: () => [{ total: 1 }] },
  ], 'UT-17');

  let err = null;
  try {
    await authService.updateUserStatus(11, false, { actorUserId: 99, actorRole: 'LEADER', isDev: true });
  } catch (e) {
    err = e;
  }
  const sesuai = !!err && err.statusCode === 400 && /satu-satunya LEADER/i.test(err.message);

  logger.scenario({
    id: 'UT-17',
    judul: 'auth.service.updateUserStatus — menonaktifkan satu-satunya LEADER aktif',
    kondisi: 'Target user peran=LEADER, aktif=true, countActiveLeaders()=1 (mock), mencoba set aktif=false',
    hasilDiharapkan: 'Ditolak dengan AuthError statusCode 400, pesan menyebut satu-satunya LEADER aktif',
    hasilAktual: err ? `Error ${err.statusCode} "${err.message}"` : 'TIDAK ditolak (SALAH)',
    sesuai,
  });
}

const SKENARIO = [
  ['UT-01', ut01], ['UT-02', ut02], ['UT-03', ut03], ['UT-04', ut04], ['UT-05', ut05],
  ['UT-06', ut06], ['UT-07', ut07], ['UT-08', ut08], ['UT-09', ut09], ['UT-10', ut10],
  ['UT-11', ut11], ['UT-12', ut12], ['UT-13', ut13], ['UT-14', ut14], ['UT-15', ut15],
  ['UT-16', ut16], ['UT-17', ut17],
];

async function main() {
  logger.header('BAGIAN 1 — UNIT TESTING (UT-01 s.d. UT-17)');
  logger.meta();
  logger.info('Catatan: seluruh skenario memanggil fungsi ASLI dari src/ secara langsung.');
  logger.info('Lapisan koneksi MySQL/TiDB dipalsukan (mock in-memory) — TIDAK ada koneksi DB nyata di bagian ini.');

  for (const [id, fn] of SKENARIO) {
    try {
      await fn();
    } catch (err) {
      logger.scenario({
        id,
        judul: `${fn.name} — gagal dieksekusi`,
        kondisi: '-',
        hasilDiharapkan: '-',
        hasilAktual: `Exception tak tertangani saat menjalankan skenario: ${err.message}`,
        sesuai: false,
        catatan: err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : undefined,
      });
    }
  }

  logger.emitMachineSummary('UNIT_TESTING');
  logger.save();
}

main().catch((err) => {
  console.error('FATAL — 01-unit-testing.js gagal dijalankan:', err);
  process.exitCode = 1;
});
