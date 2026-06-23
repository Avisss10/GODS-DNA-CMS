const express = require('express');
const router = express.Router();
const auditlogController = require('./auditlog.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');

// Hanya LEADER yang bisa baca audit log (BAGIAN 8.3)
router.get(
  '/audit-logs',
  authenticate,
  requireRole('LEADER'),
  auditlogController.listAuditLogs
);

router.get(
  '/audit-logs/:id',
  authenticate,
  requireRole('LEADER'),
  auditlogController.getAuditLogById
);

module.exports = router;