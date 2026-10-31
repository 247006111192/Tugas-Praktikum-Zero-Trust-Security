/**
 * Database Connection Pool
 * Menggunakan mysql2/promise dan prepared statements
 */
const mysql = require('mysql2/promise');
const config = require('../config/env');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: true
});

/**
 * Eksekusi prepared query
 * @param {string} sql 
 * @param {Array} params 
 * @returns {Promise<[Array, Object]>}
 */
async function query(sql, params = []) {
  return await pool.execute(sql, params);
}

/**
 * Eksekusi callback di dalam transaksi database
 * @param {Function} callback (connection) => Promise<any>
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Tutup pool saat shutdown aplikasi atau akhir pengujian
 */
async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  withTransaction,
  closePool
};
