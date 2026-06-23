const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');

// Hanya LEADER yang bisa baca notifikasi sistem
router.get(
  '/notifications',
  authenticate,
  requireRole('LEADER'),
  notificationController.listNotifications
);

router.get(
  '/notifications/unread-count',
  authenticate,
  requireRole('LEADER'),
  notificationController.unreadCount
);

router.patch(
  '/notifications/read-all',
  authenticate,
  requireRole('LEADER'),
  notificationController.markAllAsRead
);

router.patch(
  '/notifications/:id/read',
  authenticate,
  requireRole('LEADER'),
  notificationController.markAsRead
);

module.exports = router;