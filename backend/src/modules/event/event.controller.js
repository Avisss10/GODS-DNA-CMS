const eventService = require('./event.service');
const { EventError } = eventService;
const eventRepository = require('./event.repository');
const eventVolunteerRepository = require('./event-volunteer.repository');
const eventKehadiranRepository = require('./event-kehadiran.repository');
const scoringService = require('../scoring/scoring.service');

function handleError(err, res) {
  if (err instanceof EventError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  console.error('Event controller error:', err);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
}

async function createEvent(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const result = await eventService.createEvent(req.body, { actorUserId });
    return res.status(201).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

async function listEvents(req, res) {
  try {
    const { status } = req.query;
    const result = await eventRepository.findAll(status ? { status } : {});
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

async function getEvent(req, res) {
  try {
    const id = Number(req.params.id);
    const event = await eventRepository.findById(id);
    if (!event) return res.status(404).json({ message: 'Event tidak ditemukan' });
    return res.status(200).json(event);
  } catch (err) {
    return handleError(err, res);
  }
}

async function updateEvent(req, res) {
  try {
    const id = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    const result = await eventService.updateEvent(id, req.body, { actorUserId });
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

async function updateStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    const actorUserId = req.user?.userId ?? null;
    if (!status) return res.status(400).json({ message: 'status wajib diisi' });
    const result = await eventService.transitionStatus(id, status, { actorUserId });
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

async function inputKehadiran(req, res) {
  try {
    const eventId = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    const { total_hadir, jemaat_baru } = req.body;
    if (total_hadir === undefined || total_hadir === null) {
      return res.status(400).json({ message: 'total_hadir wajib diisi' });
    }
    const result = await eventService.inputKehadiran(
      eventId,
      { total_hadir: Number(total_hadir), jemaat_baru: Number(jemaat_baru ?? 0) },
      { actorUserId }
    );
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/events/:id/kehadiran — baca rekap kehadiran dari event_kehadiran
// (pasangan baca untuk POST /events/:id/kehadiran yang sudah ada).
async function getKehadiran(req, res) {
  try {
    const eventId = Number(req.params.id);
    const event = await eventRepository.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event tidak ditemukan' });

    const kehadiran = await eventKehadiranRepository.findByEventId(eventId);
    if (!kehadiran) {
      return res.status(404).json({ message: 'Data kehadiran event belum diinput' });
    }
    return res.status(200).json(kehadiran);
  } catch (err) {
    return handleError(err, res);
  }
}

async function listVolunteers(req, res) {
  try {
    const eventId = Number(req.params.id);
    const event = await eventRepository.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event tidak ditemukan' });
    const result = await eventVolunteerRepository.findActiveByEvent(eventId);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

async function assignVolunteer(req, res) {
  try {
    const eventId = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    const { jemaat_id, jenis_id } = req.body;
    const result = await eventService.assignVolunteer(
      eventId,
      { jemaat_id, jenis_id },
      { actorUserId }
    );
    res.status(201).json(result);

    // Skor keaktifan real-time untuk jemaat yang ditugaskan —
    // fire-and-forget setelah respons terkirim.
    scoringService.triggerSkorUpdate([jemaat_id], { actorUserId });
    return res;
  } catch (err) {
    return handleError(err, res);
  }
}

async function replaceVolunteer(req, res) {
  try {
    const eventId = Number(req.params.id);
    const volunteerId = Number(req.params.volunteerId);
    const actorUserId = req.user?.userId ?? null;
    const { replacement_timing, replaced_by, alasan, durasi_menit } = req.body;
    const result = await eventService.replaceVolunteer(
      eventId,
      volunteerId,
      { replacement_timing, replaced_by, alasan, durasi_menit },
      { actorUserId }
    );
    res.status(200).json(result);

    // Skor keaktifan real-time untuk jemaat yang digantikan DAN
    // jemaat pengganti — fire-and-forget setelah respons terkirim.
    scoringService.triggerSkorUpdate(
      [result.penugasan_lama?.jemaat_id, result.penugasan_baru?.jemaat_id],
      { actorUserId }
    );
    return res;
  } catch (err) {
    return handleError(err, res);
  }
}

async function cancelVolunteer(req, res) {
  try {
    const eventId = Number(req.params.id);
    const volunteerId = Number(req.params.volunteerId);
    const actorUserId = req.user?.userId ?? null;
    const result = await eventService.cancelVolunteerAssignment(eventId, volunteerId, { actorUserId });
    res.status(200).json(result);

    // Skor keaktifan real-time untuk jemaat yang penugasannya
    // dibatalkan — fire-and-forget setelah respons terkirim.
    scoringService.triggerSkorUpdate([result?.jemaat_id], { actorUserId });
    return res;
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/events/:id/volunteer-needs
async function getVolunteerNeeds(req, res) {
  try {
    const eventId = Number(req.params.id);
    const result = await eventService.getVolunteerNeeds(eventId);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// PUT /api/events/:id/volunteer-needs
async function updateVolunteerNeeds(req, res) {
  try {
    const eventId = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    const result = await eventService.updateVolunteerNeeds(eventId, req.body?.needs, { actorUserId });
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

async function suggestVolunteers(req, res) {
  try {
    const eventId = Number(req.params.id);
    const jenisId = Number(req.params.jenisId);
    const result = await eventService.suggestVolunteers(eventId, jenisId);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// Deferred dari Step 12
async function listVolunteerTypeMembers(req, res) {
  try {
    const volunteerMemberRepository = require('../volunteer/volunteer-member.repository');
    const volunteerJenisRepository = require('../volunteer/volunteer-jenis.repository');
    const id = Number(req.params.id);
    const jenis = await volunteerJenisRepository.findById(id);
    if (!jenis) return res.status(404).json({ message: 'Jenis volunteer tidak ditemukan' });
    const members = await volunteerMemberRepository.findActiveByType(id);
    return res.status(200).json(members);
  } catch (err) {
    return handleError(err, res);
  }
}

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  updateStatus,
  inputKehadiran,
  getKehadiran,
  listVolunteers,
  assignVolunteer,
  replaceVolunteer,
  cancelVolunteer,
  getVolunteerNeeds,
  updateVolunteerNeeds,
  suggestVolunteers,
  listVolunteerTypeMembers,
};