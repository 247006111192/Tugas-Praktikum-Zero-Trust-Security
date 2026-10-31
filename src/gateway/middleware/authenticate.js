/**
 * Middleware Autentikasi JWT pada API Gateway
 * Memverifikasi format Bearer Token dan validitas klaim JWT
 */
const { verifyAnyToken } = require('../../shared/auth/jwt');
const { UnauthorizedError } = require('../../shared/utils/errors');

function authenticateJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next(new UnauthorizedError('Header Authorization tidak ditemukan. Harap sertakan Bearer token.'));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return next(new UnauthorizedError('Format Authorization header tidak valid. Gunakan: Bearer <token>'));
  }

  const token = parts[1];
  try {
    const { payload, isService } = verifyAnyToken(token);
    req.user = payload;
    req.isService = isService;
    req.token = token;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  authenticateJwt
};
