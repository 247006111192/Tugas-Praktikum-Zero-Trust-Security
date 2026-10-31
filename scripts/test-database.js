/**
 * Test Database Script for Zero Trust Security System
 * Menguji koneksi database, memeriksa tabel, dan menampilkan ringkasan data awal.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testDatabase() {
  console.log('====================================================');
  console.log('   Pemeriksaan Status Database Zero Trust Security  ');
  console.log('====================================================');

  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'zero_trust_security',
    waitForConnections: true,
    connectionLimit: 5
  });

  try {
    const [dbResult] = await pool.query('SELECT DATABASE() as current_db, VERSION() as version');
    console.log(`✓ Terhubung ke database: ${dbResult[0].current_db}`);
    console.log(`✓ Versi Server MySQL: ${dbResult[0].version}\n`);

    const tables = [
      'users',
      'registered_devices',
      'refresh_tokens',
      'classes',
      'enrollments',
      'grades',
      'transcripts',
      'audit_logs'
    ];

    console.log('Ringkasan Jumlah Baris Data:');
    console.log('----------------------------------------------------');
    for (const table of tables) {
      const [rows] = await pool.query(`SELECT COUNT(*) as count FROM \`${table}\``);
      console.log(`- ${table.padEnd(20)}: ${rows[0].count} baris`);
    }

    console.log('----------------------------------------------------');
    console.log('✓ Seluruh tabel terverifikasi aktif dan siap digunakan.');
  } catch (error) {
    console.error('❌ Gagal memeriksa database:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testDatabase();
