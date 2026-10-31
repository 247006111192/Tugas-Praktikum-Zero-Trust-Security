/**
 * Authentication Service
 * Menangani Login, Refresh Token Rotation, Logout, dan Penerbitan Service Token
 */
const { query, withTransaction } = require('../../shared/database/pool');
const { verifyPassword } = require('../../shared/auth/password');
const {
  generateAccessToken,
  generateRefreshToken,
  generateServiceToken,
  verifyRefreshToken,
  hashToken
} = require('../../shared/auth/jwt');
const { verifyUserDevice } = require('../middleware/device-check');
const { UnauthorizedError, ForbiddenError, BadRequestError } = require('../../shared/utils/errors');
const config = require('../../shared/config/env');

/**
 * Login Pengguna
 * @param {Object} credentials 
 * @param {string} credentials.email 
 * @param {string} credentials.password 
 * @param {string} deviceId 
 * @returns {Promise<Object>}
 */
async function loginUser({ email, password }, deviceId) {
  if (!email || !password) {
    throw new BadRequestError('Email dan password wajib diisi');
  }

  if (!deviceId) {
    throw new BadRequestError('Header X-Device-ID wajib disertakan saat melakukan login');
  }

  // 1. Cari user berdasarkan email
  const [users] = await query(
    'SELECT id, nim, name, email, password_hash, role, is_active FROM `users` WHERE `email` = ? LIMIT 1',
    [email]
  );

  // Jangan membocorkan apakah email yang tidak terdaftar atau password yang salah
  if (users.length === 0) {
    throw new UnauthorizedError('Kredensial login (email atau password) tidak valid');
  }

  const user = users[0];

  // 2. Periksa status keaktifan akun
  if (!user.is_active) {
    throw new ForbiddenError('Akun pengguna telah dinonaktifkan. Hubungi administrator.');
  }

  // 3. Verifikasi Password
  const isPasswordMatch = await verifyPassword(password, user.password_hash);
  if (!isPasswordMatch) {
    throw new UnauthorizedError('Kredensial login (email atau password) tidak valid');
  }

  // 4. Zero Trust: Validasi Perangkat (X-Device-ID harus terdaftar dan aktif untuk user ini)
  const deviceCheck = await verifyUserDevice(user.id, deviceId);
  if (!deviceCheck.valid) {
    throw new ForbiddenError(`Akses ditolak: ${deviceCheck.reason}`);
  }

  // 5. Generate Access Token (10m) & Refresh Token (1d)
  const accessToken = generateAccessToken(user);
  const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken(user);

  // 6. Simpan hash refresh token ke database
  await query(
    'INSERT INTO `refresh_tokens` (`user_id`, `token_hash`, `expires_at`) VALUES (?, ?, ?)',
    [user.id, tokenHash, expiresAt]
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      nim: user.nim
    },
    device: {
      id: deviceCheck.device.device_id,
      name: deviceCheck.device.device_name
    },
    tokens: {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: config.jwt.accessExpiresIn
    }
  };
}

/**
 * Refresh Access Token dengan Refresh Token Rotation Atomik
 * @param {string} rawRefreshToken 
 * @returns {Promise<Object>}
 */
async function refreshAccessToken(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw new BadRequestError('Refresh token wajib disertakan');
  }

  // 1. Verifikasi tanda tangan dan expiry token JWT
  const decoded = verifyRefreshToken(rawRefreshToken);
  const tokenHash = hashToken(rawRefreshToken);

  // 2. Eksekusi rotasi atomik di dalam database transaction
  return await withTransaction(async (connection) => {
    // Kunci baris refresh token untuk mencegah race condition / reuse
    const [tokens] = await connection.execute(
      'SELECT id, user_id, token_hash, expires_at, revoked_at FROM `refresh_tokens` WHERE `token_hash` = ? FOR UPDATE',
      [tokenHash]
    );

    if (tokens.length === 0) {
      throw new UnauthorizedError('Refresh token tidak ditemukan atau tidak dikenali');
    }

    const tokenRecord = tokens[0];

    // Periksa apakah token sudah pernah dicabut
    if (tokenRecord.revoked_at !== null) {
      throw new UnauthorizedError('Refresh token telah dicabut sebelumnya. Silakan login kembali.');
    }

    // Periksa kedaluwarsa waktu
    const now = new Date();
    if (new Date(tokenRecord.expires_at) <= now) {
      throw new UnauthorizedError('Refresh token telah kedaluwarsa');
    }

    // Ambil data user aktif
    const [users] = await connection.execute(
      'SELECT id, nim, name, email, role, is_active FROM `users` WHERE `id` = ? LIMIT 1',
      [tokenRecord.user_id]
    );

    if (users.length === 0 || !users[0].is_active) {
      throw new ForbiddenError('Pengguna tidak ditemukan atau telah dinonaktifkan');
    }

    const user = users[0];

    // ROTASI ATOMIK: Cabut refresh token lama
    await connection.execute(
      'UPDATE `refresh_tokens` SET `revoked_at` = NOW() WHERE `id` = ?',
      [tokenRecord.id]
    );

    // Terbitkan refresh token baru dan access token baru
    const newAccessToken = generateAccessToken(user);
    const { token: newRefreshToken, tokenHash: newHash, expiresAt: newExpiresAt } = generateRefreshToken(user);

    // Simpan refresh token baru
    await connection.execute(
      'INSERT INTO `refresh_tokens` (`user_id`, `token_hash`, `expires_at`) VALUES (?, ?, ?)',
      [user.id, newHash, newExpiresAt]
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: config.jwt.accessExpiresIn
    };
  });
}

/**
 * Logout Pengguna (Pencabutan Refresh Token)
 * @param {string} rawRefreshToken 
 * @returns {Promise<boolean>}
 */
async function logoutUser(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw new BadRequestError('Refresh token wajib disertakan untuk melakukan logout');
  }

  const tokenHash = hashToken(rawRefreshToken);

  const [result] = await query(
    'UPDATE `refresh_tokens` SET `revoked_at` = NOW() WHERE `token_hash` = ? AND `revoked_at` IS NULL',
    [tokenHash]
  );

  return result.affectedRows > 0;
}

/**
 * Autentikasi Khusus Antar-Service (Menerbitkan Service Token)
 * @param {string} clientId 
 * @param {string} clientSecret 
 * @returns {Promise<Object>}
 */
async function issueServiceToken(clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    throw new BadRequestError('clientId dan clientSecret wajib disertakan');
  }

  // Verifikasi kredensial service terhadap konfigurasi aman
  const validClientId = config.services.serviceNilaiClientId;
  const validClientSecret = config.services.serviceNilaiClientSecret;

  if (clientId !== validClientId || clientSecret !== validClientSecret) {
    throw new UnauthorizedError('Kredensial client service tidak valid');
  }

  const serviceToken = generateServiceToken(clientId);

  return {
    serviceToken,
    tokenType: 'Bearer',
    expiresIn: config.jwt.serviceExpiresIn,
    clientId
  };
}

module.exports = {
  loginUser,
  refreshAccessToken,
  logoutUser,
  issueServiceToken
};
