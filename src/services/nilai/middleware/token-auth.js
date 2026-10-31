/**
 * Token Auth Middleware untuk Service Nilai (Defense in Depth)
 * Melakukan verifikasi mandiri terhadap signature dan masa berlaku JWT
 */
const { verifyAnyToken } = require('../../../shared/auth/jwt');
const { UnauthorizedError } = require('../../../shared/utils/errors');

function verifyServiceTokenAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'MISSING_AUTHORIZATION',
        message: 'Header Authorization tidak ditemukan'
      }
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_AUTH_FORMAT',
        message: 'Format token tidak valid'
      }
    });
  }

  const token = parts[1];
  try {
    const { payload, isService } = verifyAnyToken(token);
    req.user = payload;
    req.isService = isService;
    req.token = token;
    next();
  } catch (error) {
    return res.status(error.statusCode || 401).json({
      success: false,
      error: {
        code: error.code || 'TOKEN_INVALID',
        message: error.message
      }
    });
  }
}

module.exports = {
  verifyServiceTokenAuth
};
