/**
 * Kelas Routes pada API Gateway
 * Endpoint POST /kelas/:id/finalisasi dan GET /kelas
 */
const express = require('express');
const router = express.Router();
const config = require('../../shared/config/env');
const { authenticateJwt } = require('../middleware/authenticate');
const { requireRegisteredDevice } = require('../middleware/device-check');
const { enforcePolicy } = require('../services/policy.service');
const { forwardToService } = require('../services/gateway-proxy.service');

/**
 * POST /kelas/:id/finalisasi
 * Finalisasi nilai kelas oleh dosen pengampu dan memicu sinkronisasi transkrip
 */
router.post(
  '/:id/finalisasi',
  authenticateJwt,
  requireRegisteredDevice,
  enforcePolicy(),
  async (req, res) => {
    await forwardToService(config.services.nilaiUrl, `/kelas/${req.params.id}/finalisasi`, req, res);
  }
);

/**
 * GET /kelas
 * Melihat daftar kelas
 */
router.get(
  '/',
  authenticateJwt,
  requireRegisteredDevice,
  enforcePolicy(),
  async (req, res) => {
    await forwardToService(config.services.nilaiUrl, '/kelas', req, res);
  }
);

module.exports = router;
