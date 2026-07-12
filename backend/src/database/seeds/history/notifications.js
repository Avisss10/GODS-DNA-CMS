const notificationRepository = require('../../../modules/notification/notification.repository');
const {
  NOW,
  randomInt,
  randomDateBetween,
  chance,
  daysAgo,
  backdate,
  insertHistoricalAuditLog,
} = require('./_helpers');

const JUDUL_MAP = {
  LOGIN_GAGAL_BERULANG: 'Peringatan: Login Gagal Berulang',
  LOGIN_IP_BARU: 'Peringatan: Login dari IP Tidak Dikenal',
  EKSPOR_DATA_MALAM: 'Peringatan: Ekspor Data di Luar Jam Operasional',
  LEADER_TINGGAL_SATU: 'Peringatan: Jumlah Leader Tinggal 1',
  EVENT_SELESAI: 'Ringkasan Event Selesai',
  SCORING_SELESAI: 'Cron Scoring Selesai',
};

const LEADER_JENIS = ['SCORING_SELESAI', 'EVENT_SELESAI', 'EKSPOR_DATA_MALAM', 'LOGIN_GAGAL_BERULANG', 'LOGIN_IP_BARU'];
const ADMIN_JENIS = ['LOGIN_GAGAL_BERULANG', 'LOGIN_IP_BARU'];

function pesanFor(jenis) {
  switch (jenis) {
    case 'SCORING_SELESAI':
      return `Cron scoring malam selesai: ${randomInt(80, 150)} jemaat diproses, ${randomInt(0, 3)} dilewati.`;
    case 'EVENT_SELESAI':
      return `Event "Ibadah Minggu Raya" telah selesai, total ${randomInt(90, 200)} jemaat hadir.`;
    case 'EKSPOR_DATA_MALAM':
      return 'Ekspor laporan dilakukan di luar jam operasional (00:00-05:00).';
    case 'LOGIN_GAGAL_BERULANG':
      return 'Terdeteksi 3x percobaan login gagal berturut-turut pada akun ini.';
    case 'LOGIN_IP_BARU':
      return 'Login berhasil dari alamat IP yang belum pernah dikenali sebelumnya.';
    case 'LEADER_TINGGAL_SATU':
      return 'Jumlah akun LEADER aktif tinggal 1. Segera aktifkan/tambahkan akun LEADER lain.';
    default:
      return `Notifikasi ${jenis}`;
  }
}

async function createNotification(userId, jenis, date) {
  const id = await notificationRepository.create({
    userId,
    jenis,
    judul: JUDUL_MAP[jenis] ?? `Notifikasi: ${jenis}`,
    pesan: pesanFor(jenis),
  });
  await backdate('notifications', id, date, 'created_at');

  // Mayoritas notifikasi lama sudah dibaca; beberapa hari terakhir sengaja dibiarkan unread.
  if (date < daysAgo(5) || chance(0.5)) {
    const { getPool } = require('../../../config/database');
    await getPool().query('UPDATE notifications SET is_read = TRUE WHERE id = :id', { id });
  }
  return id;
}

async function seedNotifications(users) {
  let total = 0;

  for (const leader of users.leaders) {
    const count = randomInt(8, 18);
    for (let i = 0; i < count; i++) {
      const jenis = LEADER_JENIS[randomInt(0, LEADER_JENIS.length - 1)];
      const date = randomDateBetween(daysAgo(700), NOW);
      await createNotification(leader.id, jenis, date);
      total++;
    }
  }

  for (const admin of users.admins) {
    const count = randomInt(3, 8);
    for (let i = 0; i < count; i++) {
      const jenis = ADMIN_JENIS[randomInt(0, ADMIN_JENIS.length - 1)];
      const date = randomDateBetween(daysAgo(700), NOW);
      await createNotification(admin.id, jenis, date);
      total++;
    }
  }

  // Satu kejadian historis "leader tinggal 1" di awal, sebelum leader
  // lain bergabung — dikirim ke leader1 (satu-satunya leader saat itu).
  if (users.leaders.length > 0) {
    await createNotification(users.leaders[0].id, 'LEADER_TINGGAL_SATU', daysAgo(727));
    total++;
  }

  console.log(`[notifications] ${total} notifikasi historis dibuat.`);
  return total;
}

/**
 * Beberapa entri audit log EXPORT/LAPORAN untuk variasi histori —
 * direkam langsung tanpa benar-benar men-generate file PDF/Excel.
 */
async function seedExportAuditLogs(users) {
  const actors = [...users.leaders, ...users.admins];
  const count = randomInt(15, 30);

  for (let i = 0; i < count; i++) {
    const actor = actors[randomInt(0, actors.length - 1)];
    const date = randomDateBetween(daysAgo(700), NOW);
    await insertHistoricalAuditLog({
      userId: actor.id,
      aksi: 'EXPORT',
      modul: 'LAPORAN',
      objectId: null,
      dataSebelum: null,
      dataSesudah: { format: chance(0.5) ? 'PDF' : 'EXCEL', jenisLaporan: 'REKAP_KEHADIRAN' },
      date,
    });
  }

  console.log(`[notifications] ${count} audit log EXPORT/LAPORAN dibuat.`);
  return count;
}

module.exports = { seedNotifications, seedExportAuditLogs };
