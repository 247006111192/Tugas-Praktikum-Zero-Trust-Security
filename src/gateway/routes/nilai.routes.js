/**
 * Nilai Routes pada API Gateway
 * Endpoint GET /nilai dan PUT /nilai/:id
 * Menegakkan verifikasi JWT, device check, Policy Engine, dan meneruskan ke Service Nilai
 */
const express = require('express');
const router = express.Router();
const config = require('../../shared/config/env');
const { authenticateJwt } = require('../middleware/authenticate');
const { requireRegisteredDevice } = require('../middleware/device-check');
const { enforcePolicy } = require('../services/policy.service');
const { forwardToService } = require('../services/gateway-proxy.service');

/**
 * GET /nilai
 * Melihat daftar nilai sesuai hak akses (student melihat milik sendiri, lecturer melihat kelasnya)
 */
router.get(
  '/',
  authenticateJwt,
  requireRegisteredDevice,
  enforcePolicy(),
  async (req, res) => {
    await forwardToService(config.services.nilaiUrl, '/nilai', req, res);
  }
);

/**
 * PUT /nilai/:id
 * Mengubah nilai mahasiswa pada kelas yang diampu dosen
 */
router.put(
  '/:id',
  authenticateJwt,
  requireRegisteredDevice,
  enforcePolicy(),
  async (req, res) => {
    await forwardToService(config.services.nilaiUrl, `/nilai/${req.params.id}`, req, res);
  }
);

module.exports = router;
