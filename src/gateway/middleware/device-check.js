/**
 * Middleware Pemeriksaan Perangkat Terdaftar (Device Check)
 * Menegakkan prinsip Zero Trust: Validasi perangkat pengguna pada setiap request
 */
const { query } = require('../../shared/database/pool');
const { BadRequestError, ForbiddenError } = require('../../shared/utils/errors');

/**
 * Memvalidasi apakah device ID terdaftar dan aktif untuk pengguna tertentu
 * @param {number|string} userId 
 * @param {string} deviceId 
 * @returns {Promise<{ valid: boolean, reason: string, device?: Object }>}
 */
async function verifyUserDevice(userId, deviceId) {
  if (!deviceId) {
    return { valid: false, reason: 'Header X-Device-ID tidak disertakan pada request' };
  }

  const sql = `
    SELECT id, user_id, device_id, device_name, is_active
    FROM \`registered_devices\`
    WHERE \`user_id\` = ? AND \`device_id\` = ?
    LIMIT 1
  `;

  const [rows] = await query(sql, [userId, deviceId]);

  if (rows.length === 0) {
    return {
      valid: false,
      reason: `Device ID '${deviceId}' tidak terdaftar untuk identitas pengguna ini`
    };
  }

  const device = rows[0];
  if (!device.is_active) {
    return {
      valid: false,
      reason: `Perangkat '${deviceId}' (${device.device_name}) dalam status dinonaktifkan`
    };
  }

  return { valid: true, reason: 'Perangkat terverifikasi valid dan aktif', device };
}

/**
 * Express Middleware untuk memvalidasi X-Device-ID pada endpoint terproteksi
 */
async function requireRegisteredDevice(req, res, next) {
  // Service-to-service call tidak menggunakan device ID pengguna
  if (req.user && req.user.role === 'service') {
    return next();
  }

  const deviceId = req.headers['x-device-id'];
  if (!deviceId) {
    return next(new BadRequestError('Header X-Device-ID wajib disertakan untuk mengakses endpoint ini'));
  }

  // Jika user sudah terautentikasi (via authenticate middleware)
  if (req.user && req.user.sub) {
    try {
      const check = await verifyUserDevice(req.user.sub, deviceId);
      if (!check.valid) {
        return next(new ForbiddenError(check.reason));
      }
      req.device = check.device;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  // Jika belum ada req.user (misalnya dipanggil sebelum auth)
  req.deviceId = deviceId;
  next();
}

module.exports = {
  verifyUserDevice,
  requireRegisteredDevice
};
