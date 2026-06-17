const { login: loginService, AuthError } = require('./auth.service');

const ACCESS_TOKEN_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 jam
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username dan password wajib diisi' });
  }

  try {
    const result = await loginService({ username, password });

    // Langkah 11: set httpOnly cookie (access_token + refresh_token)
    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
      sameSite: 'strict',
    });
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
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

module.exports = { login };