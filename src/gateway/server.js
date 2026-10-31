/**
 * Server Entry Point: API Gateway
 * Port 3000
 */
const app = require('./app');
const config = require('../shared/config/env');

const PORT = config.ports.gateway;

const server = app.listen(PORT, () => {
  console.log(`[API GATEWAY] Berjalan pada http://127.0.0.1:${PORT}`);
  console.log(`[API GATEWAY] Policy Enforcement Point (PEP) aktif`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('[API GATEWAY] Menerima sinyal SIGTERM, menutup server...');
  server.close(() => {
    console.log('[API GATEWAY] Server ditutup.');
  });
});

module.exports = server;
