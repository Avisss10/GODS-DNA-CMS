const notificationService = require('./notification.service');

function handleError(err, res) {
  console.error('Notification controller error:', err);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
}

// GET /api/notifications
async function listNotifications(req, res) {
  try {
    const userId = req.user?.userId ?? null;
    const onlyUnread = req.query.unread === 'true';
    const result = await notificationService.listNotifications(userId, { onlyUnread });
    return res.status(200).json(result);
  } catch (err) {
    return handleError(err, res);
  }
}

// GET /api/notifications/unread-count
async function unreadCount(req, res) {
  try {
    const userId = req.user?.userId ?? null;
    const count = await notificationService.countUnread(userId);
    return res.status(200).json({ count });
  } catch (err) {
    return handleError(err, res);
  }
}

// PATCH /api/notifications/:id/read
async function markAsRead(req, res) {
  try {
    const userId = req.user?.userId ?? null;
    const id = Number(req.params.id);
    const updated = await notificationService.markAsRead(id, userId);
    if (!updated) {
      return res.status(404).json({ message: 'Notifikasi tidak ditemukan' });
    }
    return res.status(200).json({ message: 'Notifikasi ditandai sudah dibaca' });
  } catch (err) {
    return handleError(err, res);
  }
}

// PATCH /api/notifications/read-all
async function markAllAsRead(req, res) {
  try {
    const userId = req.user?.userId ?? null;
    const count = await notificationService.markAllAsRead(userId);
    return res.status(200).json({ message: `${count} notifikasi ditandai sudah dibaca` });
  } catch (err) {
    return handleError(err, res);
  }
}

module.exports = { listNotifications, unreadCount, markAsRead, markAllAsRead };