/**
 * Setup Database Script for Zero Trust Security System
 * Menghubungkan ke MySQL, membaca schema.sql dan seed.sql, serta mengeksekusinya.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function setupDatabase() {
  console.log('====================================================');
  console.log('   Mempersiapkan Database Zero Trust Security...    ');
  console.log('====================================================');

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'zero_trust_security';

  console.log(`Menghubungkan ke MySQL di ${host}:${port} dengan user: ${user}...`);

  let connection;
  try {
    // Koneksi awal tanpa memilih database agar bisa membuat database jika belum ada
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true
    });

    console.log('✓ Terhubung ke MySQL server.');

    // 1. Eksekusi Schema
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    console.log(`Membaca file schema dari: ${schemaPath}`);
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Mengeksekusi schema SQL...');
    await connection.query(schemaSql);
    console.log(`✓ Schema berhasil diterapkan pada database '${database}'.`);

    // 2. Eksekusi Seed Data
    const seedPath = path.join(__dirname, '../database/seed.sql');
    console.log(`Membaca file seed dari: ${seedPath}`);
    const seedSql = fs.readFileSync(seedPath, 'utf8');

    console.log('Mengeksekusi seed data SQL...');
    await connection.query(seedSql);
    console.log('✓ Seed data berhasil dimasukkan ke tabel.');

    console.log('\n====================================================');
    console.log('   Inisialisasi Database Berhasil Sempurna!         ');
    console.log('====================================================');
  } catch (error) {
    console.error('\n❌ Gagal menginisialisasi database:');
    console.error(error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\nPastikan MySQL/MariaDB pada XAMPP Control Panel sudah dalam status "Running".');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

setupDatabase();
