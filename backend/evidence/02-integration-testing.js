/**
 * BAGIAN 2 — INTEGRATION TESTING (IT-01 s.d. IT-05)
 *
 * WAJIB memakai koneksi MySQL/TiDB dan Redis NYATA dari .env (bukan
 * mock). Setiap skenario memanggil fungsi ASLI dari src/ langsung.
 * Setiap skenario yang membuat data melakukan cleanup (hapus baris
 * yang baru dibuat) di akhir, supaya database asli tidak kotor.
 *
 * Jika koneksi DB gagal, script menampilkan pesan gagal yang jujur
 * untuk setiap skenario dan TETAP lanjut ke bagian berikutnya (tidak
 * menghentikan seluruh proses evidence).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Logger } = require('./lib/logger');
const { getPool, testConnection, closePool } = require('../src/config/database');
const { testRedisConnection, closeRedis } = require('../src/config/redis');

const logger = new Logger('02-integration-testing');

// ── IT-01 ──────────────────────────────────────────────────────────
async function it01() {
  const auditlogRepository = require('../src/modules/auditlog/auditlog.repository');
  const pool = getPool();

  const id = await auditlogRepository.recordAuditLog({
    userId: null, aksi: 'CREATE', modul: 'EVIDENCE_IT01', objectId: 999901,
    dataSebelum: null, dataSesudah: { keterangan: 'Baris uji IT-01, aman dihapus' },
  });

  const sebelumTamper = await auditlogRepository.findByIdWithVerification(id);

  // Manipulasi langsung via SQL manual (mensimulasikan serangan tamper) —
  // BUKAN lewat repository, supaya hmac_signature lama tidak ikut
  // diperbarui — itulah yang membuat verifikasi ulang berikutnya gagal.
  await pool.query(
    'UPDATE audit_logs SET data_sesudah = :val WHERE id = :id',
    { val: JSON.stringify({ keterangan: 'DIUBAH PAKSA VIA SQL MANUAL' }), id }
  );

  const setelahTamper = await auditlogRepository.findByIdWithVerification(id);

  // Cleanup: baris ini murni data uji evidence. DELETE manual di sini
  // hanya untuk skenario pengujian — aplikasi asli tetap append-only
  // (privilege REVOKE UPDATE/DELETE berlaku untuk user aplikasi, bukan
  // koneksi root yang dipakai script evidence ini).
  await pool.query('DELETE FROM audit_logs WHERE id = :id', { id });

  const sesuai = sebelumTamper.isTampered === false && setelahTamper.isTampered === true;
  logger.scenario({
    id: 'IT-01',
    judul: 'auditlog.repository — deteksi tamper via DB nyata',
    kondisi: `recordAuditLog() ke DB TiDB asli (id=${id}), lalu data_sesudah diubah langsung via SQL manual (bypass HMAC), lalu diverifikasi ulang`,
    hasilDiharapkan: 'Sebelum tamper: isTampered=false. Setelah tamper manual: isTampered=true',
    hasilAktual: `Sebelum=${sebelumTamper.isTampered} | Setelah=${setelahTamper.isTampered}`,
    sesuai,
    catatan: 'Baris uji dihapus otomatis di akhir skenario (cleanup).',
  });
}

// ── IT-02 ──────────────────────────────────────────────────────────
async function it02() {
  const jemaatService = require('../src/modules/jemaat/jemaat.service');
  const pool = getPool();

  const nama = `Evidence IT02 Duplikat ${Date.now()}`;
  const tglLahir = '1990-01-01';

  const pertama = await jemaatService.createJemaat(
    { nama, tgl_lahir: tglLahir, jenis_kelamin: 'L', tgl_bergabung: '2026-01-01' },
    { confirmed: true, actorUserId: null }
  );

  const kedua = await jemaatService.createJemaat(
    { nama, tgl_lahir: tglLahir, jenis_kelamin: 'L', tgl_bergabung: '2026-01-01' },
    { confirmed: false, actorUserId: null }
  );

  // Cleanup baris pertama — baris kedua tidak pernah tersimpan (itulah
  // yang sedang dibuktikan skenario ini).
  await pool.query('DELETE FROM jemaat WHERE id = :id', { id: pertama.id });

  const jumlahKandidat = kedua.duplicates?.byNameAndBirthdate?.length ?? 0;
  const sesuai = kedua.requiresConfirmation === true && jumlahKandidat > 0;
  logger.scenario({
    id: 'IT-02',
    judul: 'jemaat.service.createJemaat — deteksi duplikat nama+tgl_lahir (data nyata)',
    kondisi: `Insert jemaat "${nama}" (tgl_lahir ${tglLahir}) ke DB nyata, lalu insert lagi dengan nama+tgl_lahir identik tanpa confirmed`,
    hasilDiharapkan: 'Percobaan kedua: requiresConfirmation=true, duplicates berisi kandidat, dan TIDAK ada baris kedua yang tersimpan',
    hasilAktual: `requiresConfirmation=${kedua.requiresConfirmation}, jumlah kandidat duplikat ditemukan=${jumlahKandidat}`,
    sesuai,
    catatan: 'Baris uji (percobaan pertama, id=' + pertama.id + ') dihapus otomatis di akhir skenario (cleanup).',
  });
}

// ── IT-03 ──────────────────────────────────────────────────────────
async function it03() {
  const jemaatService = require('../src/modules/jemaat/jemaat.service');
  const scoringService = require('../src/modules/scoring/scoring.service');
  const pool = getPool();

  // Jemaat baru sungguhan (is_new_member=TRUE otomatis oleh repository) — harus di-skip batch.
  const jemaatBaru = await jemaatService.createJemaat(
    {
      nama: `Evidence IT03 Baru ${Date.now()}`, tgl_lahir: '2000-01-01', jenis_kelamin: 'P',
      tgl_bergabung: new Date().toISOString().slice(0, 10),
    },
    { confirmed: true, actorUserId: null }
  );

  const [rowsBaruSebelum] = await pool.query(
    'SELECT skor_keaktifan, is_new_member FROM jemaat WHERE id = :id', { id: jemaatBaru.id }
  );

  // Ambil satu jemaat AKTIF nyata (bukan baru) untuk memeriksa anti-cliff.
  const [existingCandidates] = await pool.query(
    `SELECT id, skor_keaktifan FROM jemaat
     WHERE is_active = TRUE AND deleted_at IS NULL AND is_new_member = FALSE
     LIMIT 1`
  );
  const existingJemaat = existingCandidates[0] || null;
  const skorSebelum = existingJemaat ? Number(existingJemaat.skor_keaktifan) : null;

  const { processed, skipped } = await scoringService.runScoringBatch({ actorUserId: null });

  const [rowsBaruSetelah] = await pool.query(
    'SELECT skor_keaktifan, is_new_member FROM jemaat WHERE id = :id', { id: jemaatBaru.id }
  );

  let antiCliffOk = true;
  let infoExisting = 'Tidak ada jemaat existing (bukan baru) yang bisa diperiksa di database ini.';
  if (existingJemaat) {
    const [rowsExistingSetelah] = await pool.query(
      'SELECT skor_keaktifan FROM jemaat WHERE id = :id', { id: existingJemaat.id }
    );
    const skorSetelah = Number(rowsExistingSetelah[0].skor_keaktifan);
    const delta = Math.abs(skorSetelah - skorSebelum);
    antiCliffOk = delta <= 15;
    infoExisting = `Jemaat existing id=${existingJemaat.id}: skor ${skorSebelum} -> ${skorSetelah} (delta=${delta.toFixed(2)}, memenuhi anti-cliff (<=15)=${antiCliffOk})`;
  }

  // Cleanup jemaat baru uji.
  await pool.query('DELETE FROM jemaat WHERE id = :id', { id: jemaatBaru.id });

  const isNewMemberFlag = rowsBaruSebelum[0].is_new_member === 1 || rowsBaruSebelum[0].is_new_member === true;
  const skorTidakBerubah = Number(rowsBaruSebelum[0].skor_keaktifan) === Number(rowsBaruSetelah[0].skor_keaktifan);

  const sesuai = isNewMemberFlag && skorTidakBerubah && antiCliffOk;
  logger.scenario({
    id: 'IT-03',
    judul: 'scoring.service.runScoringBatch — data nyata, jemaat baru di-skip, anti-cliff diterapkan',
    kondisi: 'runScoringBatch() dijalankan terhadap SELURUH data jemaat nyata di database, termasuk 1 jemaat baru yang baru saja dibuat (is_new_member=true)',
    hasilDiharapkan: 'Jemaat baru TIDAK ikut diproses (skor tidak berubah); untuk jemaat existing, perubahan skor dibatasi maksimal ±15 poin (anti-cliff)',
    hasilAktual: `Batch: processed=${processed}, skipped=${skipped}. Jemaat baru (id=${jemaatBaru.id}): is_new_member=${rowsBaruSebelum[0].is_new_member}, skor tidak berubah=${skorTidakBerubah}. ${infoExisting}`,
    sesuai,
    catatan: 'PENTING: skenario ini menjalankan scoring batch pada SELURUH jemaat nyata di database (perilaku asli runScoringBatch, sama seperti cron malam), bukan hanya data uji. Baris jemaat baru uji dihapus di akhir; skor jemaat existing yang ikut ter-update TIDAK dikembalikan ke nilai semula karena itu adalah efek nyata dan sah dari fungsi scoring.',
  });
}

// ── IT-04 ──────────────────────────────────────────────────────────
async function it04() {
  const eventService = require('../src/modules/event/event.service');
  const jemaatService = require('../src/modules/jemaat/jemaat.service');
  const volunteerJenisRepository = require('../src/modules/volunteer/volunteer-jenis.repository');
  const volunteerMemberRepository = require('../src/modules/volunteer/volunteer-member.repository');
  const authRepository = require('../src/modules/auth/auth.repository');
  const { hashPassword } = require('../src/utils/password.util');
  const pool = getPool();

  const suffix = Date.now();
  const jenisNama = `Evidence IT04 Jenis ${suffix}`;
  let jenisId = null;
  let event = null;
  let jemaatA = null;
  let jemaatB = null;
  let actorUserId = null;

  try {
    // event.created_by adalah FK NOT NULL ke users(id) — butuh actor
    // sungguhan, bukan null, supaya createEvent() tidak ditolak DB.
    actorUserId = await authRepository.createUser({
      username: `evidence_it04_actor_${suffix}`,
      passwordHash: await hashPassword('EvidenceUji123!'),
      peran: 'LEADER',
    });

    jenisId = await volunteerJenisRepository.create({ nama: jenisNama, deskripsi: 'Uji konkurensi kuota (evidence)' });

    jemaatA = await jemaatService.createJemaat(
      { nama: `Evidence IT04 A ${suffix}`, tgl_lahir: '1995-02-02', jenis_kelamin: 'L', tgl_bergabung: '2020-01-01' },
      { confirmed: true, actorUserId }
    );
    jemaatB = await jemaatService.createJemaat(
      { nama: `Evidence IT04 B ${suffix}`, tgl_lahir: '1996-03-03', jenis_kelamin: 'P', tgl_bergabung: '2020-01-01' },
      { confirmed: true, actorUserId }
    );

    await volunteerMemberRepository.register(jemaatA.id, jenisId);
    await volunteerMemberRepository.register(jemaatB.id, jenisId);

    event = await eventService.createEvent(
      { judul: `Evidence IT04 Event ${suffix}`, jenis: 'IBADAH', waktu_mulai: '2026-09-01 09:00:00', waktu_selesai: '2026-09-01 11:00:00' },
      { actorUserId }
    );

    await eventService.updateVolunteerNeeds(event.id, [{ jenis_id: jenisId, kuota: 1 }], { actorUserId });

    const [hasilA, hasilB] = await Promise.allSettled([
      eventService.assignVolunteer(event.id, { jemaat_id: jemaatA.id, jenis_id: jenisId }, { actorUserId }),
      eventService.assignVolunteer(event.id, { jemaat_id: jemaatB.id, jenis_id: jenisId }, { actorUserId }),
    ]);

    const fulfilled = [hasilA, hasilB].filter((r) => r.status === 'fulfilled');
    const rejected = [hasilA, hasilB].filter((r) => r.status === 'rejected');
    const rejectedIs409 = rejected.length === 1 && rejected[0].reason?.statusCode === 409;

    const sesuai = fulfilled.length === 1 && rejectedIs409;
    logger.scenario({
      id: 'IT-04',
      judul: 'event.service.assignVolunteer — race condition kuota tersisa 1 (pessimistic lock)',
      kondisi: `Kuota jenis "${jenisNama}" pada 1 event diset 1, lalu 2 request assignVolunteer dikirim BERSAMAAN (Promise.allSettled) untuk 2 jemaat berbeda terhadap kuota yang sama`,
      hasilDiharapkan: 'Hanya 1 dari 2 request yang berhasil (fulfilled); yang lain ditolak dengan statusCode 409 (kuota penuh) berkat SELECT ... FOR UPDATE di dalam transaksi',
      hasilAktual: `Berhasil=${fulfilled.length}/2, Ditolak=${rejected.length}/2${rejected.length ? ` (statusCode=${rejected[0].reason?.statusCode}, pesan="${rejected[0].reason?.message}")` : ''}`,
      sesuai,
      catatan: 'Seluruh data uji (event, jemaat, volunteer_jenis, volunteer_members, event_volunteer*) dihapus otomatis di akhir skenario (cleanup).',
    });
  } finally {
    // Cleanup — urutan mengikuti FK: event_volunteer/event_attendances/
    // event_volunteer_needs (referensi ke event) -> event -> volunteer_members
    // (referensi ke jemaat) -> jemaat -> volunteer_jenis.
    if (event) {
      await pool.query('DELETE FROM event_volunteer WHERE event_id = :eventId', { eventId: event.id });
      await pool.query('DELETE FROM event_attendances WHERE event_id = :eventId', { eventId: event.id });
      await pool.query('DELETE FROM event_volunteer_needs WHERE event_id = :eventId', { eventId: event.id });
      await pool.query('DELETE FROM event WHERE id = :id', { id: event.id });
    }
    if (jenisId) {
      await pool.query('DELETE FROM volunteer_members WHERE volunteer_type_id = :jenisId', { jenisId });
    }
    const jemaatIds = [jemaatA?.id, jemaatB?.id].filter(Boolean);
    if (jemaatIds.length > 0) {
      await pool.query('DELETE FROM jemaat WHERE id IN (:ids)', { ids: jemaatIds });
    }
    if (jenisId) {
      await pool.query('DELETE FROM volunteer_jenis WHERE id = :id', { id: jenisId });
    }
    if (actorUserId) {
      await pool.query('DELETE FROM users WHERE id = :id', { id: actorUserId });
    }
  }
}

// ── IT-05 ──────────────────────────────────────────────────────────
async function it05() {
  const authRepository = require('../src/modules/auth/auth.repository');
  const { hashPassword } = require('../src/utils/password.util');
  const pool = getPool();

  const username = `evidence_it05_${Date.now()}`;
  const passwordHash = await hashPassword('EvidenceUji123!');
  const id = await authRepository.createUser({ username, passwordHash, peran: 'ADMIN' });

  const setelahCreate = await authRepository.findById(id);
  const tersimpanBenar = !!setelahCreate && setelahCreate.username === username &&
    setelahCreate.peran === 'ADMIN' && !!setelahCreate.aktif;

  await authRepository.updateAktif(id, false);
  const setelahUpdate = await authRepository.findById(id);
  const terupdateBenar = !!setelahUpdate && !setelahUpdate.aktif;

  await pool.query('DELETE FROM users WHERE id = :id', { id });

  const sesuai = tersimpanBenar && terupdateBenar;
  logger.scenario({
    id: 'IT-05',
    judul: 'auth.repository.createUser & updateAktif — ke DB nyata',
    kondisi: `createUser({username:"${username}", peran:"ADMIN"}) ke DB TiDB asli, lalu updateAktif(id, false)`,
    hasilDiharapkan: 'Baris tersimpan dengan data benar (aktif=true secara default) setelah create; aktif=false setelah updateAktif',
    hasilAktual: `Setelah create: username=${setelahCreate?.username}, peran=${setelahCreate?.peran}, aktif=${setelahCreate?.aktif} | Setelah updateAktif(false): aktif=${setelahUpdate?.aktif}`,
    sesuai,
    catatan: `Baris user uji (id=${id}) dihapus otomatis di akhir skenario (cleanup).`,
  });
}

const SKENARIO = [
  ['IT-01', 'auditlog.repository — deteksi tamper via DB nyata', it01],
  ['IT-02', 'jemaat.service.createJemaat — deteksi duplikat (data nyata)', it02],
  ['IT-03', 'scoring.service.runScoringBatch — data nyata', it03],
  ['IT-04', 'event.service.assignVolunteer — race condition kuota', it04],
  ['IT-05', 'auth.repository — createUser & updateAktif ke DB nyata', it05],
];

async function main() {
  logger.header('BAGIAN 2 — INTEGRATION TESTING (IT-01 s.d. IT-05)');
  logger.meta();
  logger.info('Catatan: seluruh skenario memanggil fungsi ASLI dari src/ dan memakai koneksi MySQL/TiDB (+ Redis untuk cek konektivitas) NYATA dari .env.');

  logger.sub('Cek koneksi infrastruktur');
  let dbOk = false;
  try {
    await testConnection();
    dbOk = true;
    logger.kv('MySQL/TiDB', `Terhubung (${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME})`);
  } catch (err) {
    logger.kv('MySQL/TiDB', `GAGAL TERHUBUNG — ${err.message}`);
  }

  try {
    const pong = await testRedisConnection();
    logger.kv('Redis', pong ? `Terhubung (${process.env.REDIS_HOST}:${process.env.REDIS_PORT})` : 'PING tidak mengembalikan PONG');
  } catch (err) {
    logger.kv('Redis', `GAGAL TERHUBUNG — ${err.message} (skenario IT-01..IT-05 tidak memerlukan Redis secara langsung, jadi tetap dilanjutkan)`);
  }

  if (!dbOk) {
    logger.info('');
    logger.info('⚠ Koneksi MySQL/TiDB gagal — seluruh skenario IT-01..IT-05 TIDAK dapat dijalankan.');
    logger.info('  Periksa kredensial DB_HOST/DB_USER/DB_PASSWORD/DB_NAME di backend/.env dan pastikan TiDB Cloud dapat diakses.');
    for (const [id, judul] of SKENARIO) {
      logger.scenarioGagalDijalankan({ id, judul, alasan: 'Koneksi MySQL/TiDB gagal' });
    }
  } else {
    for (const [id, judul, fn] of SKENARIO) {
      try {
        await fn();
      } catch (err) {
        logger.scenario({
          id,
          judul: `${judul} — gagal dieksekusi`,
          kondisi: '-',
          hasilDiharapkan: '-',
          hasilAktual: `Exception tak tertangani: ${err.message}`,
          sesuai: false,
          catatan: err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : undefined,
        });
      }
    }
  }

  logger.emitMachineSummary('INTEGRATION_TESTING');
  logger.save();

  await closePool();
  try { await closeRedis(); } catch { /* abaikan kalau memang belum sempat konek */ }
}

main().catch((err) => {
  console.error('FATAL — 02-integration-testing.js gagal dijalankan:', err);
  process.exitCode = 1;
});
