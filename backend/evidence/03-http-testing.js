/**
 * BAGIAN 3 — HTTP TESTING (HT-01 s.d. HT-11)
 *
 * Menjalankan server Express ASLI (src/app.js, lewat require('../src/server'))
 * dengan listen() sungguhan di port lokal acak, lalu mengirim request HTTP
 * nyata memakai fetch bawaan Node.js — BUKAN supertest. Server dimatikan
 * di akhir. Memakai koneksi MySQL/TiDB + Redis NYATA dari .env (login
 * memakai Redis untuk sesi/rate limit, jadi keduanya wajib menyala).
 *
 * Data uji (user/jemaat/event/volunteer_jenis) dibuat lewat endpoint HTTP
 * atau langsung lewat repository asli, dan dihapus di akhir (cleanup).
 *
 * KEKECUALIAN (disengaja, lihat HT-10 di bawah): untuk membuktikan aturan
 * "tidak dapat menonaktifkan satu-satunya LEADER aktif" lewat endpoint
 * HTTP asli, akun LEADER REAL lain di database dinonaktifkan SEMENTARA
 * (di-snapshot dulu) lalu DIKEMBALIKAN PERSIS ke status semula segera
 * setelah skenario itu selesai — dibungkus try/finally agar restore
 * tetap terjadi walau terjadi error.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Logger } = require('./lib/logger');
const logger = new Logger('03-http-testing');

const { app } = require('../src/server');
const { getPool, testConnection, closePool } = require('../src/config/database');
const { testRedisConnection, closeRedis } = require('../src/config/redis');
const authRepository = require('../src/modules/auth/auth.repository');
const { hashPassword } = require('../src/utils/password.util');

let server;
let baseUrl;

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function parseSetCookies(setCookieArr) {
  const jar = {};
  const flags = {};
  for (const line of setCookieArr) {
    const parts = line.split(';').map((p) => p.trim());
    const nameValue = parts[0];
    const idx = nameValue.indexOf('=');
    const name = nameValue.slice(0, idx);
    const value = nameValue.slice(idx + 1);
    jar[name] = value;
    flags[name] = parts.slice(1).map((a) => a.toLowerCase());
  }
  return { jar, flags };
}

async function api(method, urlPath, { body, jar = {}, headers = {}, raw = false } = {}) {
  const t0 = process.hrtime.bigint();
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(Object.keys(jar).length ? { Cookie: cookieHeader(jar) } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  const setCookieArr = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const { jar: setCookieJar, flags: setCookieFlags } = parseSetCookies(setCookieArr);

  let json = null;
  let buffer = null;
  const contentType = res.headers.get('content-type') || '';
  if (raw) {
    buffer = Buffer.from(await res.arrayBuffer());
  } else if (contentType.includes('application/json')) {
    json = await res.json().catch(() => null);
  }

  return { status: res.status, json, buffer, contentType, setCookieJar, setCookieFlags, ms };
}

function login(username, password) {
  return api('POST', '/api/auth/login', { body: { username, password } });
}

async function setupUsers() {
  const suffix = Date.now();
  const password = 'EvidenceHttp123!';
  const leaderUsername = `evidence_ht_leader_${suffix}`;
  const adminUsername = `evidence_ht_admin_${suffix}`;
  const passwordHash = await hashPassword(password);
  const leaderId = await authRepository.createUser({ username: leaderUsername, passwordHash, peran: 'LEADER' });
  const adminId = await authRepository.createUser({ username: adminUsername, passwordHash, peran: 'ADMIN' });
  return { leaderUsername, adminUsername, password, leaderId, adminId };
}

// ── HT-01 ──────────────────────────────────────────────────────────
async function ht01(ctx) {
  const salah = await login(ctx.leaderUsername, 'password-salah-sekali');
  const benar = await login(ctx.leaderUsername, ctx.password);
  ctx.leaderJar = benar.setCookieJar;

  const httpOnlyOk =
    (benar.setCookieFlags.access_token || []).includes('httponly') &&
    (benar.setCookieFlags.refresh_token || []).includes('httponly');

  const sesuai = salah.status === 401 && benar.status === 200 && httpOnlyOk;
  logger.scenario({
    id: 'HT-01',
    judul: 'POST /api/auth/login',
    kondisi: `Kredensial salah (password acak) untuk "${ctx.leaderUsername}", lalu kredensial valid`,
    hasilDiharapkan: 'Kredensial salah -> 401; kredensial valid -> 200 dengan cookie access_token & refresh_token httpOnly',
    hasilAktual: `Salah: ${salah.status} (${salah.ms.toFixed(1)}ms) | Valid: ${benar.status} (${benar.ms.toFixed(1)}ms), kedua cookie httpOnly=${httpOnlyOk}`,
    sesuai,
  });
}

// ── HT-02 ──────────────────────────────────────────────────────────
async function ht02(ctx) {
  const tanpaSesi = await api('POST', '/api/jemaat', {
    body: { nama: 'Evidence Tanpa Sesi', tgl_lahir: '2000-01-01', jenis_kelamin: 'L', tgl_bergabung: '2026-01-01' },
  });

  const nama = `Evidence HT02 ${Date.now()}`;
  const dataValid = { nama, tgl_lahir: '1992-02-02', jenis_kelamin: 'L', tgl_bergabung: '2026-01-01', no_hp: '081234500002' };
  const valid = await api('POST', '/api/jemaat', { body: dataValid, jar: ctx.leaderJar });
  if (valid.json?.id) {
    ctx.createdJemaatIds.push(valid.json.id);
    ctx.jemaatHt02 = { id: valid.json.id, no_hp: dataValid.no_hp };
  }

  const duplikat = await api('POST', '/api/jemaat', { body: dataValid, jar: ctx.leaderJar });

  const sesuai = tanpaSesi.status === 401 && valid.status === 201 && duplikat.status === 409;
  logger.scenario({
    id: 'HT-02',
    judul: 'POST /api/jemaat',
    kondisi: 'Tanpa cookie sesi; lalu dengan sesi LEADER valid + data baru; lalu ulangi persis data yang sama (duplikat)',
    hasilDiharapkan: 'Tanpa sesi -> 401; data valid -> 201; duplikat -> 409',
    hasilAktual: `Tanpa sesi: ${tanpaSesi.status} | Valid: ${valid.status} (id=${valid.json?.id}) | Duplikat: ${duplikat.status}`,
    sesuai,
  });
}

// ── HT-03 ──────────────────────────────────────────────────────────
async function ht03(ctx) {
  if (!ctx.jemaatHt02) {
    logger.scenarioGagalDijalankan({ id: 'HT-03', judul: 'GET /api/jemaat/:id vs /sensitive/no_hp', alasan: 'HT-02 gagal membuat data uji' });
    return;
  }
  const { id, no_hp } = ctx.jemaatHt02;
  const biasa = await api('GET', `/api/jemaat/${id}`, { jar: ctx.leaderJar });
  const sensitive = await api('GET', `/api/jemaat/${id}/sensitive/no_hp`, { jar: ctx.leaderJar });

  const ciphertextTerlihat = !!biasa.json?.no_hp && biasa.json.no_hp !== no_hp && /^[0-9a-f]+$/i.test(biasa.json.no_hp);
  const plaintextBenar = sensitive.json?.value === no_hp;

  const sesuai = biasa.status === 200 && sensitive.status === 200 && ciphertextTerlihat && plaintextBenar;
  logger.scenario({
    id: 'HT-03',
    judul: 'GET /api/jemaat/:id vs GET /api/jemaat/:id/sensitive/no_hp',
    kondisi: `Jemaat id=${id} dengan no_hp asli "${no_hp}"`,
    hasilDiharapkan: 'Endpoint biasa mengembalikan no_hp sebagai ciphertext hex; endpoint /sensitive/no_hp mengembalikan plaintext asli',
    hasilAktual: `GET biasa: no_hp="${biasa.json?.no_hp}" (terlihat ciphertext=${ciphertextTerlihat}) | GET sensitive: value="${sensitive.json?.value}" (plaintext benar=${plaintextBenar})`,
    sesuai,
  });
}

// ── HT-04 ──────────────────────────────────────────────────────────
async function ht04(ctx) {
  const invalid = await api('POST', '/api/events', {
    body: { judul: 'Evidence HT04 Invalid', jenis: 'IBADAH', waktu_mulai: '2026-10-01 12:00:00', waktu_selesai: '2026-10-01 10:00:00' },
    jar: ctx.leaderJar,
  });

  const judul = `Evidence HT04 ${Date.now()}`;
  const valid = await api('POST', '/api/events', {
    body: { judul, jenis: 'IBADAH', waktu_mulai: '2026-10-01 09:00:00', waktu_selesai: '2026-10-01 11:00:00' },
    jar: ctx.leaderJar,
  });
  if (valid.json?.id) {
    ctx.eventHt04 = valid.json;
    ctx.createdEventIds.push(valid.json.id);
  }

  const sesuai = invalid.status === 400 && valid.status === 201 && valid.json?.status === 'DRAFT';
  logger.scenario({
    id: 'HT-04',
    judul: 'POST /api/events',
    kondisi: 'waktu_selesai sebelum waktu_mulai; lalu data valid',
    hasilDiharapkan: 'waktu_selesai < waktu_mulai -> 400; data valid -> 201 dengan status DRAFT',
    hasilAktual: `Invalid: ${invalid.status} | Valid: ${valid.status}, status=${valid.json?.status}`,
    sesuai,
  });
}

// ── HT-05 ──────────────────────────────────────────────────────────
async function ht05(ctx) {
  if (!ctx.eventHt04) {
    logger.scenarioGagalDijalankan({ id: 'HT-05', judul: 'PATCH /api/events/:id/status', alasan: 'HT-04 gagal membuat event uji' });
    return;
  }
  const eventId = ctx.eventHt04.id;

  const invalid = await api('PATCH', `/api/events/${eventId}/status`, { body: { status: 'AKTIF' }, jar: ctx.leaderJar });
  const kePublished = await api('PATCH', `/api/events/${eventId}/status`, { body: { status: 'PUBLISHED' }, jar: ctx.leaderJar });
  const keAktif = await api('PATCH', `/api/events/${eventId}/status`, { body: { status: 'AKTIF' }, jar: ctx.leaderJar });
  if (keAktif.json?.status) ctx.eventHt04.status = keAktif.json.status;

  const sesuai =
    invalid.status === 400 &&
    kePublished.status === 200 && kePublished.json?.status === 'PUBLISHED' &&
    keAktif.status === 200 && keAktif.json?.status === 'AKTIF';
  logger.scenario({
    id: 'HT-05',
    judul: 'PATCH /api/events/:id/status',
    kondisi: 'Transisi tidak valid (DRAFT -> AKTIF langsung); lalu transisi valid DRAFT -> PUBLISHED -> AKTIF',
    hasilDiharapkan: 'Transisi tidak valid -> 400; masing-masing transisi valid -> 200',
    hasilAktual: `Invalid (DRAFT->AKTIF): ${invalid.status} | DRAFT->PUBLISHED: ${kePublished.status} (${kePublished.json?.status}) | PUBLISHED->AKTIF: ${keAktif.status} (${keAktif.json?.status})`,
    sesuai,
  });
}

// ── HT-06 ──────────────────────────────────────────────────────────
async function ht06(ctx) {
  if (!ctx.eventHt04 || ctx.eventHt04.status !== 'AKTIF') {
    logger.scenarioGagalDijalankan({ id: 'HT-06', judul: 'POST /api/events/:id/kehadiran', alasan: 'Event uji belum berstatus AKTIF (HT-05 gagal)' });
    return;
  }
  const eventId = ctx.eventHt04.id;
  const invalid = await api('POST', `/api/events/${eventId}/kehadiran`, { body: { total_hadir: 5, jemaat_baru: 10 }, jar: ctx.leaderJar });
  const valid = await api('POST', `/api/events/${eventId}/kehadiran`, { body: { total_hadir: 20, jemaat_baru: 3 }, jar: ctx.leaderJar });

  const sesuai = invalid.status === 400 && valid.status === 200 && valid.json?.total_hadir === 20;
  logger.scenario({
    id: 'HT-06',
    judul: 'POST /api/events/:id/kehadiran',
    kondisi: 'jemaat_baru(10) > total_hadir(5); lalu data valid (total_hadir=20, jemaat_baru=3)',
    hasilDiharapkan: 'jemaat_baru > total_hadir -> 400; data valid -> 200',
    hasilAktual: `Invalid: ${invalid.status} | Valid: ${valid.status} (total_hadir=${valid.json?.total_hadir})`,
    sesuai,
  });
}

// ── HT-07 ──────────────────────────────────────────────────────────
async function ht07(ctx) {
  if (!ctx.eventHt04) {
    logger.scenarioGagalDijalankan({ id: 'HT-07', judul: 'GET /api/events/:id/suggest-volunteers/:jenisId', alasan: 'HT-04 gagal membuat event uji' });
    return;
  }
  const volunteerJenisRepository = require('../src/modules/volunteer/volunteer-jenis.repository');
  const volunteerMemberRepository = require('../src/modules/volunteer/volunteer-member.repository');
  const jemaatService = require('../src/modules/jemaat/jemaat.service');
  const pool = getPool();

  const suffix = Date.now();
  const jenisId = await volunteerJenisRepository.create({ nama: `Evidence HT07 Jenis ${suffix}`, deskripsi: 'Uji suggest-volunteers (evidence)' });
  ctx.createdVolunteerJenisIds.push(jenisId);

  for (const [label, skor] of [['A', 90], ['B', 30], ['C', 60]]) {
    const { id } = await jemaatService.createJemaat(
      { nama: `Evidence HT07 ${label} ${suffix}`, tgl_lahir: '1990-01-01', jenis_kelamin: 'L', tgl_bergabung: '2020-01-01' },
      { confirmed: true, actorUserId: ctx.leaderId }
    );
    ctx.createdJemaatIds.push(id);
    await volunteerMemberRepository.register(id, jenisId);
    // jemaatService.createJemaat SELALU membuat is_new_member=TRUE (grace
    // period 30 hari) terlepas dari tgl_bergabung — suggestVolunteers
    // mengecualikan is_new_member, jadi kandidat uji ini harus dilepas dari
    // grace period secara eksplisit supaya benar-benar muncul di hasil.
    await pool.query('UPDATE jemaat SET is_new_member = FALSE, skor_keaktifan = :skor WHERE id = :id', { skor, id });
  }

  const hasil = await api('GET', `/api/events/${ctx.eventHt04.id}/suggest-volunteers/${jenisId}`, { jar: ctx.leaderJar });
  const arr = Array.isArray(hasil.json) ? hasil.json : [];
  const terurutDescending = arr.every((h, i) => i === 0 || arr[i - 1].composite_score >= h.composite_score);

  const sesuai = hasil.status === 200 && arr.length === 3 && terurutDescending;
  logger.scenario({
    id: 'HT-07',
    judul: 'GET /api/events/:id/suggest-volunteers/:jenisId',
    kondisi: '3 kandidat volunteer baru didaftarkan ke jenis baru dengan skor_keaktifan berbeda (90, 30, 60)',
    hasilDiharapkan: '200, array descending berdasarkan composite_score',
    hasilAktual: `status=${hasil.status}, jumlah=${arr.length}, CS=[${arr.map((h) => h.composite_score?.toFixed(4)).join(', ')}], terurut descending=${terurutDescending}`,
    sesuai,
  });
}

// ── HT-08 ──────────────────────────────────────────────────────────
async function ht08(ctx) {
  const asAdmin = await api('GET', '/api/audit-logs', { jar: ctx.adminJar });
  const asLeader = await api('GET', '/api/audit-logs', { jar: ctx.leaderJar });

  const sesuai = asAdmin.status === 403 && asLeader.status === 200;
  logger.scenario({
    id: 'HT-08',
    judul: 'GET /api/audit-logs',
    kondisi: 'Diakses dengan sesi role ADMIN, lalu dengan sesi role LEADER',
    hasilDiharapkan: 'role ADMIN -> 403; role LEADER -> 200',
    hasilAktual: `ADMIN: ${asAdmin.status} | LEADER: ${asLeader.status} (jumlah baris=${Array.isArray(asLeader.json) ? asLeader.json.length : 'n/a'})`,
    sesuai,
  });
}

// ── HT-09 ──────────────────────────────────────────────────────────
async function ht09(ctx) {
  const suffix = Date.now();
  const asAdmin = await api('POST', '/api/users', {
    body: { username: `evidence_ht09_admin_try_${suffix}`, password: 'EvidenceUji123!', peran: 'ADMIN' },
    jar: ctx.adminJar,
  });
  const asLeader = await api('POST', '/api/users', {
    body: { username: `evidence_ht09_${suffix}`, password: 'EvidenceUji123!', peran: 'ADMIN' },
    jar: ctx.leaderJar,
  });
  if (asLeader.json?.id) ctx.createdUserIds.push(asLeader.json.id);

  const sesuai = asAdmin.status === 403 && asLeader.status === 201;
  logger.scenario({
    id: 'HT-09',
    judul: 'POST /api/users',
    kondisi: 'Membuat user baru dengan sesi role ADMIN, lalu dengan sesi role LEADER',
    hasilDiharapkan: 'role ADMIN -> 403; role LEADER -> 201',
    hasilAktual: `ADMIN: ${asAdmin.status} | LEADER: ${asLeader.status} (id=${asLeader.json?.id})`,
    sesuai,
  });
}

// ── HT-10 ──────────────────────────────────────────────────────────
async function ht10(ctx) {
  const pool = getPool();
  const suffix = Date.now();
  const password = 'EvidenceUji123!';
  const targetUsername = `evidence_ht10_sole_${suffix}`;
  const targetId = await authRepository.createUser({ username: targetUsername, passwordHash: await hashPassword(password), peran: 'LEADER' });

  // Login DULU, selagi semua LEADER (termasuk yang lain) masih aktif —
  // login menolak akun aktif=false.
  const loginRes = await login(targetUsername, password);
  const targetJar = loginRes.setCookieJar;

  const [snapshot] = await pool.query('SELECT id, aktif FROM users WHERE peran = :peran', { peran: 'LEADER' });
  const others = snapshot.filter((row) => row.id !== targetId);

  let patchResult = null;
  try {
    if (others.length > 0) {
      await pool.query('UPDATE users SET aktif = FALSE WHERE peran = :peran AND id != :targetId', { peran: 'LEADER', targetId });
    }
    const [cekCount] = await pool.query(`SELECT COUNT(*) AS total FROM users WHERE peran = 'LEADER' AND aktif = TRUE`);

    // LEADER uji mencoba menonaktifkan DIRINYA SENDIRI (self-target) —
    // ini satu-satunya jalur di mana guard "tidak boleh mengubah LEADER
    // lain" tidak ikut memblokir lebih dulu (lihat auth.service.js).
    patchResult = await api('PATCH', `/api/users/${targetId}/status`, { body: { aktif: false }, jar: targetJar });

    const sesuai = loginRes.status === 200 && Number(cekCount[0].total) === 1 && patchResult.status === 400;
    logger.scenario({
      id: 'HT-10',
      judul: 'PATCH /api/users/:id/status — menonaktifkan satu-satunya LEADER aktif',
      kondisi: `LEADER uji "${targetUsername}" mencoba menonaktifkan DIRINYA SENDIRI saat menjadi satu-satunya LEADER aktif (LEADER real lain di database dinonaktifkan SEMENTARA untuk skenario ini: id=[${others.map((o) => o.id).join(', ') || '-'}])`,
      hasilDiharapkan: 'Ditolak dengan status 400 ("Tidak dapat menonaktifkan satu-satunya LEADER aktif")',
      hasilAktual: `Jumlah LEADER aktif saat PATCH dikirim=${cekCount[0].total}, PATCH status=${patchResult.status}, pesan="${patchResult.json?.message}"`,
      sesuai,
      catatan: `PENTING: ${others.length} akun LEADER real dinonaktifkan SEMENTARA (hitungan detik) untuk membuat kondisi "satu-satunya LEADER aktif", lalu DIKEMBALIKAN PERSIS ke status semula segera setelah skenario ini (lihat baris restore di bawah).`,
    });
  } finally {
    for (const row of others) {
      await pool.query('UPDATE users SET aktif = :aktif WHERE id = :id', { aktif: !!row.aktif, id: row.id });
    }
    if (others.length > 0) {
      const [verifikasi] = await pool.query('SELECT id, aktif FROM users WHERE id IN (:ids)', { ids: others.map((o) => o.id) });
      const semuaTerpulihkan = others.every((o) => {
        const found = verifikasi.find((v) => v.id === o.id);
        return found && Boolean(found.aktif) === Boolean(o.aktif);
      });
      logger.info(`  (Restore HT-10) ${others.length} akun LEADER real dikembalikan ke status aktif semula — berhasil=${semuaTerpulihkan}`);
    }
    await pool.query('DELETE FROM users WHERE id = :id', { id: targetId });
  }
}

// ── HT-11 ──────────────────────────────────────────────────────────
async function ht11(ctx) {
  const xlsx = await api('GET', '/api/reports/jemaat?format=xlsx', { jar: ctx.leaderJar, raw: true });
  const pdf = await api('GET', '/api/reports/jemaat?format=pdf', { jar: ctx.leaderJar, raw: true });

  const xlsxOk = xlsx.status === 200 && xlsx.contentType.includes('spreadsheetml') && (xlsx.buffer?.length ?? 0) > 0;
  const pdfOk = pdf.status === 200 && pdf.contentType.includes('pdf') && (pdf.buffer?.length ?? 0) > 0;

  const sesuai = xlsxOk && pdfOk;
  logger.scenario({
    id: 'HT-11',
    judul: 'GET /api/reports/jemaat?format=xlsx|pdf',
    kondisi: 'Diminta dengan sesi LEADER valid, format=xlsx lalu format=pdf',
    hasilDiharapkan: '200 dengan file xlsx valid (ukuran > 0 byte); 200 dengan file pdf valid (ukuran > 0 byte)',
    hasilAktual: `xlsx: status=${xlsx.status}, contentType=${xlsx.contentType}, ukuran=${xlsx.buffer?.length ?? 0} byte | pdf: status=${pdf.status}, contentType=${pdf.contentType}, ukuran=${pdf.buffer?.length ?? 0} byte`,
    sesuai,
    catatan: xlsxOk && pdfOk ? undefined : 'Jika total jemaat aktif >= 500, endpoint ini mengembalikan JSON {async:true, token} (jalur asinkron), bukan file langsung — itu perilaku asli, bukan bug.',
  });
}

async function cleanup(ctx) {
  const pool = getPool();
  try {
    if (ctx.createdEventIds.length) {
      await pool.query('DELETE FROM event_volunteer WHERE event_id IN (:ids)', { ids: ctx.createdEventIds });
      await pool.query('DELETE FROM event_attendances WHERE event_id IN (:ids)', { ids: ctx.createdEventIds });
      await pool.query('DELETE FROM event_kehadiran WHERE event_id IN (:ids)', { ids: ctx.createdEventIds });
      await pool.query('DELETE FROM event_volunteer_needs WHERE event_id IN (:ids)', { ids: ctx.createdEventIds });
      await pool.query('DELETE FROM event WHERE id IN (:ids)', { ids: ctx.createdEventIds });
    }
    if (ctx.createdVolunteerJenisIds.length) {
      await pool.query('DELETE FROM volunteer_members WHERE volunteer_type_id IN (:ids)', { ids: ctx.createdVolunteerJenisIds });
    }
    if (ctx.createdJemaatIds.length) {
      await pool.query('DELETE FROM jemaat WHERE id IN (:ids)', { ids: ctx.createdJemaatIds });
    }
    if (ctx.createdVolunteerJenisIds.length) {
      await pool.query('DELETE FROM volunteer_jenis WHERE id IN (:ids)', { ids: ctx.createdVolunteerJenisIds });
    }
    const userIds = [...ctx.createdUserIds, ctx.leaderId, ctx.adminId].filter(Boolean);
    if (userIds.length) {
      await pool.query('DELETE FROM users WHERE id IN (:ids)', { ids: userIds });
    }
    logger.info('Cleanup seluruh data uji HTTP testing selesai (event/jemaat/volunteer_jenis/users).');
  } catch (err) {
    logger.info(`⚠ Cleanup sebagian gagal: ${err.message} (semua data uji memakai prefix "evidence_"/"Evidence " sehingga mudah dicari & dihapus manual bila perlu)`);
  }
}

const SKENARIO = [
  ['HT-01', 'POST /api/auth/login', ht01],
  ['HT-02', 'POST /api/jemaat', ht02],
  ['HT-03', 'GET /api/jemaat/:id vs /sensitive/no_hp', ht03],
  ['HT-04', 'POST /api/events', ht04],
  ['HT-05', 'PATCH /api/events/:id/status', ht05],
  ['HT-06', 'POST /api/events/:id/kehadiran', ht06],
  ['HT-07', 'GET /api/events/:id/suggest-volunteers/:jenisId', ht07],
  ['HT-08', 'GET /api/audit-logs', ht08],
  ['HT-09', 'POST /api/users', ht09],
  ['HT-10', 'PATCH /api/users/:id/status (satu-satunya LEADER aktif)', ht10],
  ['HT-11', 'GET /api/reports/jemaat (xlsx & pdf)', ht11],
];

async function main() {
  logger.header('BAGIAN 3 — HTTP TESTING (HT-01 s.d. HT-11)');
  logger.meta();
  logger.info('Server Express ASLI (src/app.js via src/server.js) dijalankan dengan listen() sungguhan di port lokal acak.');
  logger.info('Request dikirim dengan fetch bawaan Node.js — BUKAN supertest/testing library.');

  logger.sub('Cek koneksi infrastruktur');
  let dbOk = false;
  let redisOk = false;
  try {
    await testConnection();
    dbOk = true;
    logger.kv('MySQL/TiDB', 'Terhubung');
  } catch (err) {
    logger.kv('MySQL/TiDB', `GAGAL — ${err.message}`);
  }
  try {
    await testRedisConnection();
    redisOk = true;
    logger.kv('Redis', 'Terhubung');
  } catch (err) {
    logger.kv('Redis', `GAGAL — ${err.message}`);
  }

  if (!dbOk || !redisOk) {
    logger.info('');
    logger.info('⚠ HTTP testing membutuhkan MySQL/TiDB DAN Redis (login memakai Redis untuk sesi/rate limit). Seluruh skenario HT-01..HT-11 TIDAK dapat dijalankan.');
    const alasan = !dbOk ? 'Koneksi MySQL/TiDB gagal' : 'Koneksi Redis gagal';
    for (const [id, judul] of SKENARIO) {
      logger.scenarioGagalDijalankan({ id, judul, alasan });
    }
    logger.emitMachineSummary('HTTP_TESTING');
    logger.save();
    return;
  }

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  logger.kv('Server evidence', `${baseUrl} (proses Express asli, listen() sungguhan)`);

  const ctx = { createdJemaatIds: [], createdEventIds: [], createdUserIds: [], createdVolunteerJenisIds: [] };
  Object.assign(ctx, await setupUsers());

  for (const [id, judul, fn] of SKENARIO) {
    if (id === 'HT-08' && !ctx.adminJar) {
      // Setup sesi ADMIN (bukan skenario tersendiri) — dibutuhkan mulai HT-08.
      const adminLogin = await login(ctx.adminUsername, ctx.password);
      ctx.adminJar = adminLogin.setCookieJar;
    }
    try {
      await fn(ctx);
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

  await cleanup(ctx);

  logger.emitMachineSummary('HTTP_TESTING');
  logger.save();

  await new Promise((resolve) => server.close(resolve));
  await closePool();
  try { await closeRedis(); } catch { /* abaikan */ }
}

main().catch((err) => {
  console.error('FATAL — 03-http-testing.js gagal dijalankan:', err);
  process.exitCode = 1;
});
