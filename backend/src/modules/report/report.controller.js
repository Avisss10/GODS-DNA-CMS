const reportService = require('./report.service');
const { ReportError } = reportService;
const fs = require('fs');

function handleError(err, res) {
  if (err instanceof ReportError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  console.error('Report controller error:', err);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
}

/**
 * Mengirim hasil generate*Report ke client: jika async, kembalikan
 * token JSON (tidak berubah); jika sinkron, file yang sudah ditulis
 * ke disk (streaming, BAGIAN 7) langsung dikirim sebagai attachment
 * lalu dihapus setelah selesai dikirim.
 */
function sendReportResult(res, result) {
  if (result.async) {
    return res.status(200).json({ async: true, token: result.token, message: result.message });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
  res.setHeader('Content-Type', result.contentType);
  const fileStream = fs.createReadStream(result.filePath);
  fileStream.pipe(res);
  fileStream.on('end', () => {
    fs.unlink(result.filePath, () => {});
  });
}

// GET /api/reports/jemaat
async function jemaatReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const includeSensitive = req.query.sensitive === 'true';
    const format = req.query.format;
    const result = await reportService.generateJemaatReport(
      { includeSensitive, format },
      { actorUserId }
    );
    return sendReportResult(res, result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/event
async function eventReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const { eventId, startDate, endDate, format } = req.query;
    const result = await reportService.generateEventReport(
      { eventId, startDate, endDate, format },
      { actorUserId }
    );
    return sendReportResult(res, result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/cg
async function cgReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const { cgId, jemaatId, startDate, endDate, format } = req.query;
    const result = await reportService.generateCGReport(
      { cgId, jemaatId, startDate, endDate, format },
      { actorUserId }
    );
    return sendReportResult(res, result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/volunteer
async function volunteerReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const { jemaatId, eventId, startDate, endDate, format } = req.query;
    const result = await reportService.generateVolunteerReport(
      { jemaatId, eventId, startDate, endDate, format },
      { actorUserId }
    );
    return sendReportResult(res, result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/analytics
async function analyticsReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const bulan = req.query.bulan ? Number(req.query.bulan) : 12;
    const format = req.query.format;
    const result = await reportService.generateAnalyticsReport(
      { bulan, format },
      { actorUserId }
    );
    return sendReportResult(res, result);
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
    res.setHeader('Content-Type', entry.contentType);

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
