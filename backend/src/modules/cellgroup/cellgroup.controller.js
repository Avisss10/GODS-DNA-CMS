const cgService = require('./cellgroup.service');
const cgRepository = require('./cellgroup.repository');
const meetingRepository = require('./cellgroup-meeting.repository');
const { CellGroupError } = cgService;


function handleError(err, res) {
  if (err instanceof CellGroupError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  console.error('Cell Group controller error:', err);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
}

async function createCellGroup(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const result = await cgService.createCellGroup(req.body, { actorUserId });
    return res.status(201).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

async function getCellGroupById(req, res) {
  try {
    const id = Number(req.params.id);
    const cg = await cgRepository.findById(id);
    if (!cg) {
      return res.status(404).json({ message: 'Cell Group tidak ditemukan' });
    }
    return res.status(200).json(cg);
  } catch (err) {
    return handleError(err, res);
  }
}

async function getActiveMembers(req, res) {
  try {
    const id = Number(req.params.id);
    const members = await cgRepository.findActiveMembers(id);
    return res.status(200).json(members);
  } catch (err) {
    return handleError(err, res);
  }
}

async function addMember(req, res) {
  try {
    const id = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    await cgService.addMemberToCg(id, req.body.jemaatId, { actorUserId });
    return res.status(201).json({ message: 'Anggota berhasil ditambahkan' });
  } catch (err) {
    return handleError(err, res);
  }
}

async function removeMember(req, res) {
  try {
    const id = Number(req.params.id);
    const jemaatId = Number(req.params.jemaatId);
    const actorUserId = req.user?.userId ?? null;
    await cgService.removeMemberFromCg(id, jemaatId, { actorUserId });
    return res.status(200).json({ message: 'Anggota berhasil dikeluarkan' });
  } catch (err) {
    return handleError(err, res);
  }
}

async function createMeeting(req, res) {
  try {
    const id = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    const result = await cgService.createMeeting({ ...req.body, cgId: id }, { actorUserId });
    return res.status(201).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

async function getMeetingById(req, res) {
  try {
    const meetingId = Number(req.params.meetingId);
    const meeting = await meetingRepository.findMeetingById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting tidak ditemukan' });
    }
    return res.status(200).json(meeting);
  } catch (err) {
    return handleError(err, res);
  }
}

async function uploadPhoto(req, res) {
  try {
    const meetingId = Number(req.params.meetingId);
    const actorUserId = req.user?.userId ?? null;

    if (!req.file) {
      return res.status(400).json({ message: 'File foto wajib diunggah' });
    }

    const result = await cgService.addPhotoToMeeting(meetingId, req.file.buffer, { actorUserId });
    return res.status(201).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

async function getActiveMembersAtMeetingTime(req, res) {
  try {
    const meetingId = Number(req.params.meetingId);
    const meeting = await meetingRepository.findMeetingById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting tidak ditemukan' });
    }
    const members = await meetingRepository.findActiveMembersAtMeetingTime(meeting.cg_id, meeting.waktu_mulai);
    return res.status(200).json(members);
  } catch (err) {
    return handleError(err, res);
  }
}

async function submitAbsensi(req, res) {
  try {
    const meetingId = Number(req.params.meetingId);
    const actorUserId = req.user?.userId ?? null;
    await cgService.submitAbsensi(meetingId, req.body.absensi, { actorUserId });
    return res.status(200).json({ message: 'Absensi berhasil disimpan' });
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/cell-groups
async function listCellGroups(req, res) {
  try {
    const { limit, offset } = req.query;
    const cgRepository = require('./cellgroup.repository');
    const result = await cgRepository.findAll({ limit, offset });
    return res.status(200).json(result);
  } catch (err) {
    console.error('CellGroup controller list error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

async function updateCellGroup(req, res) {
  try {
    const id = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    await cgService.updateCellGroup(id, req.body, { actorUserId });
    return res.status(200).json({ message: 'Cell Group berhasil diupdate' });
  } catch (err) {
    return handleError(err, res);
  }
}

async function deactivateCellGroup(req, res) {
  try {
    const id = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    await cgService.deactivateCellGroup(id, { actorUserId });
    return res.status(200).json({ message: 'Cell Group berhasil dinonaktifkan' });
  } catch (err) {
    return handleError(err, res);
  }
}

async function listMeetingsByCg(req, res) {
  try {
    const cgId = Number(req.params.id);
    const { limit, offset } = req.query;
    const meetings = await meetingRepository.findMeetingsByCgId(cgId, { limit, offset });
    return res.status(200).json(meetings);
  } catch (err) {
    return handleError(err, res);
  }
}

async function updateMeeting(req, res) {
  try {
    const meetingId = Number(req.params.meetingId);
    const actorUserId = req.user?.userId ?? null;
    await cgService.updateMeeting(meetingId, req.body, { actorUserId });
    return res.status(200).json({ message: 'Meeting berhasil diupdate' });
  } catch (err) {
    return handleError(err, res);
  }
}

module.exports = {
  createCellGroup,
  updateCellGroup,
  deactivateCellGroup,
  listCellGroups,
  getCellGroupById,
  getActiveMembers,
  addMember,
  removeMember,
  createMeeting,
  updateMeeting,
  getMeetingById,
  uploadPhoto,
  getActiveMembersAtMeetingTime,
  submitAbsensi,
  listMeetingsByCg,
};