const reportService = require('./report.service');
const fs = require('fs');

function handleError(err, res) {
  console.error('Report controller error:', err);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
}

// GET /api/reports/jemaat
async function jemaatReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const includeSensitive = req.query.sensitive === 'true';
    const result = await reportService.generateJemaatReport(
      { includeSensitive },
      { actorUserId }
    );
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/event
async function eventReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const { eventId, startDate, endDate } = req.query;
    const result = await reportService.generateEventReport(
      { eventId, startDate, endDate },
      { actorUserId }
    );
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/cg
async function cgReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const { cgId, jemaatId, startDate, endDate } = req.query;
    const result = await reportService.generateCGReport(
      { cgId, jemaatId, startDate, endDate },
      { actorUserId }
    );
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/volunteer
async function volunteerReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const { jemaatId, eventId, startDate, endDate } = req.query;
    const result = await reportService.generateVolunteerReport(
      { jemaatId, eventId, startDate, endDate },
      { actorUserId }
    );
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/analytics
async function analyticsReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const bulan = req.query.bulan ? Number(req.query.bulan) : 12;
    const result = await reportService.generateAnalyticsReport(
      { bulan },
      { actorUserId }
    );
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/download/:token
async function downloadReport(req, res) {
  try {
    const { token } = req.params;
    const entry = await reportService.downloadReport(token);

    if (!entry) {
      return res.status(404).json({ message: 'Token tidak valid, sudah digunakan, atau sudah kadaluarsa' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${entry.fileName}"`);
    res.setHeader('Content-Type', 'application/json');

    const fileStream = fs.createReadStream(entry.filePath);
    fileStream.pipe(res);

    // Auto-delete setelah stream selesai
    fileStream.on('end', () => {
      fs.unlink(entry.filePath, () => {});
    });
  } catch (err) {
    return handleError(err, res);
  }
}

module.exports = {
  jemaatReport,
  eventReport,
  cgReport,
  volunteerReport,
  analyticsReport,
  downloadReport,
};