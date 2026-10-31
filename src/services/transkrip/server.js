/**
 * Server Entry Point: Service Transkrip
 * Port 3002
 */
const app = require('./app');
const config = require('../../shared/config/env');

const PORT = config.ports.transkrip;

const server = app.listen(PORT, () => {
  console.log(`[SERVICE TRANSKRIP] Berjalan pada http://127.0.0.1:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[SERVICE TRANSKRIP] Menutup server...');
  server.close(() => {
    console.log('[SERVICE TRANSKRIP] Server ditutup.');
  });
});

module.exports = server;
