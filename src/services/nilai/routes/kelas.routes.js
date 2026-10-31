/**
 * Routes Kelas pada Service Nilai (Port 3001)
 * Menangani finalisasi kelas dan inisiasi sinkronisasi transkrip antar-service
 */
const express = require('express');
const router = express.Router();
const config = require('../../../shared/config/env');
const { query, withTransaction } = require('../../../shared/database/pool');
const { isWithinOperationalHours } = require('../../../shared/utils/time-policy');

/**
 * GET /kelas
 * Melihat daftar kelas berdasarkan role
 */
router.get('/', async (req, res) => {
  const { role, sub: userId } = req.user;

  try {
    let sql = `
      SELECT 
        c.id,
        c.class_code,
        c.class_name,
        c.semester,
        c.academic_year,
        c.is_finalized,
        c.finalized_at,
        u.name AS lecturer_name,
        u.email AS lecturer_email
      FROM \`classes\` c
      JOIN \`users\` u ON c.lecturer_id = u.id
    `;
    const params = [];

    if (role === 'lecturer') {
      sql += ' WHERE c.lecturer_id = ?';
      params.push(userId);
    } else if (role === 'student') {
      sql += `
        WHERE c.id IN (
          SELECT class_id FROM \`enrollments\` WHERE student_id = ?
        )
      `;
      params.push(userId);
    }

    sql += ' ORDER BY c.class_code ASC';

    const [rows] = await query(sql, params);
    return res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * POST /kelas/:id/finalisasi
 * Finalisasi nilai kelas oleh dosen pengampu dan memicu sinkronisasi transkrip
 */
router.post('/:id/finalisasi', async (req, res) => {
  const user = req.user;
  const classId = req.params.id;

  // 1. Role Check
  if (user.role !== 'lecturer') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Hanya dosen pengampu yang berhak melakukan finalisasi nilai kelas'
      }
    });
  }

  // 2. Pembatasan Jam Akses (07.00 - 21.00 WIB)
  const testTime = req.headers['x-test-time-override'] ? new Date(req.headers['x-test-time-override']) : (req.customDate || new Date());
  const timeCheck = isWithinOperationalHours(testTime);
  if (!timeCheck.allowed) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'OUTSIDE_OPERATIONAL_HOURS',
        message: timeCheck.reason
      }
    });
  }

  // 3. Database Transaction: Perbarui Status Finalisasi Kelas
  let finalizedClass;
  let gradesToSync = [];

  try {
    const txResult = await withTransaction(async (conn) => {
      // Kunci data kelas
      const [classRows] = await conn.execute(`
        SELECT id, class_code, class_name, lecturer_id, is_finalized
        FROM \`classes\`
        WHERE id = ?
        FOR UPDATE
      `, [classId]);

      if (classRows.length === 0) {
        throw { statusCode: 404, code: 'NOT_FOUND', message: `Kelas dengan ID ${classId} tidak ditemukan` };
      }

      const targetClass = classRows[0];

      // Verifikasi kepemilikan kelas oleh dosen
      if (String(targetClass.lecturer_id) !== String(user.sub)) {
        throw { statusCode: 403, code: 'FORBIDDEN', message: 'Anda bukan dosen pengampu untuk kelas ini' };
      }

      // Pastikan kelas belum difinalisasi
      if (targetClass.is_finalized) {
        throw { statusCode: 403, code: 'ALREADY_FINALIZED', message: 'Kelas ini sudah difinalisasi sebelumnya' };
      }

      // Ubah status kelas menjadi finalized
      await conn.execute(`
        UPDATE \`classes\`
        SET \`is_finalized\` = 1, \`finalized_at\` = NOW(), \`finalized_by\` = ?
        WHERE \`id\` = ?
      `, [user.sub, classId]);

      // Ambil seluruh data nilai kelas untuk disinkronkan ke Service Transkrip
      const [grades] = await conn.execute(`
        SELECT 
          id AS source_grade_id,
          student_id,
          class_id,
          score
        FROM \`grades\`
        WHERE class_id = ?
      `, [classId]);

      return {
        classData: {
          id: targetClass.id,
          classCode: targetClass.class_code,
          className: targetClass.class_name,
          isFinalized: true
        },
        grades
      };
    });

    finalizedClass = txResult.classData;
    gradesToSync = txResult.grades;
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'FINALIZATION_ERROR',
        message: error.message || 'Gagal memproses finalisasi kelas'
      }
    });
  }

  // 4. Zero Trust Service-to-Service: Minta Service Token dari API Gateway
  let serviceToken;
  try {
    const tokenResponse = await fetch(`${config.services.gatewayUrl}/auth/service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: config.services.serviceNilaiClientId,
        clientSecret: config.services.serviceNilaiClientSecret
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.data || !tokenData.data.serviceToken) {
      throw new Error(tokenData.error?.message || 'Gagal mendapatkan service token');
    }

    serviceToken = tokenData.data.serviceToken;
  } catch (err) {
    console.error(`[SERVICE_AUTH_ERROR] ${err.message}`);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVICE_AUTH_FAILED',
        message: `Finalisasi berhasil disimpan di database lokal, namun autentikasi antar-service gagal: ${err.message}`,
        class: finalizedClass
      }
    });
  }

  // 5. Kirim sinkronisasi ke Service Transkrip melalui API Gateway
  let syncResult;
  try {
    const syncResponse = await fetch(`${config.services.gatewayUrl}/transkrip/sinkron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceToken}`
      },
      body: JSON.stringify({
        classId: finalizedClass.id,
        items: gradesToSync
      })
    });

    const syncData = await syncResponse.json();
    if (!syncResponse.ok) {
      throw new Error(syncData.error?.message || 'Gagal menyinkronkan data ke Service Transkrip');
    }

    syncResult = syncData;
  } catch (err) {
    console.error(`[SYNC_ERROR] ${err.message}`);
    return res.status(500).json({
      success: false,
      error: {
        code: 'TRANSCRIPT_SYNC_FAILED',
        message: `Finalisasi nilai kelas berhasil, namun sinkronisasi ke Service Transkrip mengalami kendala: ${err.message}`,
        class: finalizedClass
      }
    });
  }

  // 6. Kembalikan response lengkap
  return res.status(200).json({
    success: true,
    message: 'Kelas berhasil difinalisasi dan nilai telah disinkronkan ke Service Transkrip',
    data: {
      class: finalizedClass,
      totalGradesSynced: gradesToSync.length,
      syncResult: syncResult.data || syncResult
    }
  });
});

module.exports = router;
