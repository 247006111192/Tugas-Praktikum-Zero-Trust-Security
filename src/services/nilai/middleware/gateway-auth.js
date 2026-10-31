/**
 * Gateway Auth Middleware untuk Service Nilai
 * Memverifikasi header X-Gateway-Secret
 * Menolak request yang tidak berasal dari API Gateway resmi
 */
const config = require('../../../shared/config/env');
const { ForbiddenError } = require('../../../shared/utils/errors');

function requireGatewaySecret(req, res, next) {
  const secretHeader = req.headers['x-gateway-secret'];

  if (!secretHeader || secretHeader !== config.gatewaySecret) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'INVALID_GATEWAY_SECRET',
        message: 'Akses ditolak: Permintaan tidak melalui API Gateway resmi atau secret tidak valid'
      }
    });
  }

  next();
}

module.exports = {
  requireGatewaySecret
};
