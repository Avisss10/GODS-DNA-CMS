const authRepository = require('../../../modules/auth/auth.repository');
const { hashPassword } = require('../../../utils/password.util');
const {
  NOW,
  START_DATE,
  addDays,
  daysAgo,
  randomInt,
  randomDateBetween,
  chance,
  backdate,
  insertHistoricalAuditLog,
} = require('./_helpers');

const SHARED_PASSWORD = 'Password123!';

// Sesuai daftar user yang diminta: leader1/admin1 (akun default) +
// 8 personel dengan nama asli. Tim inti (leader1, admin1, yohanes,
// kevin) dibuat di hari-0 peluncuran sistem; sisanya menyusul
// bertahap di bulan-bulan awal (pertumbuhan tim organik).
const USER_PLAN = [
  { username: 'leader1', peran: 'LEADER', joinDaysAgo: 730 },
  { username: 'admin1', peran: 'ADMIN', joinDaysAgo: 730 },
  { username: 'yohanes.pratama', peran: 'LEADER', joinDaysAgo: 728 },
  { username: 'kevin.halim', peran: 'ADMIN', joinDaysAgo: 725 },
  { username: 'maria.sinaga', peran: 'LEADER', joinDaysAgo: 690 },
  { username: 'angela.wijaya', peran: 'ADMIN', joinDaysAgo: 640 },
  { username: 'daniel.simatupang', peran: 'LEADER', joinDaysAgo: 560 },
  { username: 'samuel.gunawan', peran: 'ADMIN', joinDaysAgo: 470 },
  { username: 'ruth.tambunan', peran: 'LEADER', joinDaysAgo: 340 },
  { username: 'priscilla.santoso', peran: 'ADMIN', joinDaysAgo: 210 },
];

/**
 * Buat histori LOGIN/(LOGOUT) untuk satu user, tersebar dari tanggal
 * dia dibuat sampai sekarang. Direkam langsung sebagai audit_logs
 * (bukan lewat auth.service.login asli) supaya tidak menyentuh
 * Redis session/rate-limit state sungguhan.
 */
async function seedLoginHistory(user, createdAt) {
  const totalLogins = randomInt(15, 30);

  for (let i = 0; i < totalLogins; i++) {
    const loginAt = randomDateBetween(createdAt, NOW);
    await insertHistoricalAuditLog({
      userId: user.id,
      aksi: 'LOGIN',
      modul: 'AUTH',
      objectId: user.id,
      dataSebelum: null,
      dataSesudah: { peran: user.peran },
      date: loginAt,
    });

    // Sebagian besar sesi diakhiri LOGOUT beberapa jam kemudian —
    // sisanya dibiarkan tanpa LOGOUT (sesi kedaluwarsa alami/browser ditutup).
    if (chance(0.7)) {
      const logoutAt = new Date(loginAt.getTime() + randomInt(15, 240) * 60 * 1000);
      if (logoutAt <= NOW) {
        await insertHistoricalAuditLog({
          userId: user.id,
          aksi: 'LOGOUT',
          modul: 'AUTH',
          objectId: user.id,
          dataSebelum: null,
          dataSesudah: null,
          date: logoutAt,
        });
      }
    }
  }

  return totalLogins;
}

async function seedUsers() {
  const passwordHash = await hashPassword(SHARED_PASSWORD);
  const leaders = [];
  const admins = [];
  let totalLoginEvents = 0;

  for (const plan of USER_PLAN) {
    const id = await authRepository.createUser({
      username: plan.username,
      passwordHash,
      peran: plan.peran,
    });

    const createdAt = daysAgo(plan.joinDaysAgo);
    await backdate('users', id, createdAt, 'created_at');

    const user = { id, username: plan.username, peran: plan.peran };
    if (plan.peran === 'LEADER') leaders.push(user);
    else admins.push(user);

    totalLoginEvents += await seedLoginHistory(user, createdAt);

    // last_login_at: sesi terbaru dalam ~5 hari terakhir (user aktif).
    const lastLoginAt = addDays(NOW, -randomInt(0, 5));
    await backdate('users', id, lastLoginAt, 'last_login_at');

    console.log(`  [users] ${plan.username} (${plan.peran}) dibuat, bergabung ${createdAt.toISOString().slice(0, 10)}`);
  }

  console.log(`[users] Selesai: ${leaders.length} LEADER, ${admins.length} ADMIN, ~${totalLoginEvents} event LOGIN tercatat.`);
  console.log(`[users] Password semua akun: ${SHARED_PASSWORD}`);

  return { leaders, admins, sharedPassword: SHARED_PASSWORD };
}

module.exports = { seedUsers, USER_PLAN, SHARED_PASSWORD, START_DATE };
