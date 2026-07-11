const { getRedisClient } = require('../../config/redis');
const { comparePassword, hashPassword } = require('../../utils/password.util');
const { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } = require('../../utils/jwt.util');
const authRepository = require('./auth.repository');
const { recordAuditLog } = require('../auditlog/auditlog.repository');
const { notifyLeaders } = require('../notification/notification.stub');

const MAX_FAILED_ATTEMPTS = 3;
const FAILED_ATTEMPTS_WINDOW_SECONDS = 15 * 60; // 15 menit, BAGIAN 1.1 langkah 4

class AuthError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function failedLoginKey(username) {
  return `login_fail:${username}`;
}

function activeSessionKey(userId) {
  return `active_session:${userId}`;
}

function refreshTokenKey(userId) {
  return `refresh_token:${userId}`;
}

function tokenBlacklistKey(token) {
  return `blacklist_token:${token}`;
}

function knownIpsKey(userId) {
  return `known_ips:${userId}`;
}

const KNOWN_IPS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 hari

/**
 * Cek apakah login datang dari IP yang belum dikenal untuk user ini
 * (set Redis known_ips:{userId}, TTL 30 hari). IP baru → kirim
 * notifikasi LOGIN_IP_BARU ke Leader, lalu daftarkan IP-nya.
 * Kegagalan di sini tidak boleh menggagalkan login.
 *
 * @param {object} redis
 * @param {{ id: number, username: string }} user
 * @param {string} ipAddress
 */
async function checkNewIpLogin(redis, user, ipAddress) {
  try {
    const key = knownIpsKey(user.id);
    const isKnown = await redis.sismember(key, ipAddress);

    if (!isKnown) {
      await notifyLeaders({
        jenis: 'LOGIN_IP_BARU',
        pesan: `Akun "${user.username}" login dari IP baru: ${ipAddress}.`,
        meta: { userId: user.id, ipAddress },
      });
      await redis.sadd(key, ipAddress);
    }
    // Refresh TTL setiap login agar daftar IP dikenal bertahan 30 hari
    // sejak aktivitas terakhir.
    await redis.expire(key, KNOWN_IPS_TTL_SECONDS);
  } catch (err) {
    console.error('checkNewIpLogin error (login tetap lanjut):', err.message);
  }
}

/**
 * Proses login lengkap sesuai 14 langkah BAGIAN 1.1.
 *
 * @param {{ username: string, password: string, ipAddress?: string }} credentials
 *   ipAddress (dari req.ip, butuh trust proxy) dipakai untuk deteksi
 *   login dari IP baru — opsional agar pemanggil lama tetap kompatibel.
 * @returns {Promise<{ peran: string, nama: string, accessToken: string, refreshToken: string }>}
 * @throws {AuthError} dengan statusCode 401/403/429 sesuai langkah dokumen
 */
async function login({ username, password, ipAddress }) {
  const redis = getRedisClient();

  // Langkah 1-2: cari user, 401 generik jika tidak ada
  // (pesan error TIDAK membedakan username vs password — langkah 2)
  const user = await authRepository.findByUsername(username);
  if (!user) {
    throw new AuthError('Username atau password salah', 401);
  }

  // Langkah 3: 403 jika akun dinonaktifkan
  if (!user.aktif) {
    throw new AuthError('Akun dinonaktifkan', 403);
  }

  // Langkah 4: cek failed_login_count di Redis
  const failKey = failedLoginKey(username);
  const failedCount = Number((await redis.get(failKey)) || 0);

  if (failedCount >= MAX_FAILED_ATTEMPTS) {
    notifyLeaders({
      jenis: 'LOGIN_GAGAL_BERULANG',
      pesan: `Akun "${username}" dikunci sementara karena ${failedCount}x percobaan login gagal dalam 15 menit.`,
      meta: { username },
    });
    throw new AuthError('Akun dikunci sementara', 429);
  }

  // Langkah 5: bcrypt compare
  const isPasswordValid = await comparePassword(password, user.password_hash);

  // Langkah 6: salah → increment failed_login_count, 401
  if (!isPasswordValid) {
    const newCount = await redis.incr(failKey);
    if (newCount === 1) {
      await redis.expire(failKey, FAILED_ATTEMPTS_WINDOW_SECONDS);
    }
    throw new AuthError('Username atau password salah', 401);
  }

  // Langkah 7: benar → reset failed_login_count
  await redis.del(failKey);

  // Langkah 8: cek sesi aktif sebelumnya → invalidasi (single concurrent session)
  const sessionKey = activeSessionKey(user.id);
  const previousAccessToken = await redis.get(sessionKey);
  if (previousAccessToken) {
    // Blacklist token lama dengan TTL = sisa masa berlaku access token (8 jam)
    await redis.set(tokenBlacklistKey(previousAccessToken), '1', 'EX', 8 * 60 * 60);
  }

  // Langkah 9: generate access token (8h) + refresh token (7d)
  const accessToken = signAccessToken({ userId: user.id, peran: user.peran });
  const refreshToken = signRefreshToken({ userId: user.id });

  // Simpan access token sebagai sesi aktif saat ini (untuk pengecekan langkah 8 di login berikutnya)
  await redis.set(sessionKey, accessToken, 'EX', 8 * 60 * 60);

  // Langkah 10: simpan refresh token hash di Redis (untuk revoke)
  await redis.set(refreshTokenKey(user.id), refreshToken, 'EX', 7 * 24 * 60 * 60);

  // Deteksi login dari IP yang belum dikenal (notifikasi LOGIN_IP_BARU)
  if (ipAddress) {
    await checkNewIpLogin(redis, user, ipAddress);
  }

  // Langkah 12: update last_login_at
  await authRepository.updateLastLogin(user.id);

  // Langkah 13: catat audit_log aksi=LOGIN, modul=AUTH
  await recordAuditLog({
    userId: user.id,
    aksi: 'LOGIN',
    modul: 'AUTH',
    objectId: user.id,
    dataSebelum: null,
    dataSesudah: { peran: user.peran },
  });

  // Langkah 14: return peran + nama (memakai username sebagai pengganti
  // "nama", karena tabel users tidak memiliki kolom nama terpisah —
  // lihat keputusan Step 9.4.b)
  return {
    peran: user.peran,
    nama: user.username,
    accessToken,
    refreshToken,
  };
}

/**
 * Proses logout sesuai BAGIAN 1.2 (5 langkah):
 * 1. Ambil token dari cookie (dilakukan controller, token diteruskan ke sini)
 * 2. Masukkan token ke blacklist redis (TTL = sisa masa berlaku)
 * 3. Clear cookie (dilakukan controller)
 * 4. Catat audit_log aksi=LOGOUT
 * 5. Return 200 (dilakukan controller)
 *
 * @param {string} accessToken
 * @returns {Promise<void>}
 */
async function logout(accessToken) {
  const redis = getRedisClient();

  let userId = null;
  let remainingTtlSeconds = 8 * 60 * 60; // fallback: durasi penuh access token

  try {
    const decoded = verifyAccessToken(accessToken);
    userId = decoded.userId;
    const nowInSeconds = Math.floor(Date.now() / 1000);
    remainingTtlSeconds = Math.max(decoded.exp - nowInSeconds, 1);
  } catch (err) {
    // Token sudah tidak valid/expired — tetap lanjutkan proses logout
    // (blacklist tetap di-set dengan TTL fallback, cookie tetap di-clear
    // oleh controller) supaya logout tidak pernah gagal hanya karena
    // token sudah usang.
  }

  // Langkah 2: masukkan token ke blacklist redis
  await redis.set(tokenBlacklistKey(accessToken), '1', 'EX', remainingTtlSeconds);

  // Hapus juga active_session agar pengecekan single-session (langkah 8 login) bersih
  if (userId) {
    await redis.del(activeSessionKey(userId));
  }

  // Langkah 4: catat audit_log aksi=LOGOUT
  await recordAuditLog({
    userId,
    aksi: 'LOGOUT',
    modul: 'AUTH',
    objectId: userId,
    dataSebelum: null,
    dataSesudah: null,
  });
}

/**
 * Memperpanjang access token memakai refresh token dari cookie
 * (audit item 4). Scope minimal: refresh token TIDAK dirotasi —
 * hanya menerbitkan access token baru dan menyetel ulang sesi aktif.
 *
 * Validasi berlapis:
 * 1. Refresh token harus valid (tidak expired/rusak) → 401 jika gagal.
 * 2. Harus cocok dengan yang tersimpan di Redis (refresh_token:{userId}) —
 *    jika tidak cocok berarti sudah logout/diganti → 401.
 * 3. User harus masih ada & aktif → 401 jika tidak.
 *
 * @param {string} refreshTokenFromCookie
 * @returns {Promise<{ accessToken: string }>}
 * @throws {AuthError} 401 untuk semua kegagalan validasi
 */
async function refreshAccessToken(refreshTokenFromCookie) {
  const redis = getRedisClient();

  let userId;
  try {
    ({ userId } = verifyRefreshToken(refreshTokenFromCookie));
  } catch (err) {
    throw new AuthError('Refresh token tidak valid atau kedaluwarsa', 401);
  }

  // Cek refresh token cocok dengan yang tersimpan (belum logout/diganti)
  const storedRefreshToken = await redis.get(refreshTokenKey(userId));
  if (!storedRefreshToken || storedRefreshToken !== refreshTokenFromCookie) {
    throw new AuthError('Refresh token tidak valid atau kedaluwarsa', 401);
  }

  // Cek user masih ada & aktif
  const user = await authRepository.findById(userId);
  if (!user || !user.aktif) {
    throw new AuthError('Refresh token tidak valid atau kedaluwarsa', 401);
  }

  const accessToken = signAccessToken({ userId, peran: user.peran });
  // Set ulang sesi aktif (TTL 8 jam, sama seperti login)
  await redis.set(activeSessionKey(userId), accessToken, 'EX', 8 * 60 * 60);

  return { accessToken };
}

/**
 * Reset password akun ADMIN oleh LEADER (atau akun manapun termasuk
 * LEADER, kalau dipanggil lewat jalur dev-only via isDev:true).
 * Leader tidak bisa reset password sesama Leader.
 *
 * @param {number|null} leaderId - id user yang melakukan reset (LEADER), null kalau isDev
 * @param {number} targetUserId - id akun yang akan direset
 * @param {string} newPassword - password baru (plaintext)
 * @param {object} options
 * @param {boolean} options.isDev - true kalau dipanggil lewat rute dev-only (bypass restriksi target ADMIN)
 * @returns {Promise<{ username: string }>}
 * @throws {AuthError} 404 jika target tidak ditemukan, 403 jika target bukan ADMIN (dan bukan isDev)
 */
async function resetAdminPassword(leaderId, targetUserId, newPassword, { isDev = false } = {}) {
  if (!newPassword || newPassword.length < 8) {
    throw new AuthError('Password baru minimal 8 karakter', 400);
  }

  const target = await authRepository.findById(targetUserId);
  if (!target) {
    throw new AuthError('User tidak ditemukan', 404);
  }
  if (!isDev && target.peran !== 'ADMIN') {
    throw new AuthError('Hanya password akun ADMIN yang dapat direset oleh Leader', 403);
  }

  const { hashPassword } = require('../../utils/password.util');
  const newHash = await hashPassword(newPassword);
  await authRepository.updatePassword(targetUserId, newHash);

  // Invalidasi sesi aktif target agar wajib login ulang
  const redis = getRedisClient();
  const previousToken = await redis.get(activeSessionKey(targetUserId));
  if (previousToken) {
    await redis.set(tokenBlacklistKey(previousToken), '1', 'EX', 8 * 60 * 60);
  }
  await redis.del(activeSessionKey(targetUserId));
  await redis.del(refreshTokenKey(targetUserId));

  await recordAuditLog({
    userId: leaderId,
    aksi: isDev ? 'DEV_RESET_PASSWORD' : 'RESET_PASSWORD',
    modul: 'AUTH',
    objectId: targetUserId,
    dataSebelum: { username: target.username },
    dataSesudah: { username: target.username, passwordReset: true },
  });

  return { username: target.username };
}

/**
 * Membuat akun ADMIN/LEADER baru (hanya bisa dipanggil oleh LEADER —
 * ditegakkan di layer route via requireRole). Membuat akun LEADER baru
 * hanya boleh lewat jalur dev-only (isDev:true) — LEADER biasa hanya
 * bisa membuat akun ADMIN.
 *
 * @param {{ username: string, password: string, peran: 'LEADER'|'ADMIN' }} data
 * @param {object} options
 * @param {number} options.actorUserId - LEADER yang membuat akun (untuk audit log), null kalau isDev
 * @param {boolean} options.isDev - true kalau dipanggil lewat rute dev-only (bypass restriksi peran LEADER)
 * @returns {Promise<{ id: number, username: string, peran: string }>}
 * @throws {AuthError} 409 jika username sudah terdaftar, 403 jika actor biasa mencoba buat LEADER
 */
async function createUser({ username, password, peran }, { actorUserId = null, isDev = false } = {}) {
  if (!isDev && peran === 'LEADER') {
    throw new AuthError('Hanya dev yang dapat membuat akun LEADER baru', 403);
  }

  const existing = await authRepository.findByUsername(username);
  if (existing) {
    throw new AuthError('Username sudah terdaftar', 409);
  }

  const passwordHash = await hashPassword(password);
  const id = await authRepository.createUser({ username, passwordHash, peran });

  await recordAuditLog({
    userId: actorUserId,
    aksi: isDev ? 'DEV_CREATE_USER' : 'CREATE_USER',
    modul: 'USER',
    objectId: id,
    dataSebelum: null,
    dataSesudah: { username, peran },
  });

  return { id, username, peran };
}

/**
 * Mengaktifkan/menonaktifkan akun user (hanya bisa dipanggil oleh
 * LEADER). LEADER tidak boleh mengubah status akun LEADER lain (kecuali
 * dirinya sendiri) — hanya dev (isDev:true) yang bisa. Menolak
 * menonaktifkan LEADER jika itu satu-satunya LEADER aktif yang tersisa
 * (BAGIAN 12 #2).
 *
 * @param {number} targetUserId
 * @param {boolean} aktif
 * @param {object} options
 * @param {number} options.actorUserId
 * @param {string} options.actorRole - peran user yang melakukan aksi ('LEADER'|'ADMIN')
 * @param {boolean} options.isDev - true kalau dipanggil lewat rute dev-only (bypass restriksi LEADER-vs-LEADER)
 * @returns {Promise<{ username: string }>}
 * @throws {AuthError} 404 jika user tidak ditemukan, 403 jika LEADER mencoba ubah LEADER lain, 400 jika menonaktifkan satu-satunya LEADER aktif
 */
async function updateUserStatus(targetUserId, aktif, { actorUserId = null, actorRole = null, isDev = false } = {}) {
  const target = await authRepository.findById(targetUserId);
  if (!target) {
    throw new AuthError('User tidak ditemukan', 404);
  }

  if (!isDev && actorRole === 'LEADER' && target.peran === 'LEADER' && actorUserId !== targetUserId) {
    throw new AuthError('Leader tidak dapat mengubah status akun Leader lain, hubungi dev', 403);
  }

  if (target.peran === 'LEADER' && aktif === false) {
    const activeLeaders = await authRepository.countActiveLeaders();
    if (activeLeaders <= 1) {
      throw new AuthError('Tidak dapat menonaktifkan satu-satunya LEADER aktif', 400);
    }
  }

  await authRepository.updateAktif(targetUserId, aktif);

  await recordAuditLog({
    userId: actorUserId,
    aksi: isDev ? (aktif ? 'DEV_ACTIVATE_USER' : 'DEV_DEACTIVATE_USER') : (aktif ? 'ACTIVATE_USER' : 'DEACTIVATE_USER'),
    modul: 'USER',
    objectId: targetUserId,
    dataSebelum: { aktif: target.aktif },
    dataSesudah: { aktif },
  });

  return { username: target.username };
}

module.exports = {
  AuthError,
  login,
  logout,
  refreshAccessToken,
  resetAdminPassword,
  createUser,
  updateUserStatus,
  failedLoginKey,
  activeSessionKey,
  refreshTokenKey,
  tokenBlacklistKey,
  knownIpsKey,
  KNOWN_IPS_TTL_SECONDS,
  MAX_FAILED_ATTEMPTS,
  FAILED_ATTEMPTS_WINDOW_SECONDS,
};