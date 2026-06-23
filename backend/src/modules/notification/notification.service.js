const notificationRepository = require('./notification.repository');

/**
 * Kirim notifikasi ke semua Leader aktif.
 * Sesuai BAGIAN 10: Leader menerima notifikasi otomatis.
 *
 * @param {{ jenis: string, judul: string, pesan: string }} data
 * @returns {Promise<number[]>} array insertId
 */
async function notifyLeaders({ jenis, judul, pesan }) {
  const leaders = await notificationRepository.findAllActiveLeaders();
  const results = [];

  for (const leader of leaders) {
    const id = await notificationRepository.create({
      userId: leader.id,
      jenis,
      judul,
      pesan,
    });
    results.push(id);
  }

  return results;
}

/**
 * Kirim notifikasi ke satu user spesifik.
 * @param {{ userId: number, jenis: string, judul: string, pesan: string }} data
 * @returns {Promise<number>} insertId
 */
async function notifyUser({ userId, jenis, judul, pesan }) {
  return notificationRepository.create({ userId, jenis, judul, pesan });
}

/**
 * Ambil daftar notifikasi milik user yang sedang login.
 * @param {number} userId
 * @param {{ onlyUnread?: boolean }} options
 * @returns {Promise<Array<object>>}
 */
async function listNotifications(userId, { onlyUnread = false } = {}) {
  return notificationRepository.findByUser(userId, { onlyUnread });
}

/**
 * Tandai satu notifikasi sebagai sudah dibaca.
 * @param {number} id
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
async function markAsRead(id, userId) {
  return notificationRepository.markAsRead(id, userId);
}

/**
 * Tandai semua notifikasi milik user sebagai sudah dibaca.
 * @param {number} userId
 * @returns {Promise<number>}
 */
async function markAllAsRead(userId) {
  return notificationRepository.markAllAsRead(userId);
}

/**
 * Ambil jumlah notifikasi yang belum dibaca.
 * @param {number} userId
 * @returns {Promise<number>}
 */
async function countUnread(userId) {
  return notificationRepository.countUnread(userId);
}

module.exports = {
  notifyLeaders,
  notifyUser,
  listNotifications,
  markAsRead,
  markAllAsRead,
  countUnread,
};