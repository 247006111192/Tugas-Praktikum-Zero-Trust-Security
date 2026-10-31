/**
 * Audit Logging Service
 * Mencatat setiap keputusan akses (ALLOW / DENY) ke tabel audit_logs
 * Memastikan tidak pernah mencatat password, secret, atau token mentah.
 */
const { query } = require('../../shared/database/pool');

/**
 * Mencatat aktivitas/keputusan akses ke audit log
 * @param {Object} logData
 * @param {string} logData.subject - ID pengguna, email, atau clientId service
 * @param {string} logData.role - admin, lecturer, student, service, anonymous
 * @param {string} logData.endpoint - Path request (contoh: /nilai, /auth/login)
 * @param {string} logData.method - HTTP Method (GET, POST, PUT, DELETE)
 * @param {string} [logData.deviceId] - Device ID jika tersedia
 * @param {'ALLOW'|'DENY'} logData.decision - Keputusan akses
 * @param {string} logData.reason - Alasan keputusan otorisasi
 * @param {number} logData.statusCode - HTTP Status Code
 * @param {string} logData.requestId - UUID request untuk tracing
 */
async function recordAuditLog({
  subject = 'anonymous',
  role = 'anonymous',
  endpoint = 'unknown',
  method = 'UNKNOWN',
  deviceId = null,
  decision = 'DENY',
  reason = 'Tidak ada alasan yang dicantumkan',
  statusCode = 500,
  requestId = 'req-unknown'
}) {
  try {
    const sql = `
      INSERT INTO \`audit_logs\` 
      (\`subject\`, \`role\`, \`endpoint\`, \`method\`, \`device_id\`, \`decision\`, \`reason\`, \`status_code\`, \`request_id\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Sanitasi subject dan role agar tidak melebihi kapasitas kolom
    const safeSubject = String(subject).slice(0, 100);
    const safeRole = String(role).slice(0, 50);
    const safeEndpoint = String(endpoint).slice(0, 255);
    const safeMethod = String(method).slice(0, 10);
    const safeDeviceId = deviceId ? String(deviceId).slice(0, 100) : null;
    const safeReason = String(reason);

    await query(sql, [
      safeSubject,
      safeRole,
      safeEndpoint,
      safeMethod,
      safeDeviceId,
      decision,
      safeReason,
      statusCode,
      requestId
    ]);
  } catch (error) {
    // Audit failure logging - tidak boleh menghentikan enforcement atau membocorkan data
    console.error(`[AUDIT_ERROR] Gagal menulis ke audit_logs: ${error.message}`);
  }
}

/**
 * Ambil daftar audit logs (untuk inspeksi admin atau pengujian)
 * @param {number} [limit=100]
 * @returns {Promise<Array>}
 */
async function getAuditLogs(limit = 100) {
  const sql = `
    SELECT id, timestamp, subject, role, endpoint, method, device_id, decision, reason, status_code, request_id
    FROM \`audit_logs\`
    ORDER BY id DESC
    LIMIT ?
  `;
  const [rows] = await query(sql, [limit]);
  return rows;
}

module.exports = {
  recordAuditLog,
  getAuditLogs
};
