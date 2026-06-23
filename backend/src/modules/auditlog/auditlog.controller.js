const auditlogService = require('./auditlog.service');

// GET /api/audit-logs
async function listAuditLogs(req, res) {
  try {
    const { modul, aksi, userId, objectId, limit, offset } = req.query;
    const result = await auditlogService.listAuditLogs({
      modul, aksi, userId, objectId, limit, offset,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('Auditlog controller error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

// GET /api/audit-logs/:id
async function getAuditLogById(req, res) {
  try {
    const id = Number(req.params.id);
    const result = await auditlogService.getAuditLogById(id);
    if (!result) return res.status(404).json({ message: 'Audit log tidak ditemukan' });
    return res.status(200).json(result);
  } catch (err) {
    console.error('Auditlog controller error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

module.exports = { listAuditLogs, getAuditLogById };