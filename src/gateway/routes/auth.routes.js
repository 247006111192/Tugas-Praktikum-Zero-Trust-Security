/**
 * Authentication Routes pada API Gateway
 * /auth/login, /auth/refresh, /auth/logout, /auth/service
 */
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const authService = require('../services/auth.service');
const { recordAuditLog } = require('../services/audit.service');

// Rate limiter untuk proteksi endpoint login dari brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 20, // maksimal 20 percobaan login per IP
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Terlalu banyak percobaan login, coba lagi setelah 15 menit'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * POST /auth/login
 * Login pengguna dengan verifikasi identitas, password, dan perangkat terdaftar (X-Device-ID)
 */
router.post('/login', loginLimiter, async (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const deviceId = req.headers['x-device-id'];
  const { email, password } = req.body;

  try {
    const result = await authService.loginUser({ email, password }, deviceId);

    // Catat keberhasilan login ke Audit Log
    await recordAuditLog({
      subject: String(result.user.id),
      role: result.user.role,
      endpoint: '/auth/login',
      method: 'POST',
      deviceId,
      decision: 'ALLOW',
      reason: `Autentikasi kredensial dan validasi perangkat '${deviceId}' berhasil`,
      statusCode: 200,
      requestId
    });

    return res.status(200).json({
      success: true,
      message: 'Login berhasil',
      data: result
    });
  } catch (error) {
    const statusCode = error.statusCode || 401;

    // Catat kegagalan login ke Audit Log
    await recordAuditLog({
      subject: email || 'unknown',
      role: 'anonymous',
      endpoint: '/auth/login',
      method: 'POST',
      deviceId: deviceId || null,
      decision: 'DENY',
      reason: error.message,
      statusCode,
      requestId
    });

    next(error);
  }
});

/**
 * POST /auth/refresh
 * Memperbarui access token dengan refresh token rotation atomik
 */
router.post('/refresh', async (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const { refreshToken } = req.body;

  try {
    const tokens = await authService.refreshAccessToken(refreshToken);

    await recordAuditLog({
      subject: 'token-rotation',
      role: 'authenticated',
      endpoint: '/auth/refresh',
      method: 'POST',
      deviceId: req.headers['x-device-id'] || null,
      decision: 'ALLOW',
      reason: 'Refresh token rotation berhasil dieksekusi',
      statusCode: 200,
      requestId
    });

    return res.status(200).json({
      success: true,
      message: 'Access token dan refresh token berhasil diperbarui',
      data: tokens
    });
  } catch (error) {
    await recordAuditLog({
      subject: 'token-rotation',
      role: 'anonymous',
      endpoint: '/auth/refresh',
      method: 'POST',
      deviceId: req.headers['x-device-id'] || null,
      decision: 'DENY',
      reason: error.message,
      statusCode: error.statusCode || 401,
      requestId
    });

    next(error);
  }
});

/**
 * POST /auth/logout
 * Mencabut refresh token agar tidak dapat digunakan lagi
 */
router.post('/logout', async (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const { refreshToken } = req.body;

  try {
    await authService.logoutUser(refreshToken);

    await recordAuditLog({
      subject: 'logout',
      role: 'authenticated',
      endpoint: '/auth/logout',
      method: 'POST',
      deviceId: req.headers['x-device-id'] || null,
      decision: 'ALLOW',
      reason: 'Refresh token berhasil dicabut pada logout',
      statusCode: 200,
      requestId
    });

    return res.status(200).json({
      success: true,
      message: 'Logout berhasil. Refresh token telah dicabut.'
    });
  } catch (error) {
    await recordAuditLog({
      subject: 'logout',
      role: 'anonymous',
      endpoint: '/auth/logout',
      method: 'POST',
      deviceId: req.headers['x-device-id'] || null,
      decision: 'DENY',
      reason: error.message,
      statusCode: error.statusCode || 400,
      requestId
    });

    next(error);
  }
});

/**
 * POST /auth/service
 * Autentikasi khusus antar-service untuk menerbitkan service token
 */
router.post('/service', async (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const { clientId, clientSecret } = req.body;

  try {
    const result = await authService.issueServiceToken(clientId, clientSecret);

    await recordAuditLog({
      subject: clientId || 'service',
      role: 'service',
      endpoint: '/auth/service',
      method: 'POST',
      deviceId: null,
      decision: 'ALLOW',
      reason: `Penerbitan service token berhasil untuk client: ${clientId}`,
      statusCode: 200,
      requestId
    });

    return res.status(200).json({
      success: true,
      message: 'Service token berhasil diterbitkan',
      data: result
    });
  } catch (error) {
    await recordAuditLog({
      subject: clientId || 'unknown-service',
      role: 'service',
      endpoint: '/auth/service',
      method: 'POST',
      deviceId: null,
      decision: 'DENY',
      reason: error.message,
      statusCode: error.statusCode || 401,
      requestId
    });

    next(error);
  }
});

module.exports = router;
