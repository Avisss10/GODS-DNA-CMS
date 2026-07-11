const cgService = require('./cellgroup.service');
const cgRepository = require('./cellgroup.repository');
const meetingRepository = require('./cellgroup-meeting.repository');
const scoringService = require('../scoring/scoring.service');
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
    const jemaatId = req.body.jemaatId;
    const actorUserId = req.user?.userId ?? null;
    await cgService.addMemberToCg(id, jemaatId, { actorUserId });
    res.status(201).json({ message: 'Anggota berhasil ditambahkan' });

    // is_non_cg jemaat baru akurat lagi setelah recompute skor — tanpa
    // ini nilainya basi sampai cron malam atau trigger absensi/event lain
    // kebetulan jalan (lihat pola sama di submitAbsensi di bawah).
    scoringService.triggerSkorUpdate([jemaatId], { actorUserId });
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
    res.status(200).json({ message: 'Anggota berhasil dikeluarkan' });

    scoringService.triggerSkorUpdate([jemaatId], { actorUserId });
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
    const actorRole = req.user?.peran ?? null;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'File foto wajib diunggah' });
    }

    const fileBuffers = req.files.map((f) => f.buffer);
    const result = await cgService.addPhotosToMeeting(meetingId, fileBuffers, { actorUserId, actorRole });
    return res.status(201).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

async function listMeetingPhotos(req, res) {
  try {
    const meetingId = Number(req.params.meetingId);
    const photos = await cgService.listMeetingPhotos(meetingId);
    return res.status(200).json(photos);
  } catch (err) {
    return handleError(err, res);
  }
}

async function getPhoto(req, res) {
  try {
    const photoId = Number(req.params.photoId);
    const { absolutePath, contentType } = await cgService.getPhotoFile(photoId);

    res.setHeader('Content-Type', contentType);
    return res.sendFile(absolutePath);
  } catch (err) {
    return handleError(err, res);
  }
}

async function deletePhoto(req, res) {
  try {
    const photoId = Number(req.params.photoId);
    const actorUserId = req.user?.userId ?? null;
    const actorRole = req.user?.peran ?? null;
    await cgService.deletePhoto(photoId, { actorUserId, actorRole });
    return res.status(200).json({ message: 'Foto berhasil dihapus' });
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

async function getAbsensiHistoryByJemaat(req, res) {
  try {
    const jemaatId = Number(req.params.jemaatId);
    const { limit, offset } = req.query;
    const history = await meetingRepository.findAbsensiHistoryByJemaat(jemaatId, { limit, offset });
    return res.status(200).json(history);
  } catch (err) {
    return handleError(err, res);
  }
}

async function getAbsensi(req, res) {
  try {
    const meetingId = Number(req.params.meetingId);
    const meeting = await meetingRepository.findMeetingById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting tidak ditemukan' });
    }
    const absensi = await meetingRepository.findAbsensiByMeeting(meetingId);
    return res.status(200).json(absensi);
  } catch (err) {
    return handleError(err, res);
  }
}

async function submitAbsensi(req, res) {
  try {
    const meetingId = Number(req.params.meetingId);
    const actorUserId = req.user?.userId ?? null;
    const actorRole = req.user?.peran ?? null;
    const absensiList = req.body.absensi;
    await cgService.submitAbsensi(meetingId, absensiList, { actorUserId, actorRole });
    res.status(200).json({ message: 'Absensi berhasil disimpan' });

    // Skor keaktifan real-time untuk setiap jemaat yang diabsen —
    // fire-and-forget setelah respons terkirim (cron malam tetap
    // berjalan sebagai penyapu).
    scoringService.triggerSkorUpdate(
      absensiList.map((a) => a.jemaatId),
      { actorUserId }
    );
    return res;
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

async function activateCellGroup(req, res) {
  try {
    const id = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    await cgService.activateCellGroup(id, { actorUserId });
    return res.status(200).json({ message: 'Cell Group berhasil diaktifkan kembali' });
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
  activateCellGroup,
  listCellGroups,
  getCellGroupById,
  getActiveMembers,
  addMember,
  removeMember,
  createMeeting,
  updateMeeting,
  getMeetingById,
  uploadPhoto,
  listMeetingPhotos,
  getPhoto,
  deletePhoto,
  getActiveMembersAtMeetingTime,
  getAbsensi,
  getAbsensiHistoryByJemaat,
  submitAbsensi,
  listMeetingsByCg,
};