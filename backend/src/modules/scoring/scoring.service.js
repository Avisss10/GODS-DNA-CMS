const scoringRepository = require('./scoring.repository');
const { recordAuditLog } = require('../auditlog/auditlog.repository');

// Ukuran chunk pemrosesan scoring (audit item 6) — jemaat diambil
// per halaman agar tidak memuat seluruh tabel ke memori sekaligus.
const BATCH_SIZE = 200;

// Bobot event sesuai BAGIAN 6.1
const BOBOT_BERTUGAS = 1.5;
const BOBOT_HADIR = 1.0;
const MAX_EVENT_REFERENSI = 12;

// Anti-cliff sesuai BAGIAN 6.1
const ANTI_CLIFF_MAX = 15;

/**
 * Hitung status keaktifan dari skor numerik.
 * Sesuai BAGIAN 6.2.
 * @param {number} skor
 * @returns {string}
 */
function hitungStatusKeaktifan(skor) {
  if (skor >= 60) return 'AKTIF';
  if (skor >= 30) return 'KURANG_AKTIF';
  return 'TIDAK_AKTIF';
}

/**
 * Terapkan anti-cliff: perubahan skor maksimal ±15 poin per malam.
 * Sesuai BAGIAN 6.1.
 * @param {number} skorLama
 * @param {number} skorBaru
 * @returns {number}
 */
function terapkanAntiCliff(skorLama, skorBaru) {
  const delta = skorBaru - skorLama;
  if (delta > ANTI_CLIFF_MAX) return skorLama + ANTI_CLIFF_MAX;
  if (delta < -ANTI_CLIFF_MAX) return skorLama - ANTI_CLIFF_MAX;
  return skorBaru;
}

/**
 * Hitung NILAI_CG dari data kehadiran meeting.
 * Sesuai BAGIAN 6.1: total_hadir / total_meeting × 100.
 * Jika tidak ada meeting = 0.
 * @param {{ total_meeting: number, total_hadir: number }} summary
 * @returns {number} 0-100
 */
function hitungNilaiCG({ total_meeting, total_hadir }) {
  if (total_meeting === 0) return 0;
  return Math.min(100, (total_hadir / total_meeting) * 100);
}

/**
 * Hitung NILAI_EVENT dari data penugasan dan kehadiran event.
 * Sesuai BAGIAN 6.1:
 * - BERTUGAS = 1.5 poin (dari event_volunteer status AKTIF/BERTUGAS_PARSIAL)
 * - BERTUGAS_PARSIAL = proporsional: (durasi_menit / rata-rata durasi event) × 1.5
 * - HADIR biasa (dari event_attendances) = 1.0 poin
 * - Total event referensi max 12, normalisasi ke 0-100
 *
 * @param {Array<{event_id, status, durasi_menit}>} assignments
 * @param {Array<{event_id}>} attendances
 * @param {number} totalEventReferensi
 * @returns {number} 0-100
 */
function hitungNilaiEvent(assignments, attendances, totalEventReferensi) {
  if (totalEventReferensi === 0) return 0;

  // Set event_id yang sudah dihitung agar tidak double-count
  const eventDihitung = new Map(); // event_id → poin

  // Hitung poin dari penugasan volunteer
  for (const a of assignments) {
    if (a.status === 'AKTIF') {
      eventDihitung.set(a.event_id, BOBOT_BERTUGAS);
    } else if (a.status === 'BERTUGAS_PARSIAL') {
      // Proporsional berdasarkan durasi_menit — asumsi durasi standar 120 menit
      const durasiStandar = 120;
      const durasi = a.durasi_menit ?? durasiStandar;
      const poin = Math.min(BOBOT_BERTUGAS, (durasi / durasiStandar) * BOBOT_BERTUGAS);
      // Ambil nilai tertinggi jika sudah ada (AKTIF lebih tinggi)
      if (!eventDihitung.has(a.event_id) || eventDihitung.get(a.event_id) < poin) {
        eventDihitung.set(a.event_id, poin);
      }
    }
  }

  // Tambah poin hadir biasa (jika belum dihitung sebagai bertugas)
  for (const a of attendances) {
    if (!eventDihitung.has(a.event_id)) {
      eventDihitung.set(a.event_id, BOBOT_HADIR);
    }
  }

  // Total poin maksimal = totalEventReferensi × BOBOT_BERTUGAS (skenario terbaik)
  const totalPoin = Array.from(eventDihitung.values()).reduce((sum, p) => sum + p, 0);
  const maxPoin = totalEventReferensi * BOBOT_BERTUGAS;

  return Math.min(100, (totalPoin / maxPoin) * 100);
}

/**
 * Hitung skor keaktifan untuk satu jemaat.
 * Sesuai BAGIAN 6.1.
 *
 * @param {number} jemaatId
 * @param {{ skor_keaktifan: number, is_non_cg: boolean }} jemaatData
 * @returns {Promise<{ skorBaru: number, statusBaru: string, isNonCg: boolean }>}
 */
async function hitungSkorJemaat(jemaatId, jemaatData) {
  const since = new Date();
  since.setMonth(since.getMonth() - 3);

  // Update flag is_non_cg terlebih dahulu
  const aktifDiCG = await scoringRepository.isActiveCGMember(jemaatId);
  const isNonCg = !aktifDiCG;

  // Ambil event referensi (max 12)
  const recentEvents = await scoringRepository.getRecentEvents(since);
  const eventIds = recentEvents.map((e) => e.id);
  const totalEventReferensi = Math.min(eventIds.length, MAX_EVENT_REFERENSI);

  // Ambil data penugasan dan kehadiran event
  const assignments = await scoringRepository.getVolunteerAssignments(jemaatId, eventIds);
  const attendances = await scoringRepository.getEventAttendances(jemaatId, eventIds);

  const nilaiEvent = hitungNilaiEvent(assignments, attendances, totalEventReferensi);

  let skorMentah;

  if (isNonCg) {
    // Non-CG: scoring penuh dari event (100%)
    skorMentah = nilaiEvent;
  } else {
    // Ber-CG: CG 60% + Event 40%
    const cgSummary = await scoringRepository.getCGAttendanceSummary(jemaatId, since);
    const nilaiCG = hitungNilaiCG(cgSummary);
    skorMentah = (nilaiCG * 0.60) + (nilaiEvent * 0.40);
  }

  // Bulatkan ke 2 desimal
  skorMentah = Math.round(skorMentah * 100) / 100;

  // Terapkan anti-cliff
  const skorLama = Number(jemaatData.skor_keaktifan ?? 0);
  const skorBaru = Math.round(terapkanAntiCliff(skorLama, skorMentah) * 100) / 100;
  const statusBaru = hitungStatusKeaktifan(skorBaru);

  return { skorBaru, statusBaru, isNonCg };
}

/**
 * Proses scoring SATU jemaat sampai tuntas: hitung skor (termasuk
 * anti-cliff), simpan skor/status ke DB, catat audit log. Dipakai
 * bersama oleh batch malam (runScoringBatch) dan pembaruan real-time
 * (updateSkorRealtimeJemaat) agar logikanya tidak terduplikasi.
 *
 * @param {{ id, skor_keaktifan, status_keaktifan }} jemaat
 * @param {{ actorUserId?: number }} options
 * @returns {Promise<{ skorBaru: number, statusBaru: string, isNonCg: boolean }>}
 */
async function prosesScoringJemaat(jemaat, { actorUserId = null } = {}) {
  const { skorBaru, statusBaru, isNonCg } = await hitungSkorJemaat(jemaat.id, jemaat);

  await scoringRepository.updateSkor(jemaat.id, skorBaru, statusBaru, isNonCg);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'UPDATE',
    modul: 'SCORING',
    objectId: jemaat.id,
    dataSebelum: {
      skor_keaktifan: jemaat.skor_keaktifan,
      status_keaktifan: jemaat.status_keaktifan,
    },
    dataSesudah: {
      skor_keaktifan: skorBaru,
      status_keaktifan: statusBaru,
    },
  });

  return { skorBaru, statusBaru, isNonCg };
}

/**
 * Pembaruan skor real-time untuk satu jemaat, dengan kriteria
 * kelayakan yang sama seperti batch malam: jemaat tidak aktif /
 * sudah dihapus / masih grace period (is_new_member) di-skip.
 *
 * @param {number} jemaatId
 * @param {{ actorUserId?: number }} options
 * @returns {Promise<{ skorBaru, statusBaru, isNonCg } | null>} null jika di-skip
 */
async function updateSkorRealtimeJemaat(jemaatId, { actorUserId = null } = {}) {
  const jemaat = await scoringRepository.getJemaatScoringData(jemaatId);
  if (!jemaat || jemaat.is_new_member) return null;

  return prosesScoringJemaat(jemaat, { actorUserId });
}

/**
 * Fire-and-forget: jadwalkan pembaruan skor real-time untuk sejumlah
 * jemaat TANPA menunggu hasilnya. Dipanggil controller SETELAH respons
 * dikirim ke klien — tidak menambah latency request dan tidak pernah
 * menggagalkan request utama (error hanya di-console.error).
 *
 * @param {Array<number>} jemaatIds
 * @param {{ actorUserId?: number }} options
 */
function triggerSkorUpdate(jemaatIds, { actorUserId = null } = {}) {
  const uniqueIds = [
    ...new Set(
      (jemaatIds || [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  if (uniqueIds.length === 0) return;

  setImmediate(async () => {
    for (const jemaatId of uniqueIds) {
      try {
        await updateSkorRealtimeJemaat(jemaatId, { actorUserId });
      } catch (err) {
        console.error(`Realtime scoring error untuk jemaat ${jemaatId}:`, err.message);
      }
    }
  });
}

/**
 * Jalankan scoring untuk semua jemaat yang memenuhi syarat.
 * Sesuai BAGIAN 6.3:
 * - Skip jemaat baru (is_new_member = true)
 * - Update skor_keaktifan + status_keaktifan di tabel jemaat
 * - Catat audit_log
 *
 * @param {{ actorUserId?: number }} options
 * @returns {Promise<{ processed: number, skipped: number }>}
 */
async function runScoringBatch({ actorUserId = null } = {}) {
  let processed = 0;
  let skipped = 0;
  let offset = 0;

  // Ambil jemaat per-chunk sampai chunk kosong (audit item 6).
  // Logika per-jemaat tetap sama persis: sequential, audit log per record,
  // catch-per-record — hanya cara fetch yang berubah dari "semua sekaligus".
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const chunk = await scoringRepository.getJemaatForScoring({ limit: BATCH_SIZE, offset });
    if (!chunk || chunk.length === 0) break;

    for (const jemaat of chunk) {
      try {
        await prosesScoringJemaat(jemaat, { actorUserId });

        processed++;
      } catch (err) {
        console.error(`Scoring error untuk jemaat ${jemaat.id}:`, err.message);
        skipped++;
      }
    }

    offset += BATCH_SIZE;
  }

  return { processed, skipped };
}

module.exports = {
  hitungStatusKeaktifan,
  terapkanAntiCliff,
  hitungNilaiCG,
  hitungNilaiEvent,
  hitungSkorJemaat,
  prosesScoringJemaat,
  updateSkorRealtimeJemaat,
  triggerSkorUpdate,
  runScoringBatch,
};