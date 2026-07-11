const {
  login: loginService,
  logout: logoutService,
  refreshAccessToken: refreshAccessTokenService,
  resetAdminPassword: resetAdminPasswordService,
  createUser: createUserService,
  updateUserStatus: updateUserStatusService,
  AuthError,
} = require('./auth.service');
const { findAllAdmins, findAllUsers, findById } = require('./auth.repository');

const ACCESS_TOKEN_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 jam
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username dan password wajib diisi' });
  }

  try {
    // req.ip akurat di belakang reverse proxy karena trust proxy diset di app.js
    const result = await loginService({ username, password, ipAddress: req.ip });

    // Langkah 11: set httpOnly cookie (access_token + refresh_token)
    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
      sameSite: 'strict',
    });
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: REFRESH_TOKEN_MAX_AGE_MS,
      sameSite: 'strict',
    });

    return res.status(200).json({ peran: result.peran, nama: result.nama });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

async function logout(req, res) {
  const token = req.cookies?.access_token;

  if (!token) {
    return res.status(401).json({ message: 'Tidak ada sesi aktif' });
  }

  try {
    await logoutService(token);

    // Langkah 3: clear cookie
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    // Langkah 5: return 200
    return res.status(200).json({ message: 'Logout berhasil' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

async function refresh(req, res) {
  const refreshToken = req.cookies?.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh token tidak ditemukan, silakan login' });
  }

  try {
    const result = await refreshAccessTokenService(refreshToken);

    // Set ulang access_token cookie (opsi sama seperti login)
    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
      sameSite: 'strict',
    });

    return res.status(200).json({ message: 'Access token diperbarui' });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error('Refresh error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

/**
 * GET /api/auth/me — info sesi user yang sedang login.
 * Data diambil segar dari DB (bukan dari payload JWT) agar perubahan
 * status/peran langsung terlihat; user yang sudah dihapus atau
 * dinonaktifkan dibalas 401.
 */
async function me(req, res) {
  try {
    const user = await findById(req.user.userId);
    if (!user || !user.aktif) {
      return res.status(401).json({ message: 'Sesi tidak valid, silakan login ulang' });
    }
    return res.status(200).json({ userId: user.id, peran: user.peran, nama: user.username });
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

async function listAdmins(req, res) {
  try {
    const admins = await findAllAdmins();
    return res.status(200).json(admins);
  } catch (err) {
    console.error('listAdmins error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

async function listUsers(req, res) {
  try {
    const users = await findAllUsers();
    return res.status(200).json(users);
  } catch (err) {
    console.error('listUsers error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

async function resetAdminPassword(req, res) {
  const targetUserId = Number(req.params.id);
  const { newPassword } = req.body;

  if (!targetUserId || isNaN(targetUserId)) {
    return res.status(400).json({ message: 'ID user tidak valid' });
  }
  if (!newPassword) {
    return res.status(400).json({ message: 'newPassword wajib diisi' });
  }

  try {
    const result = await resetAdminPasswordService(req.user.userId, targetUserId, newPassword);
    return res.status(200).json({ message: `Password akun "${result.username}" berhasil direset` });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error('resetAdminPassword error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

async function createUser(req, res) {
  const { username, password, peran } = req.body;

  try {
    const result = await createUserService({ username, password, peran }, { actorUserId: req.user.userId });
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error('createUser error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

async function updateUserStatus(req, res) {
  const targetUserId = Number(req.params.id);
  const { aktif } = req.body;

  try {
    const result = await updateUserStatusService(targetUserId, aktif, {
      actorUserId: req.user.userId,
      actorRole: req.user.peran,
    });
    return res.status(200).json({ message: `Status akun "${result.username}" berhasil diubah` });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error('updateUserStatus error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

/**
 * Jalur dev-only (backend/rest-dev.http) — tanpa sesi login, hanya
 * digerbangi middleware requireDevSecret. actorUserId sengaja null
 * karena bukan aksi dari sesi user; audit log ditandai isDev:true
 * di service (aksi berprefix DEV_).
 */
async function devCreateUser(req, res) {
  const { username, password, peran } = req.body;

  try {
    const result = await createUserService({ username, password, peran }, { actorUserId: null, isDev: true });
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error('devCreateUser error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

async function devUpdateUserStatus(req, res) {
  const targetUserId = Number(req.params.id);
  const { aktif } = req.body;

  try {
    const result = await updateUserStatusService(targetUserId, aktif, {
      actorUserId: null,
      actorRole: null,
      isDev: true,
    });
    return res.status(200).json({ message: `Status akun "${result.username}" berhasil diubah` });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error('devUpdateUserStatus error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

async function devResetPassword(req, res) {
  const targetUserId = Number(req.params.id);
  const { newPassword } = req.body;

  if (!targetUserId || isNaN(targetUserId)) {
    return res.status(400).json({ message: 'ID user tidak valid' });
  }
  if (!newPassword) {
    return res.status(400).json({ message: 'newPassword wajib diisi' });
  }

  try {
    const result = await resetAdminPasswordService(null, targetUserId, newPassword, { isDev: true });
    return res.status(200).json({ message: `Password akun "${result.username}" berhasil direset` });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error('devResetPassword error:', err);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
}

module.exports = {
  login,
  logout,
  refresh,
  me,
  listAdmins,
  listUsers,
  resetAdminPassword,
  createUser,
  updateUserStatus,
  devCreateUser,
  devUpdateUserStatus,
  devResetPassword,
};