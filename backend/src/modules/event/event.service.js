const eventRepository = require('./event.repository');
const eventKehadiranRepository = require('./event-kehadiran.repository');
const eventVolunteerRepository = require('./event-volunteer.repository');
const eventVolunteerNeedsRepository = require('./event-volunteer-needs.repository');
const eventAttendancesRepository = require('./event-attendances.repository'); // ← TAMBAH
const volunteerMemberRepository = require('../volunteer/volunteer-member.repository');
const { recordAuditLog } = require('../auditlog/auditlog.repository');
const { getPool } = require('../../config/database');

class EventError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

const VALID_STATUS_TRANSITIONS = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['AKTIF', 'DIARSIPKAN'],
  AKTIF: ['SELESAI'],
  SELESAI: ['DIARSIPKAN'],
  DIARSIPKAN: [],
};

// Status event yang masih mengizinkan mutasi penugasan volunteer
// (assign, replace, cancel). Setelah SELESAI/DIARSIPKAN, data penugasan
// menjadi histori dan tidak boleh diubah lagi.
const VOLUNTEER_MUTABLE_EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'AKTIF'];

// ── Auto-Suggest Volunteer — Composite Score (BAB II §2.5.1) ──────
// CS = (S_frek × 0.40) + (S_aktif × 0.30) + (S_sesuai × 0.30)
const BOBOT_FREKUENSI = 0.40;
const BOBOT_KEAKTIFAN = 0.30;
const BOBOT_KESESUAIAN = 0.30;

// Paper tidak menyebutkan angka pasti untuk pembagi S_frek. Dipilih 8
// sebagai referensi "penugasan wajar dalam 30 hari" — mengasumsikan
// event pelayanan rutin berlangsung ±2x/minggu, sehingga volunteer yang
// sudah bertugas 8x dalam 30 hari terakhir dianggap sudah maksimal
// (S_frek = 0) dan diprioritaskan lebih rendah dibanding yang jarang.
const MAX_TUGAS_REFERENSI = 8;

/**
 * S_frek = 1 − (jumlah_tugas_30_hari / MAX_TUGAS_REFERENSI), diklem ke [0, 1].
 * @param {number} jumlahTugas30Hari
 * @returns {number}
 */
function hitungSFrekuensi(jumlahTugas30Hari) {
  const skor = 1 - jumlahTugas30Hari / MAX_TUGAS_REFERENSI;
  return Math.min(1, Math.max(0, skor));
}

/**
 * S_aktif = skor_keaktifan / 100. Jika NULL (BELUM_CUKUP_DATA), gunakan 0.
 * @param {number|null|undefined} skorKeaktifan
 * @returns {number}
 */
function hitungSAktif(skorKeaktifan) {
  if (skorKeaktifan === null || skorKeaktifan === undefined) return 0;
  return skorKeaktifan / 100;
}

/**
 * S_sesuai = 1.0 jika volunteer terdaftar pada jenis pelayanan yang
 * dibutuhkan event, atau 0.5 jika tidak terdaftar tapi tidak ada
 * konflik jadwal. Kandidat suggestVolunteers selalu bersumber dari
 * volunteer_members milik jenis yang diminta (konsisten dengan validasi
 * keanggotaan di assignVolunteer), sehingga cabang 0.5 disediakan untuk
 * kelengkapan formula namun belum pernah terpakai di alur saat ini.
 * @param {boolean} isTerdaftarJenis
 * @returns {number}
 */
function hitungSSesuai(isTerdaftarJenis) {
  return isTerdaftarJenis ? 1.0 : 0.5;
}

/**
 * CS = (S_frek × 0.40) + (S_aktif × 0.30) + (S_sesuai × 0.30)
 */
function hitungCompositeScore({ sFrek, sAktif, sSesuai }) {
  return sFrek * BOBOT_FREKUENSI + sAktif * BOBOT_KEAKTIFAN + sSesuai * BOBOT_KESESUAIAN;
}

async function createEvent(data, { actorUserId = null } = {}) {
  if (!data.judul) throw new EventError('Judul event wajib diisi', 400);
  if (!data.jenis) throw new EventError('Jenis event wajib diisi', 400);
  if (!data.waktu_mulai) throw new EventError('Waktu mulai wajib diisi', 400);
  if (!data.waktu_selesai) throw new EventError('Waktu selesai wajib diisi', 400);

  const mulai = new Date(data.waktu_mulai);
  const selesai = new Date(data.waktu_selesai);
  if (isNaN(mulai.getTime())) throw new EventError('Format waktu_mulai tidak valid', 400);
  if (isNaN(selesai.getTime())) throw new EventError('Format waktu_selesai tidak valid', 400);
  if (selesai <= mulai) throw new EventError('Waktu selesai harus setelah waktu mulai', 400);

  const id = await eventRepository.create({ ...data, created_by: actorUserId });

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'CREATE',
    modul: 'EVENT',
    objectId: id,
    dataSebelum: null,
    dataSesudah: { judul: data.judul, jenis: data.jenis, status: 'DRAFT' },
  });

  return eventRepository.findById(id);
}

async function updateEvent(id, updates, { actorUserId = null } = {}) {
  const event = await eventRepository.findById(id);
  if (!event) throw new EventError('Event tidak ditemukan', 404);

  if (!['DRAFT', 'PUBLISHED'].includes(event.status)) {
    throw new EventError(`Event dengan status ${event.status} tidak dapat diedit`, 400);
  }

  if (updates.waktu_mulai || updates.waktu_selesai) {
    const mulai = new Date(updates.waktu_mulai ?? event.waktu_mulai);
    const selesai = new Date(updates.waktu_selesai ?? event.waktu_selesai);
    if (selesai <= mulai) throw new EventError('Waktu selesai harus setelah waktu mulai', 400);
  }

  await eventRepository.update(id, updates);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'UPDATE',
    modul: 'EVENT',
    objectId: id,
    dataSebelum: { judul: event.judul, jenis: event.jenis, status: event.status },
    dataSesudah: updates,
  });

  return eventRepository.findById(id);
}

async function transitionStatus(id, newStatus, { actorUserId = null } = {}) {
  const event = await eventRepository.findById(id);
  if (!event) throw new EventError('Event tidak ditemukan', 404);

  const allowed = VALID_STATUS_TRANSITIONS[event.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new EventError(
      `Transisi status dari ${event.status} ke ${newStatus} tidak diizinkan`,
      400
    );
  }

  const extraUpdates = {};
  if (newStatus === 'AKTIF') extraUpdates.absensi_status = 'OPEN';
  if (newStatus === 'SELESAI') extraUpdates.absensi_status = 'CLOSED';

  await eventRepository.update(id, { status: newStatus, ...extraUpdates });

  // ── AUTO-INSERT event_attendances saat event menjadi AKTIF ──
  // Sesuai BAGIAN 5.7 dokumen: volunteer berstatus AKTIF di
  // event_volunteer otomatis tercatat BERTUGAS di event_attendances.
  if (newStatus === 'AKTIF') {
    const activeVolunteers = await eventVolunteerRepository.findActiveByEvent(id);
    const jemaatIds = activeVolunteers.map((v) => v.jemaat_id);
    if (jemaatIds.length > 0) {
      await eventAttendancesRepository.insertBatch(id, jemaatIds);
    }
  }

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'UPDATE_STATUS',
    modul: 'EVENT',
    objectId: id,
    dataSebelum: { status: event.status },
    dataSesudah: { status: newStatus },
  });

  return eventRepository.findById(id);
}

async function inputKehadiran(eventId, { total_hadir, jemaat_baru = 0 }, { actorUserId = null } = {}) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new EventError('Event tidak ditemukan', 404);

  if (!['AKTIF', 'SELESAI'].includes(event.status)) {
    throw new EventError('Kehadiran hanya dapat diinput saat event AKTIF atau SELESAI', 400);
  }
  if (typeof total_hadir !== 'number' || total_hadir < 0) {
    throw new EventError('total_hadir harus berupa angka non-negatif', 400);
  }
  if (jemaat_baru < 0 || jemaat_baru > total_hadir) {
    throw new EventError('jemaat_baru tidak boleh melebihi total_hadir', 400);
  }

  const existing = await eventKehadiranRepository.findByEventId(eventId);
  await eventKehadiranRepository.upsert({ event_id: eventId, total_hadir, jemaat_baru });

  await recordAuditLog({
    userId: actorUserId,
    aksi: existing ? 'UPDATE' : 'CREATE',
    modul: 'EVENT_KEHADIRAN',
    objectId: eventId,
    dataSebelum: existing
      ? { total_hadir: existing.total_hadir, jemaat_baru: existing.jemaat_baru }
      : null,
    dataSesudah: { total_hadir, jemaat_baru },
  });

  return eventKehadiranRepository.findByEventId(eventId);
}

/**
 * Menugaskan volunteer ke event. Jika event_volunteer_needs sudah
 * mendefinisikan kuota untuk event+jenis ini, baris kuota dikunci
 * (SELECT ... FOR UPDATE) di dalam transaksi sebelum INSERT, untuk
 * mencegah race condition ketika dua request menugaskan volunteer ke
 * kuota tersisa terakhir secara bersamaan. Jika belum ada kuota
 * didefinisikan untuk kombinasi event+jenis tersebut, penugasan
 * dianggap tidak terbatas (perilaku lama, tanpa validasi kuota).
 */
async function assignVolunteer(eventId, { jemaat_id, jenis_id }, { actorUserId = null } = {}) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new EventError('Event tidak ditemukan', 404);

  // DRAFT disertakan agar tim pelayanan bisa disusun sejak persiapan awal
  if (!VOLUNTEER_MUTABLE_EVENT_STATUSES.includes(event.status)) {
    throw new EventError('Volunteer hanya dapat ditugaskan pada event DRAFT, PUBLISHED, atau AKTIF', 400);
  }
  if (!jemaat_id) throw new EventError('jemaat_id wajib diisi', 400);
  if (!jenis_id) throw new EventError('jenis_id wajib diisi', 400);

  const membership = await volunteerMemberRepository.findByJemaatAndType(jemaat_id, jenis_id);
  if (!membership || !membership.is_active) {
    throw new EventError('Jemaat tidak terdaftar sebagai volunteer untuk jenis tersebut', 400);
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  let id;
  try {
    await connection.beginTransaction();

    const needs = await eventVolunteerNeedsRepository.findByEventAndJenisForUpdate(connection, eventId, jenis_id);
    if (needs) {
      const jumlahAktif = await eventVolunteerRepository.countActiveByEventAndJenis(connection, eventId, jenis_id);
      if (jumlahAktif >= needs.kuota) {
        throw new EventError('Kuota volunteer untuk jenis ini pada event tersebut sudah penuh', 409);
      }
    }

    id = await eventVolunteerRepository.assignWithConnection(connection, { event_id: eventId, jemaat_id, jenis_id });
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  // Jika event sudah AKTIF, langsung insert attendance juga.
  // Guard duplikat: jemaat yang sudah punya attendance di event ini
  // (misal pernah di-assign lalu diganti) tidak dicatat dua kali —
  // mencegah dobel poin di kalkulasi scoring.
  if (event.status === 'AKTIF') {
    const existing = await eventAttendancesRepository.findByEventAndJemaat(eventId, jemaat_id);
    if (!existing) {
      await eventAttendancesRepository.insertAttendance({ event_id: eventId, jemaat_id });
    }
  }

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'ASSIGN_VOLUNTEER',
    modul: 'EVENT',
    objectId: id,
    dataSebelum: null,
    dataSesudah: { eventId, jemaat_id, jenis_id },
  });

  return eventVolunteerRepository.findById(id);
}

/**
 * Menggantikan volunteer pada sebuah penugasan AKTIF (BAGIAN 5.6).
 * Baris lama ditandai DIGANTIKAN (SEBELUM_EVENT) atau BERTUGAS_PARSIAL
 * (TENGAH_EVENT, dengan durasi_menit bertugas), lalu baris baru dibuat
 * untuk jemaat pengganti dengan status AKTIF. Update + insert berjalan
 * dalam satu transaksi agar tidak ada kondisi setengah-terganti.
 */
async function replaceVolunteer(
  eventId,
  volunteerId,
  { replacement_timing, replaced_by, alasan, durasi_menit },
  { actorUserId = null } = {}
) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new EventError('Event tidak ditemukan', 404);

  // Aturan status event sama dengan assignVolunteer (BAGIAN 3 prompt update)
  if (!VOLUNTEER_MUTABLE_EVENT_STATUSES.includes(event.status)) {
    throw new EventError('Volunteer hanya dapat digantikan pada event DRAFT, PUBLISHED, atau AKTIF', 400);
  }

  const assignment = await eventVolunteerRepository.findById(volunteerId);
  if (!assignment || assignment.event_id !== eventId) {
    throw new EventError('Penugasan volunteer tidak ditemukan', 404);
  }
  if (assignment.status !== 'AKTIF') {
    throw new EventError('Hanya penugasan dengan status AKTIF yang dapat digantikan', 400);
  }

  // Normalisasi ke number — replaced_by datang dari body request dan bisa
  // berupa string, sedangkan jemaat_id hasil query bertipe number.
  const penggantiId = Number(replaced_by);

  // Validasi jemaat pengganti — sama seperti validasi keanggotaan di assignVolunteer
  const membership = await volunteerMemberRepository.findByJemaatAndType(penggantiId, assignment.jenis_id);
  if (!membership || !membership.is_active) {
    throw new EventError('Jemaat pengganti tidak terdaftar sebagai volunteer untuk jenis tersebut', 400);
  }

  const assigned = await eventVolunteerRepository.findAssignedByJenis(eventId, assignment.jenis_id);
  if (assigned.some((a) => a.jemaat_id === penggantiId)) {
    throw new EventError('Jemaat pengganti sudah ditugaskan pada event dan jenis ini', 409);
  }

  const isTengahEvent = replacement_timing === 'TENGAH_EVENT';
  const statusBaru = isTengahEvent ? 'BERTUGAS_PARSIAL' : 'DIGANTIKAN';
  const oldRowUpdates = {
    status: statusBaru,
    replacement_timing,
    replaced_by: penggantiId,
    alasan,
  };
  if (isTengahEvent) oldRowUpdates.durasi_menit = durasi_menit;

  const pool = getPool();
  const connection = await pool.getConnection();
  let newId;
  try {
    await connection.beginTransaction();

    await eventVolunteerRepository.updateStatusWithConnection(connection, volunteerId, oldRowUpdates);
    newId = await eventVolunteerRepository.assignWithConnection(connection, {
      event_id: eventId,
      jemaat_id: penggantiId,
      jenis_id: assignment.jenis_id,
    });

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  // Jika event sudah AKTIF, pengganti langsung tercatat BERTUGAS
  // di event_attendances (pola sama seperti di akhir assignVolunteer,
  // termasuk guard anti-duplikat).
  if (event.status === 'AKTIF') {
    const existing = await eventAttendancesRepository.findByEventAndJemaat(eventId, penggantiId);
    if (!existing) {
      await eventAttendancesRepository.insertAttendance({ event_id: eventId, jemaat_id: penggantiId });
    }
  }

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'REPLACE_VOLUNTEER',
    modul: 'EVENT',
    objectId: volunteerId,
    dataSebelum: { status: 'AKTIF' },
    dataSesudah: {
      status: statusBaru,
      replaced_by: penggantiId,
      alasan,
      replacement_timing,
      durasi_menit: isTengahEvent ? durasi_menit : null,
    },
  });

  const penugasanLama = await eventVolunteerRepository.findById(volunteerId);
  const penugasanBaru = await eventVolunteerRepository.findById(newId);
  return { penugasan_lama: penugasanLama, penugasan_baru: penugasanBaru };
}

/**
 * Membatalkan penugasan volunteer (soft-cancel, BAGIAN 5.6). Konsisten
 * dengan pola soft-delete modul lain: baris tidak dihapus, hanya
 * statusnya diubah menjadi DIBATALKAN sehingga otomatis hilang dari
 * listing volunteer aktif (findActiveByEvent memfilter status AKTIF).
 */
async function cancelVolunteerAssignment(eventId, volunteerId, { actorUserId = null } = {}) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new EventError('Event tidak ditemukan', 404);

  const assignment = await eventVolunteerRepository.findById(volunteerId);
  if (!assignment || assignment.event_id !== eventId) {
    throw new EventError('Penugasan volunteer tidak ditemukan', 404);
  }
  if (assignment.status !== 'AKTIF') {
    throw new EventError('Hanya penugasan dengan status AKTIF yang dapat dibatalkan', 400);
  }
  if (!VOLUNTEER_MUTABLE_EVENT_STATUSES.includes(event.status)) {
    throw new EventError('Penugasan tidak dapat dibatalkan setelah event SELESAI atau DIARSIPKAN', 400);
  }

  // Sengaja TIDAK menghapus/void baris event_attendances yang mungkin
  // sudah ter-insert otomatis saat event AKTIF — data kehadiran dibiarkan
  // utuh sebagai histori (volunteer sempat tercatat bertugas); pembatalan
  // hanya menyangkut status penugasannya.
  await eventVolunteerRepository.updateStatus(volunteerId, { status: 'DIBATALKAN' });

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'CANCEL_VOLUNTEER_ASSIGNMENT',
    modul: 'EVENT',
    objectId: volunteerId,
    dataSebelum: { status: 'AKTIF' },
    dataSesudah: { status: 'DIBATALKAN' },
  });

  return eventVolunteerRepository.findById(volunteerId);
}

/**
 * Auto-Suggest Volunteer (BAB II §2.5.1): mengembalikan kandidat yang
 * belum ditugaskan pada event+jenis ini, diurutkan descending
 * berdasarkan composite score. Dua pengecualian diterapkan SEBELUM
 * composite score dihitung: jemaat baru (is_new_member) dan volunteer
 * dengan konflik jadwal (penugasan AKTIF di event lain yang waktunya
 * tumpang tindih).
 */
async function suggestVolunteers(eventId, jenisId) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new EventError('Event tidak ditemukan', 404);

  const allMembers = await volunteerMemberRepository.findActiveByType(jenisId);
  const assigned = await eventVolunteerRepository.findAssignedByJenis(eventId, jenisId);
  const assignedIds = new Set(assigned.map((a) => a.jemaat_id));

  // Pengecualian 1: jemaat baru dan yang sudah ditugaskan
  const notYetAssigned = allMembers.filter(
    (m) => !assignedIds.has(m.jemaat_id) && !m.is_new_member
  );
  if (notYetAssigned.length === 0) return [];

  // Pengecualian 2: konflik jadwal (penugasan AKTIF di event lain yang overlap)
  const conflictingIds = new Set(
    await eventVolunteerRepository.findConflictingJemaatIds({
      waktuMulai: event.waktu_mulai,
      waktuSelesai: event.waktu_selesai,
      excludeEventId: eventId,
    })
  );
  const candidates = notYetAssigned.filter((m) => !conflictingIds.has(m.jemaat_id));
  if (candidates.length === 0) return [];

  const jemaatIds = candidates.map((c) => c.jemaat_id);
  const tugasMap = await eventVolunteerRepository.countTugas30HariBatch(jemaatIds);

  const scored = candidates.map((c) => {
    const jumlahTugas30Hari = tugasMap[c.jemaat_id] ?? 0;
    const sFrek = hitungSFrekuensi(jumlahTugas30Hari);
    const sAktif = hitungSAktif(c.skor_keaktifan);
    const sSesuai = hitungSSesuai(true); // kandidat selalu terdaftar pada jenis yang diminta
    return {
      ...c,
      jumlah_tugas_30_hari: jumlahTugas30Hari,
      s_frek: sFrek,
      s_aktif: sAktif,
      s_sesuai: sSesuai,
      composite_score: hitungCompositeScore({ sFrek, sAktif, sSesuai }),
    };
  });

  scored.sort((a, b) => b.composite_score - a.composite_score);
  return scored;
}

module.exports = {
  EventError,
  createEvent,
  updateEvent,
  transitionStatus,
  inputKehadiran,
  assignVolunteer,
  replaceVolunteer,
  cancelVolunteerAssignment,
  suggestVolunteers,
  hitungSFrekuensi,
  hitungSAktif,
  hitungSSesuai,
  hitungCompositeScore,
  MAX_TUGAS_REFERENSI,
};