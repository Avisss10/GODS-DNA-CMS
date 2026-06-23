const eventRepository = require('./event.repository');
const eventKehadiranRepository = require('./event-kehadiran.repository');
const eventVolunteerRepository = require('./event-volunteer.repository');
const eventAttendancesRepository = require('./event-attendances.repository'); // ← TAMBAH
const volunteerMemberRepository = require('../volunteer/volunteer-member.repository');
const { recordAuditLog } = require('../auditlog/auditlog.repository');

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

async function assignVolunteer(eventId, { jemaat_id, jenis_id }, { actorUserId = null } = {}) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new EventError('Event tidak ditemukan', 404);

  if (!['PUBLISHED', 'AKTIF'].includes(event.status)) {
    throw new EventError('Volunteer hanya dapat ditugaskan pada event PUBLISHED atau AKTIF', 400);
  }
  if (!jemaat_id) throw new EventError('jemaat_id wajib diisi', 400);
  if (!jenis_id) throw new EventError('jenis_id wajib diisi', 400);

  const membership = await volunteerMemberRepository.findByJemaatAndType(jemaat_id, jenis_id);
  if (!membership || !membership.is_active) {
    throw new EventError('Jemaat tidak terdaftar sebagai volunteer untuk jenis tersebut', 400);
  }

  const id = await eventVolunteerRepository.assign({ event_id: eventId, jemaat_id, jenis_id });

  // Jika event sudah AKTIF, langsung insert attendance juga
  if (event.status === 'AKTIF') {
    await eventAttendancesRepository.insertAttendance({ event_id: eventId, jemaat_id });
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

async function suggestVolunteers(eventId, jenisId) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw new EventError('Event tidak ditemukan', 404);

  const allMembers = await volunteerMemberRepository.findActiveByType(jenisId);
  const assigned = await eventVolunteerRepository.findAssignedByJenis(eventId, jenisId);
  const assignedIds = new Set(assigned.map((a) => a.jemaat_id));

  const candidates = allMembers.filter((m) => !assignedIds.has(m.jemaat_id));
  candidates.sort((a, b) => Number(a.is_new_member) - Number(b.is_new_member));

  return candidates;
}

module.exports = {
  EventError,
  createEvent,
  updateEvent,
  transitionStatus,
  inputKehadiran,
  assignVolunteer,
  suggestVolunteers,
};