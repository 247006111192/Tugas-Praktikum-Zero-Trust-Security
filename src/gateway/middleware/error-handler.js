/**
 * Gateway Error Handler Middleware
 * Menangani seluruh error secara konsisten dan aman
 */
const { AppError } = require('../../shared/utils/errors');
const { recordAuditLog } = require('../services/audit.service');

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'Terjadi kesalahan internal pada server';
  const requestId = req.requestId || 'req-err';

  // Catat error 4xx/5xx ke audit log jika belum dicatat
  if (req.user || req.headers['x-device-id'] || statusCode >= 400) {
    recordAuditLog({
      subject: req.user ? (req.user.sub || req.user.email || 'unknown') : 'anonymous',
      role: req.user ? (req.user.role || 'anonymous') : 'anonymous',
      endpoint: req.originalUrl ? req.originalUrl.split('?')[0] : 'unknown',
      method: req.method || 'UNKNOWN',
      deviceId: req.headers['x-device-id'] || null,
      decision: 'DENY',
      reason: message,
      statusCode,
      requestId
    }).catch(() => {});
  }

  // Format respons JSON konsisten
  const response = {
    success: false,
    error: {
      code: errorCode,
      message,
      statusCode,
      requestId
    }
  };

  if (err.details) {
    response.error.details = err.details;
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  errorHandler
};
