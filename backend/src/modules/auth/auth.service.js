const { getRedisClient } = require('../../config/redis');
const { comparePassword } = require('../../utils/password.util');
const { signAccessToken, signRefreshToken } = require('../../utils/jwt.util');
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

module.exports = {
  AuthError,
  login,
  // di-export untuk keperluan testing/reuse oleh logout (sub-step berikutnya)
  failedLoginKey,
  activeSessionKey,
  refreshTokenKey,
  tokenBlacklistKey,
  MAX_FAILED_ATTEMPTS,
  FAILED_ATTEMPTS_WINDOW_SECONDS,
};