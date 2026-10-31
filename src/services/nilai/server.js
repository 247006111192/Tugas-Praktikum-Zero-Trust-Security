/**
 * Server Entry Point: Service Nilai
 * Port 3001
 */
const app = require('./app');
const config = require('../../shared/config/env');

const PORT = config.ports.nilai;

const server = app.listen(PORT, () => {
  console.log(`[SERVICE NILAI] Berjalan pada http://127.0.0.1:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[SERVICE NILAI] Menutup server...');
  server.close(() => {
    console.log('[SERVICE NILAI] Server ditutup.');
  });
});

module.exports = server;
