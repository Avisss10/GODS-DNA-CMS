const { getRedisClient } = require('../../config/redis');
const { comparePassword } = require('../../utils/password.util');
const { signAccessToken, signRefreshToken, verifyAccessToken } = require('../../utils/jwt.util');
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

/**
 * Proses login lengkap sesuai 14 langkah BAGIAN 1.1.
 *
 * @param {{ username: string, password: string }} credentials
 * @returns {Promise<{ peran: string, nama: string, accessToken: string, refreshToken: string }>}
 * @throws {AuthError} dengan statusCode 401/403/429 sesuai langkah dokumen
 */
async function login({ username, password }) {
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
 * Reset password akun ADMIN oleh LEADER.
 * Leader tidak bisa reset password sesama Leader.
 *
 * @param {number} leaderId - id user yang melakukan reset (LEADER)
 * @param {number} targetUserId - id akun ADMIN yang akan direset
 * @param {string} newPassword - password baru (plaintext)
 * @returns {Promise<{ username: string }>}
 * @throws {AuthError} 404 jika target tidak ditemukan, 403 jika target bukan ADMIN
 */
async function resetAdminPassword(leaderId, targetUserId, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw new AuthError('Password baru minimal 8 karakter', 400);
  }

  const target = await authRepository.findById(targetUserId);
  if (!target) {
    throw new AuthError('User tidak ditemukan', 404);
  }
  if (target.peran !== 'ADMIN') {
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
    aksi: 'RESET_PASSWORD',
    modul: 'AUTH',
    objectId: targetUserId,
    dataSebelum: { username: target.username },
    dataSesudah: { username: target.username, passwordReset: true },
  });

  return { username: target.username };
}

module.exports = {
  AuthError,
  login,
  logout,
  resetAdminPassword,
  failedLoginKey,
  activeSessionKey,
  refreshTokenKey,
  tokenBlacklistKey,
  MAX_FAILED_ATTEMPTS,
  FAILED_ATTEMPTS_WINDOW_SECONDS,
};