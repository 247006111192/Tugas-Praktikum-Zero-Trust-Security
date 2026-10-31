/**
 * Policy Service
 * Penghubung antara Policy Engine (PDP) dan Policy Enforcement Point (PEP) di Gateway
 * Sekaligus mencatat hasil evaluasi (ALLOW / DENY) ke Audit Log
 */
const crypto = require('crypto');
const { evaluatePolicy } = require('../policies/policy');
const { recordAuditLog } = require('./audit.service');

/**
 * Middleware Policy Enforcement Point (PEP)
 * @param {Function} [customContextExtractor] - Fungsi tambahan opsional untuk mengekstrak parameter
 */
function enforcePolicy(customContextExtractor) {
  return async (req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = requestId;

    const deviceId = req.headers['x-device-id'] || null;
    const user = req.user || null;
    const endpoint = req.originalUrl.split('?')[0];
    const method = req.method;

    let extraContext = {};
    if (typeof customContextExtractor === 'function') {
      extraContext = customContextExtractor(req);
    }

    const testTimeHeader = req.headers['x-test-time-override'];
    const customDate = testTimeHeader ? new Date(testTimeHeader) : (req.customDate || new Date());

    try {
      const evaluation = await evaluatePolicy({
        user,
        deviceId,
        endpoint,
        method,
        params: req.params,
        body: req.body,
        query: req.query,
        customDate,
        ...extraContext
      });

      // Catat ke Audit Log
      await recordAuditLog({
        subject: user ? (user.sub || user.email || 'unknown') : 'anonymous',
        role: user ? (user.role || 'anonymous') : 'anonymous',
        endpoint,
        method,
        deviceId,
        decision: evaluation.decision,
        reason: evaluation.reason,
        statusCode: evaluation.statusCode,
        requestId
      });

      if (evaluation.decision === 'DENY') {
        return res.status(evaluation.statusCode).json({
          success: false,
          error: {
            code: 'POLICY_DENIED',
            message: evaluation.reason,
            statusCode: evaluation.statusCode,
            requestId
          }
        });
      }

      req.policyDecision = evaluation;
      next();
    } catch (error) {
      console.error(`[POLICY_ERROR] Error mengevaluasi kebijakan: ${error.message}`);
      
      // Catat error ke audit log sebagai penolakan
      await recordAuditLog({
        subject: user ? (user.sub || 'unknown') : 'anonymous',
        role: user ? (user.role || 'anonymous') : 'anonymous',
        endpoint,
        method,
        deviceId,
        decision: 'DENY',
        reason: `Kesalahan sistem internal saat evaluasi kebijakan: ${error.message}`,
        statusCode: 500,
        requestId
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'POLICY_EVALUATION_ERROR',
          message: 'Terjadi kesalahan internal saat mengevaluasi kebijakan keamanan',
          requestId
        }
      });
    }
  };
}

module.exports = {
  enforcePolicy
};
