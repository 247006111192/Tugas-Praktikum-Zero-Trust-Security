/**
 * Routes Nilai pada Service Nilai (Port 3001)
 */
const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../../../shared/database/pool');
const { isWithinOperationalHours } = require('../../../shared/utils/time-policy');

/**
 * GET /nilai
 * Menampilkan data nilai berdasarkan prinsip kepemilikan Zero Trust
 */
router.get('/', async (req, res) => {
  const user = req.user;
  const { role, sub: userId } = user;

  try {
    let sql = `
      SELECT 
        g.id AS grade_id,
        g.class_id,
        c.class_code,
        c.class_name,
        c.semester,
        c.academic_year,
        c.is_finalized,
        g.student_id,
        u.name AS student_name,
        u.nim AS student_nim,
        g.score,
        g.updated_at
      FROM \`grades\` g
      JOIN \`classes\` c ON g.class_id = c.id
      JOIN \`users\` u ON g.student_id = u.id
    `;
    const params = [];

    if (role === 'student') {
      // Mahasiswa hanya dapat melihat nilainya sendiri
      sql += ' WHERE g.student_id = ? ORDER BY c.class_code ASC';
      params.push(userId);
    } else if (role === 'lecturer') {
      // Dosen hanya dapat melihat nilai mahasiswa pada kelas yang diampunya
      sql += ' WHERE c.lecturer_id = ? ORDER BY c.class_code ASC, u.nim ASC';
      params.push(userId);
    } else if (role === 'admin') {
      // Admin dapat melihat seluruh nilai
      sql += ' ORDER BY c.class_code ASC, u.nim ASC';
    } else {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Role pengguna tidak memiliki hak untuk melihat data nilai'
        }
      });
    }

    const [rows] = await query(sql, params);

    return res.status(200).json({
      success: true,
      data: rows,
      meta: {
        total: rows.length,
        accessedBy: {
          id: userId,
          role
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: `Gagal mengambil data nilai: ${error.message}`
      }
    });
  }
});

/**
 * PUT /nilai/:id
 * Mengubah nilai mahasiswa oleh dosen pengampu kelas
 */
router.put('/:id', async (req, res) => {
  const user = req.user;
  const gradeId = req.params.id;
  const { score } = req.body;

  // 1. Role Check
  if (user.role !== 'lecturer') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Hanya dosen pengampu yang berhak mengubah nilai'
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

  // 3. Validasi Nilai Score
  if (score === undefined || score === null) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Field score wajib disertakan'
      }
    });
  }

  const numScore = Number(score);
  if (isNaN(numScore) || numScore < 0 || numScore > 100) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_SCORE',
        message: 'Nilai harus berupa angka valid antara 0 hingga 100'
      }
    });
  }

  // 4. Verifikasi dan Update di dalam Database Transaction
  try {
    const updatedGrade = await withTransaction(async (conn) => {
      // Ambil data nilai dan kelas dengan FOR UPDATE untuk mencegah race condition
      const [gradeRows] = await conn.execute(`
        SELECT g.id, g.class_id, g.student_id, g.score, c.lecturer_id, c.is_finalized, c.class_name
        FROM \`grades\` g
        JOIN \`classes\` c ON g.class_id = c.id
        WHERE g.id = ?
        FOR UPDATE
      `, [gradeId]);

      if (gradeRows.length === 0) {
        throw { statusCode: 404, code: 'NOT_FOUND', message: `Data nilai ID ${gradeId} tidak ditemukan` };
      }

      const grade = gradeRows[0];

      // Verifikasi kepemilikan kelas oleh dosen
      if (String(grade.lecturer_id) !== String(user.sub)) {
        throw { statusCode: 403, code: 'FORBIDDEN', message: 'Anda bukan dosen pengampu untuk kelas ini' };
      }

      // Verifikasi status finalisasi
      if (grade.is_finalized) {
        throw { statusCode: 403, code: 'CLASS_FINALIZED', message: 'Nilai tidak dapat diubah karena kelas sudah difinalisasi' };
      }

      // Lakukan pembaruan nilai
      await conn.execute(`
        UPDATE \`grades\`
        SET \`score\` = ?, \`updated_by\` = ?, \`updated_at\` = NOW()
        WHERE \`id\` = ?
      `, [numScore, user.sub, gradeId]);

      // Ambil nilai yang baru diupdate
      const [freshRows] = await conn.execute(`
        SELECT 
          g.id AS grade_id,
          g.class_id,
          c.class_name,
          g.student_id,
          u.name AS student_name,
          u.nim AS student_nim,
          g.score,
          g.updated_at
        FROM \`grades\` g
        JOIN \`classes\` c ON g.class_id = c.id
        JOIN \`users\` u ON g.student_id = u.id
        WHERE g.id = ?
      `, [gradeId]);

      return freshRows[0];
    });

    return res.status(200).json({
      success: true,
      message: 'Nilai mahasiswa berhasil diperbarui',
      data: updatedGrade
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'UPDATE_ERROR',
        message: error.message || 'Gagal memperbarui nilai'
      }
    });
  }
});

module.exports = router;
