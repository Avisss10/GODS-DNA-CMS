const volunteerService = require('./volunteer.service');
const { VolunteerError } = volunteerService;

function handleError(err, res) {
  if (err instanceof VolunteerError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  console.error('Volunteer controller error:', err);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
}

// POST /api/volunteer-types
async function createVolunteerType(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const result = await volunteerService.createVolunteerType(req.body, { actorUserId });
    return res.status(201).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// PUT /api/volunteer-types/:id
async function updateVolunteerType(req, res) {
  try {
    const id = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    const result = await volunteerService.updateVolunteerType(id, req.body, { actorUserId });
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// DELETE /api/volunteer-types/:id
async function deleteVolunteerType(req, res) {
  try {
    const id = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    await volunteerService.deactivateVolunteerType(id, { actorUserId });
    return res.status(200).json({ message: 'Jenis volunteer berhasil dinonaktifkan' });
  } catch (err) {
    return handleError(err, res);
  }
}

// PATCH /api/volunteer-types/:id/activate
async function activateVolunteerType(req, res) {
  try {
    const id = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;
    await volunteerService.activateVolunteerType(id, { actorUserId });
    return res.status(200).json({ message: 'Jenis volunteer berhasil diaktifkan kembali' });
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/jemaat/:jemaatId/volunteer
async function listVolunteerByJemaat(req, res) {
  try {
    const jemaatId = Number(req.params.jemaatId);
    const result = await volunteerService.listVolunteerByJemaat(jemaatId);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// POST /api/jemaat/:jemaatId/volunteer
async function registerVolunteer(req, res) {
  try {
    const jemaatId = Number(req.params.jemaatId);
    const actorUserId = req.user?.userId ?? null;
    const { volunteerTypeId } = req.body;

    if (!volunteerTypeId) {
      return res.status(400).json({ message: 'volunteerTypeId wajib diisi' });
    }

    const result = await volunteerService.registerVolunteer(
      jemaatId,
      Number(volunteerTypeId),
      { actorUserId }
    );
    return res.status(201).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// DELETE /api/jemaat/:jemaatId/volunteer/:volunteerTypeId
async function unregisterVolunteer(req, res) {
  try {
    const jemaatId = Number(req.params.jemaatId);
    const volunteerTypeId = Number(req.params.volunteerTypeId);
    const actorUserId = req.user?.userId ?? null;
    await volunteerService.unregisterVolunteer(jemaatId, volunteerTypeId, { actorUserId });
    return res.status(200).json({ message: 'Jemaat berhasil dikeluarkan dari jenis volunteer' });
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/volunteer-types
async function listVolunteerTypes(req, res) {
  try {
    const volunteerJenisRepository = require('./volunteer-jenis.repository');
    const result = await volunteerJenisRepository.findAll();
    return res.status(200).json(result);
  } catch (err) {
    console.error('Volunteer controller list error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

// GET /api/volunteer-types/:id/members — anggota aktif jenis tersebut.
// Sebelumnya nyasar di modul Event ("Deferred dari Step 12"); dipindah
// ke sini karena datanya milik modul Volunteer. Path URL tidak berubah,
// jadi pemakaian existing di modul Event tetap jalan tanpa perlu diubah.
async function listVolunteerTypeMembers(req, res) {
  try {
    const volunteerMemberRepository = require('./volunteer-member.repository');
    const volunteerJenisRepository = require('./volunteer-jenis.repository');
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
  createVolunteerType,
  updateVolunteerType,
  deleteVolunteerType,
  activateVolunteerType,
  listVolunteerTypes,
  listVolunteerByJemaat,
  registerVolunteer,
  unregisterVolunteer,
  listVolunteerTypeMembers,
};