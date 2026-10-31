/**
 * Modul JWT & Token Management
 * Menangani pembuatan dan verifikasi Access Token, Refresh Token, dan Service Token
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');
const { UnauthorizedError } = require('../utils/errors');

/**
 * Hash string token menggunakan SHA-256 untuk disimpan secara aman di database
 * @param {string} token 
 * @returns {string} hex hash
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate Access Token untuk pengguna
 * Masa berlaku: 10 menit
 * Claim minimal: sub, role, type: 'access'
 * @param {Object} user 
 * @returns {string} JWT access token
 */
function generateAccessToken(user) {
  const payload = {
    sub: String(user.id),
    email: user.email,
    role: user.role,
    name: user.name,
    nim: user.nim || null,
    type: 'access'
  };

  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn
  });
}

/**
 * Generate Refresh Token untuk pengguna
 * Masa berlaku: 1 hari
 * Menggunakan JWT bertanda tangan dengan refreshSecret
 * @param {Object} user 
 * @returns {{ token: string, tokenHash: string, expiresAt: Date }}
 */
function generateRefreshToken(user) {
  const payload = {
    sub: String(user.id),
    role: user.role,
    type: 'refresh',
    jti: crypto.randomUUID()
  };

  const token = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn
  });

  const tokenHash = hashToken(token);
  // Hitung tanggal kedaluwarsa 1 hari ke depan
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  return { token, tokenHash, expiresAt };
}

/**
 * Generate Service Token untuk komunikasi antar-service
 * Masa berlaku: 5 menit
 * Claim minimal: sub (service identity), role: 'service', type: 'service'
 * @param {string} clientId 
 * @returns {string} JWT service token
 */
function generateServiceToken(clientId) {
  const payload = {
    sub: clientId,
    role: 'service',
    type: 'service'
  };

  return jwt.sign(payload, config.jwt.serviceSecret, {
    expiresIn: config.jwt.serviceExpiresIn
  });
}

/**
 * Verifikasi Access Token Pengguna
 * @param {string} token 
 * @returns {Object} payload
 */
function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret);
    if (payload.type !== 'access') {
      throw new UnauthorizedError('Jenis token tidak sesuai, diharapkan user access token');
    }
    return payload;
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Access token telah kedaluwarsa');
    }
    throw new UnauthorizedError('Access token tidak valid atau telah dimodifikasi');
  }
}

/**
 * Verifikasi Refresh Token
 * @param {string} token 
 * @returns {Object} payload
 */
function verifyRefreshToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.refreshSecret);
    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('Jenis token tidak sesuai, diharapkan refresh token');
    }
    return payload;
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Refresh token telah kedaluwarsa');
    }
    throw new UnauthorizedError('Refresh token tidak valid atau telah dimodifikasi');
  }
}

/**
 * Verifikasi Service Token Antar-Service
 * @param {string} token 
 * @returns {Object} payload
 */
function verifyServiceToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.serviceSecret);
    if (payload.type !== 'service' || payload.role !== 'service') {
      throw new UnauthorizedError('Token bukan merupakan service token yang sah');
    }
    return payload;
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Service token telah kedaluwarsa');
    }
    throw new UnauthorizedError('Service token tidak valid');
  }
}

/**
 * Verifikasi Token Fleksibel (Mencoba verifikasi Access Token atau Service Token)
 * Digunakan oleh resource services yang dapat melayani request dari user atau service
 * @param {string} token 
 * @returns {{ payload: Object, isService: boolean }}
 */
function verifyAnyToken(token) {
  if (!token) {
    throw new UnauthorizedError('Token otentikasi tidak disediakan');
  }

  // 1. Coba decode unverified untuk membaca klaim type
  const unverified = jwt.decode(token);
  if (!unverified) {
    throw new UnauthorizedError('Format token tidak valid');
  }

  if (unverified.type === 'service' || unverified.role === 'service') {
    const payload = verifyServiceToken(token);
    return { payload, isService: true };
  } else {
    const payload = verifyAccessToken(token);
    return { payload, isService: false };
  }
}

module.exports = {
  hashToken,
  generateAccessToken,
  generateRefreshToken,
  generateServiceToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyServiceToken,
  verifyAnyToken
};
