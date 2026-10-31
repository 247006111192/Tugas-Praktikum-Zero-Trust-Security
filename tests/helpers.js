/**
 * Test Setup and Helper Utilities
 */
const { pool, closePool } = require('../src/shared/database/pool');
const gatewayApp = require('../src/gateway/app');
const nilaiApp = require('../src/services/nilai/app');
const transkripApp = require('../src/services/transkrip/app');
const config = require('../src/shared/config/env');
const fs = require('fs');
const path = require('path');

let gatewayServer;
let nilaiServer;
let transkripServer;

/**
 * Reset dan re-seed database sebelum pengujian
 */
async function resetDatabase() {
  const seedSql = fs.readFileSync(path.join(__dirname, '../database/seed.sql'), 'utf8');
  const connection = await pool.getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');
    await connection.query(seedSql);
    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
  } finally {
    connection.release();
  }
}

/**
 * Jalankan server Gateway, Nilai, & Transkrip pada port masing-masing
 */
async function startInternalServers() {
  await new Promise((resolve) => {
    gatewayServer = gatewayApp.listen(config.ports.gateway, () => {
      resolve();
    });
  });

  await new Promise((resolve) => {
    nilaiServer = nilaiApp.listen(config.ports.nilai, () => {
      resolve();
    });
  });

  await new Promise((resolve) => {
    transkripServer = transkripApp.listen(config.ports.transkrip, () => {
      resolve();
    });
  });
}

/**
 * Hentikan semua server dan database pool
 */
async function stopAll() {
  if (gatewayServer) {
    await new Promise((resolve) => gatewayServer.close(resolve));
  }
  if (nilaiServer) {
    await new Promise((resolve) => nilaiServer.close(resolve));
  }
  if (transkripServer) {
    await new Promise((resolve) => transkripServer.close(resolve));
  }
  await closePool();
}

module.exports = {
  gatewayApp,
  nilaiApp,
  transkripApp,
  resetDatabase,
  startInternalServers,
  stopAll
};
