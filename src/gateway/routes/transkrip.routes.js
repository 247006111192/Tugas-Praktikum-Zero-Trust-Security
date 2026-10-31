/**
 * Transkrip Routes pada API Gateway
 * Endpoint GET /transkrip/:nim dan POST /transkrip/sinkron
 */
const express = require('express');
const router = express.Router();
const config = require('../../shared/config/env');
const { authenticateJwt } = require('../middleware/authenticate');
const { requireRegisteredDevice } = require('../middleware/device-check');
const { enforcePolicy } = require('../services/policy.service');
const { forwardToService } = require('../services/gateway-proxy.service');

/**
 * GET /transkrip/:nim
 * Melihat transkrip akademik berdasarkan NIM
 * Mahasiswa hanya melihat milik sendiri, Admin boleh melihat siapa pun
 */
router.get(
  '/:nim',
  authenticateJwt,
  requireRegisteredDevice,
  enforcePolicy(),
  async (req, res) => {
    await forwardToService(config.services.transkripUrl, `/transkrip/${req.params.nim}`, req, res);
  }
);

/**
 * POST /transkrip/sinkron
 * Endpoint sinkronisasi transkrip oleh Service Nilai menggunakan Service Token
 */
router.post(
  '/sinkron',
  authenticateJwt,
  enforcePolicy(),
  async (req, res) => {
    await forwardToService(config.services.transkripUrl, '/transkrip/sinkron', req, res);
  }
);

module.exports = router;
