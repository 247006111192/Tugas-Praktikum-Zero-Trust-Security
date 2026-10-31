/**
 * Hashing dan Verifikasi Password
 * Menggunakan bcryptjs
 */
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

/**
 * Menghasilkan hash dari plain text password
 * @param {string} password 
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Memverifikasi plain text password terhadap password_hash
 * @param {string} password 
 * @param {string} hash 
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  return await bcrypt.compare(password, hash);
}

module.exports = {
  hashPassword,
  verifyPassword
};
