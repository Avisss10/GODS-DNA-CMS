const jemaatService = require('./jemaat.service');
const { JemaatError } = jemaatService;

function handleError(err, res) {
  if (err instanceof JemaatError) {
    const body = { message: err.message };
    if (err.payload) {
      body.detail = err.payload;
    }
    return res.status(err.statusCode).json(body);
  }
  console.error('Jemaat controller error:', err);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
}

async function create(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const { confirmed, ...data } = req.body;

    const result = await jemaatService.createJemaat(data, { confirmed: !!confirmed, actorUserId });

    if (result.requiresConfirmation) {
      return res.status(409).json({
        message: 'Ditemukan kandidat data serupa, konfirmasi diperlukan untuk melanjutkan',
        duplicates: result.duplicates,
      });
    }

    return res.status(201).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

async function getById(req, res) {
  try {
    const id = Number(req.params.id);
    const repo = require('./jemaat.repository');
    const jemaat = await repo.findById(id);

    if (!jemaat) {
      return res.status(404).json({ message: 'Jemaat tidak ditemukan' });
    }

    return res.status(200).json(jemaat);
  } catch (err) {
    return handleError(err, res);
  }
}

async function getSensitiveField(req, res) {
  try {
    const id = Number(req.params.id);
    const { field } = req.params;
    const actorUserId = req.user?.userId ?? null;

    const value = await jemaatService.viewSensitiveField(id, field, { actorUserId });

    return res.status(200).json({ field, value });
  } catch (err) {
    return handleError(err, res);
  }
}

async function update(req, res) {
  try {
    const id = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;

    const updated = await jemaatService.updateJemaat(id, req.body, { actorUserId });

    return res.status(200).json(updated);
  } catch (err) {
    return handleError(err, res);
  }
}

async function remove(req, res) {
  try {
    const id = Number(req.params.id);
    const actorUserId = req.user?.userId ?? null;

    await jemaatService.deleteJemaat(id, { actorUserId });

    return res.status(200).json({ message: 'Jemaat berhasil dihapus' });
  } catch (err) {
    return handleError(err, res);
  }
}

module.exports = { create, getById, getSensitiveField, update, remove };