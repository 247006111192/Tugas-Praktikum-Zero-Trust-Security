/**
 * Zero Trust Policy Engine
 * Memusatkan seluruh evaluasi kebijakan otorisasi keamanan
 * Memeriksa Identitas, Role, Device, Ownership, Status Finalisasi, dan Batasan Jam
 */
const { query } = require('../../shared/database/pool');
const { isWithinOperationalHours } = require('../../shared/utils/time-policy');
const { verifyUserDevice } = require('../middleware/device-check');

/**
 * Evaluasi Permintaan Akses Berdasarkan Prinsip Zero Trust
 * @param {Object} context
 * @param {Object} context.user - Payload JWT pengguna atau service
 * @param {string} [context.deviceId] - Header X-Device-ID
 * @param {string} context.endpoint - Path endpoint (e.g. /nilai, /kelas/1/finalisasi)
 * @param {string} context.method - HTTP method (GET, POST, PUT, etc.)
 * @param {Object} [context.params] - URL parameters (e.g. { id: '1', nim: '2021001' })
 * @param {Object} [context.body] - Request body (e.g. { score: 95 })
 * @param {Date} [context.customDate] - Custom date untuk testing time policy
 * @returns {Promise<{ decision: 'ALLOW'|'DENY', statusCode: number, reason: string }>}
 */
async function evaluatePolicy({
  user,
  deviceId,
  endpoint,
  method,
  params = {},
  body = {},
  customDate = new Date()
}) {
  // 1. Verifikasi Keberadaan Pengguna / Service
  if (!user || !user.sub) {
    return {
      decision: 'DENY',
      statusCode: 401,
      reason: 'Token autentikasi tidak valid atau identitas pengguna (sub) tidak ditemukan'
    };
  }

  const { sub: userId, role, type: tokenType } = user;

  // =========================================================================
  // KEBIJAKAN KHUSUS: SINKRONISASI TRANSKRIP (POST /transkrip/sinkron)
  // =========================================================================
  if (endpoint.startsWith('/transkrip/sinkron') && method === 'POST') {
    // Menolak user access token
    if (tokenType !== 'service' || role !== 'service') {
      return {
        decision: 'DENY',
        statusCode: 403,
        reason: 'Akses ditolak: Endpoint sinkronisasi transkrip hanya dapat diakses oleh Service Nilai menggunakan service token, bukan user token'
      };
    }

    // Memverifikasi identitas service
    if (userId !== 'service-nilai') {
      return {
        decision: 'DENY',
        statusCode: 403,
        reason: `Akses ditolak: Service identitas '${userId}' tidak berhak melakukan sinkronisasi transkrip`
      };
    }

    return {
      decision: 'ALLOW',
      statusCode: 200,
      reason: 'Service token valid dari Service Nilai terverifikasi untuk sinkronisasi'
    };
  }

  // Jika endpoint selain sinkronisasi mencoba menggunakan service token
  if (tokenType === 'service' || role === 'service') {
    return {
      decision: 'DENY',
      statusCode: 403,
      reason: 'Service token tidak diizinkan untuk mengakses resource pengguna umum'
    };
  }

  // =========================================================================
  // ZERO TRUST: VERIFIKASI PERANGKAT TERDAFTAR (UNTUK SELURUH USER REQUEST)
  // =========================================================================
  if (!deviceId) {
    return {
      decision: 'DENY',
      statusCode: 400,
      reason: 'Header X-Device-ID wajib disertakan pada setiap request pengguna'
    };
  }

  const deviceCheck = await verifyUserDevice(userId, deviceId);
  if (!deviceCheck.valid) {
    return {
      decision: 'DENY',
      statusCode: 403,
      reason: `Verifikasi perangkat gagal: ${deviceCheck.reason}`
    };
  }

  // =========================================================================
  // KEBIJAKAN: LIHAT NILAI (GET /nilai)
  // =========================================================================
  if (endpoint === '/nilai' && method === 'GET') {
    if (['student', 'lecturer', 'admin'].includes(role)) {
      return {
        decision: 'ALLOW',
        statusCode: 200,
        reason: `Akses pembacaan nilai diizinkan untuk role '${role}' sesuai filter data kepemilikan`
      };
    }
    return {
      decision: 'DENY',
      statusCode: 403,
      reason: `Role '${role}' tidak memiliki hak untuk melihat nilai`
    };
  }

  // =========================================================================
  // KEBIJAKAN: UBAH NILAI (PUT /nilai/:id)
  // =========================================================================
  if (endpoint.startsWith('/nilai/') && method === 'PUT') {
    // Hanya dosen yang boleh mengubah nilai
    if (role !== 'lecturer') {
      return {
        decision: 'DENY',
        statusCode: 403,
        reason: `Akses ditolak: Hanya dosen pengampu yang berhak mengubah nilai (role Anda: ${role})`
      };
    }

    // Pembatasan Jam Akses (07.00 - 21.00 WIB)
    const timeCheck = isWithinOperationalHours(customDate);
    if (!timeCheck.allowed) {
      return {
        decision: 'DENY',
        statusCode: 403,
        reason: timeCheck.reason
      };
    }

    const gradeId = params.id;
    if (!gradeId) {
      return {
        decision: 'DENY',
        statusCode: 400,
        reason: 'ID nilai tidak valid pada URL'
      };
    }

    // Validasi nilai score
    if (body.score !== undefined) {
      const numScore = Number(body.score);
      if (isNaN(numScore) || numScore < 0 || numScore > 100) {
        return {
          decision: 'DENY',
          statusCode: 400,
          reason: 'Nilai (score) harus berupa angka antara 0 hingga 100'
        };
      }
    } else {
      return {
        decision: 'DENY',
        statusCode: 400,
        reason: 'Field score wajib disertakan dalam request body'
      };
    }

    // Periksa kepemilikan kelas dan status finalisasi di database
    const [gradeRows] = await query(`
      SELECT g.id, g.class_id, g.student_id, c.lecturer_id, c.is_finalized, c.class_name
      FROM \`grades\` g
      JOIN \`classes\` c ON g.class_id = c.id
      WHERE g.id = ?
      LIMIT 1
    `, [gradeId]);

    if (gradeRows.length === 0) {
      return {
        decision: 'DENY',
        statusCode: 404,
        reason: `Data nilai dengan ID ${gradeId} tidak ditemukan`
      };
    }

    const grade = gradeRows[0];

    // Dosen harus merupakan pengampu kelas ini
    if (String(grade.lecturer_id) !== String(userId)) {
      return {
        decision: 'DENY',
        statusCode: 403,
        reason: 'Akses ditolak: Anda bukan dosen pengampu untuk kelas dari nilai ini'
      };
    }

    // Kelas tidak boleh sudah difinalisasi
    if (grade.is_finalized) {
      return {
        decision: 'DENY',
        statusCode: 403,
        reason: 'Perubahan nilai ditolak: Kelas ini sudah difinalisasi dan nilainya bersifat permanen'
      };
    }

    return {
      decision: 'ALLOW',
      statusCode: 200,
      reason: 'Otorisasi perubahan nilai disetujui untuk dosen pengampu dalam jam operasional'
    };
  }

  // =========================================================================
  // KEBIJAKAN: FINALISASI KELAS (POST /kelas/:id/finalisasi)
  // =========================================================================
  if (endpoint.includes('/finalisasi') && method === 'POST') {
    if (role !== 'lecturer') {
      return {
        decision: 'DENY',
        statusCode: 403,
        reason: `Akses ditolak: Hanya dosen pengampu yang berhak memfinalisasi kelas (role Anda: ${role})`
      };
    }

    // Pembatasan Jam Akses (07.00 - 21.00 WIB)
    const timeCheck = isWithinOperationalHours(customDate);
    if (!timeCheck.allowed) {
      return {
        decision: 'DENY',
        statusCode: 403,
        reason: timeCheck.reason
      };
    }

    const classId = params.id;
    if (!classId) {
      return {
        decision: 'DENY',
        statusCode: 400,
        reason: 'ID kelas tidak valid pada URL'
      };
    }

    // Periksa kepemilikan kelas dan status finalisasi di database
    const [classRows] = await query(`
      SELECT id, class_code, class_name, lecturer_id, is_finalized
      FROM \`classes\`
      WHERE id = ?
      LIMIT 1
    `, [classId]);

    if (classRows.length === 0) {
      return {
        decision: 'DENY',
        statusCode: 404,
        reason: `Kelas dengan ID ${classId} tidak ditemukan`
      };
    }

    const classData = classRows[0];

    // Dosen harus merupakan pengampu kelas ini
    if (String(classData.lecturer_id) !== String(userId)) {
      return {
        decision: 'DENY',
        statusCode: 403,
        reason: 'Akses ditolak: Anda bukan dosen pengampu untuk kelas ini'
      };
    }

    // Kelas belum boleh difinalisasi
    if (classData.is_finalized) {
      return {
        decision: 'DENY',
        statusCode: 403,
        reason: 'Akses ditolak: Kelas ini sudah difinalisasi sebelumnya'
      };
    }

    return {
      decision: 'ALLOW',
      statusCode: 200,
      reason: 'Otorisasi finalisasi disetujui untuk dosen pengampu dalam jam operasional'
    };
  }

  // =========================================================================
  // KEBIJAKAN: LIHAT TRANSKRIP (GET /transkrip/:nim)
  // =========================================================================
  if (endpoint.startsWith('/transkrip/') && method === 'GET') {
    const targetNim = params.nim;
    if (!targetNim) {
      return {
        decision: 'DENY',
        statusCode: 400,
        reason: 'NIM mahasiswa wajib disertakan pada URL'
      };
    }

    // 1. Admin diizinkan melihat transkrip siapa pun
    if (role === 'admin') {
      return {
        decision: 'ALLOW',
        statusCode: 200,
        reason: 'Akses transkrip disetujui untuk role Administrator'
      };
    }

    // 2. Mahasiswa hanya boleh melihat transkrip miliknya sendiri
    if (role === 'student') {
      // Ambil NIM mahasiswa dari database jika belum ada di klaim token
      let studentNim = user.nim;
      if (!studentNim) {
        const [userRows] = await query('SELECT nim FROM `users` WHERE id = ? LIMIT 1', [userId]);
        if (userRows.length > 0) studentNim = userRows[0].nim;
      }

      if (String(studentNim) !== String(targetNim)) {
        return {
          decision: 'DENY',
          statusCode: 403,
          reason: `Akses ditolak: Mahasiswa hanya berhak melihat transkrip miliknya sendiri (NIM Anda: ${studentNim}, target: ${targetNim})`
        };
      }

      return {
        decision: 'ALLOW',
        statusCode: 200,
        reason: 'Akses transkrip disetujui untuk mahasiswa pemilik data'
      };
    }

    // 3. Dosen ditolak untuk akses langsung ke transkrip
    if (role === 'lecturer') {
      return {
        decision: 'DENY',
        statusCode: 403,
        reason: 'Akses ditolak: Dosen tidak memiliki hak akses langsung untuk melihat transkrip akademik mahasiswa'
      };
    }

    return {
      decision: 'DENY',
      statusCode: 403,
      reason: `Role '${role}' tidak diizinkan mengakses transkrip`
    };
  }

  // Default Fallback
  return {
    decision: 'ALLOW',
    statusCode: 200,
    reason: 'Endpoint tidak memiliki batasan kebijakan khusus'
  };
}

module.exports = {
  evaluatePolicy
};
