/**
 * Script untuk Menjalankan Ketiga Layanan Backend Bersamaan
 * 1. API Gateway (Port 3000)
 * 2. Service Nilai (Port 3001)
 * 3. Service Transkrip (Port 3002)
 */
const { spawn } = require('child_process');
const path = require('path');

console.log('===========================================================');
console.log('   Memulai Seluruh Layanan Zero Trust Security System      ');
console.log('===========================================================');

const services = [
  { name: 'Service Nilai    ', script: 'src/services/nilai/server.js', port: 3001 },
  { name: 'Service Transkrip', script: 'src/services/transkrip/server.js', port: 3002 },
  { name: 'API Gateway (PEP)', script: 'src/gateway/server.js', port: 3000 }
];

const processes = [];

services.forEach(svc => {
  const child = spawn(process.execPath, [path.resolve(__dirname, '..', svc.script)], {
    stdio: 'inherit',
    env: process.env
  });

  child.on('error', (err) => {
    console.error(`[${svc.name}] Gagal dijalankan: ${err.message}`);
  });

  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.warn(`[${svc.name}] Berhenti dengan exit code: ${code}`);
    }
  });

  processes.push(child);
});

// Handle termination signals
function shutdown() {
  console.log('\nMematikan seluruh layanan...');
  processes.forEach(p => p.kill('SIGTERM'));
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
