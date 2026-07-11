const reportService = require('./report.service');
const { ReportError } = reportService;
const fs = require('fs');

// "1,2,3" -> [1,2,3]; entri non-integer/negatif dibuang (biar
// reportService.validateIds yang menolak kalau hasilnya kosong).
function parseIds(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return String(raw)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function handleError(err, res) {
  if (err instanceof ReportError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  console.error('Report controller error:', err);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
}

/**
 * Tanpa listener 'error' di sini, kegagalan baca file (race unlink,
 * disk/permission error, dsb) melempar uncaught exception dan
 * menjatuhkan seluruh proses Node — bukan cuma request ini.
 */
function attachStreamErrorHandler(fileStream, res) {
  fileStream.on('error', (err) => {
    console.error('Report file stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Gagal membaca file laporan' });
    } else {
      res.destroy();
    }
  });
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
  attachStreamErrorHandler(fileStream, res);
  fileStream.pipe(res);
  fileStream.on('end', () => {
    fs.unlink(result.filePath, () => {});
  });
}

// GET /api/reports/jemaat
async function jemaatReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const { format, mode, filterDescription } = req.query;
    const ids = parseIds(req.query.ids);
    const result = await reportService.generateJemaatReport({ format, ids, mode, filterDescription }, { actorUserId });
    return sendReportResult(res, result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/event
async function eventReport(req, res) {
  try {
    const actorUserId = req.user?.userId ?? null;
    const { eventId, startDate, endDate, format, filterDescription } = req.query;
    const result = await reportService.generateEventReport(
      { eventId, startDate, endDate, format, filterDescription },
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
    const { cgId, jemaatId, startDate, endDate, format, filterDescription } = req.query;
    const result = await reportService.generateCGReport(
      { cgId, jemaatId, startDate, endDate, format, filterDescription },
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
    const { jemaatId, eventId, startDate, endDate, format, filterDescription } = req.query;
    const result = await reportService.generateVolunteerReport(
      { jemaatId, eventId, startDate, endDate, format, filterDescription },
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
    const { format, filterDescription } = req.query;
    const result = await reportService.generateAnalyticsReport(
      { bulan, format, filterDescription },
      { actorUserId }
    );
    return sendReportResult(res, result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/jemaat/preview
async function jemaatReportPreview(req, res) {
  try {
    const { mode } = req.query;
    const ids = parseIds(req.query.ids);
    const result = await reportService.previewJemaatReport({ ids, mode });
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/event/preview
async function eventReportPreview(req, res) {
  try {
    const { eventId, startDate, endDate } = req.query;
    const result = await reportService.previewEventReport({ eventId, startDate, endDate });
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/cg/preview
async function cgReportPreview(req, res) {
  try {
    const { cgId, jemaatId, startDate, endDate } = req.query;
    const result = await reportService.previewCGReport({ cgId, jemaatId, startDate, endDate });
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/volunteer/preview
async function volunteerReportPreview(req, res) {
  try {
    const { jemaatId, eventId, startDate, endDate } = req.query;
    const result = await reportService.previewVolunteerReport({ jemaatId, eventId, startDate, endDate });
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/reports/analytics/preview
async function analyticsReportPreview(req, res) {
  try {
    const bulan = req.query.bulan ? Number(req.query.bulan) : 12;
    const result = await reportService.previewAnalyticsReport({ bulan });
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
    res.setHeader('Content-Type', entry.contentType);

    const fileStream = fs.createReadStream(entry.filePath);
    attachStreamErrorHandler(fileStream, res);
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
  jemaatReportPreview,
  eventReportPreview,
  cgReportPreview,
  volunteerReportPreview,
  analyticsReportPreview,
  downloadReport,
};
