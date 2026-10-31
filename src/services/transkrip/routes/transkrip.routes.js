/**
 * Routes Transkrip pada Service Transkrip (Port 3002)
 * GET /transkrip/:nim dan POST /transkrip/sinkron
 */
const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../../../shared/database/pool');

/**
 * Helper: Konversi nilai angka ke huruf mutu dan bobot IP
 */
function calculateGradeLetter(score) {
  const num = Number(score);
  if (num >= 85) return { letter: 'A', point: 4.0 };
  if (num >= 80) return { letter: 'A-', point: 3.7 };
  if (num >= 75) return { letter: 'B+', point: 3.3 };
  if (num >= 70) return { letter: 'B', point: 3.0 };
  if (num >= 65) return { letter: 'B-', point: 2.7 };
  if (num >= 60) return { letter: 'C+', point: 2.3 };
  if (num >= 55) return { letter: 'C', point: 2.0 };
  if (num >= 40) return { letter: 'D', point: 1.0 };
  return { letter: 'E', point: 0.0 };
}

/**
 * GET /transkrip/:nim
 * Melihat transkrip akademik berdasarkan NIM mahasiswa
 * Zero Trust: Mahasiswa hanya melihat milik sendiri, Admin boleh melihat siapa pun, Dosen ditolak
 */
router.get('/:nim', async (req, res) => {
  const { nim } = req.params;
  const user = req.user;

  // 1. Dosen ditolak mengakses transkrip
  if (user.role === 'lecturer') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Akses ditolak: Dosen tidak memiliki hak akses langsung ke transkrip akademik mahasiswa'
      }
    });
  }

  // 2. Mahasiswa hanya boleh melihat transkrip miliknya sendiri
  if (user.role === 'student') {
    let studentNim = user.nim;
    if (!studentNim) {
      const [userRows] = await query('SELECT nim FROM `users` WHERE id = ? LIMIT 1', [user.sub]);
      if (userRows.length > 0) studentNim = userRows[0].nim;
    }

    if (String(studentNim) !== String(nim)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Akses ditolak: Anda hanya berhak mengakses transkrip milik Anda sendiri (NIM: ${studentNim})`
        }
      });
    }
  }

  // 3. Ambil data transkrip dari database
  try {
    const [studentRows] = await query('SELECT id, name, nim, email FROM `users` WHERE `nim` = ? LIMIT 1', [nim]);
    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'STUDENT_NOT_FOUND',
          message: `Mahasiswa dengan NIM ${nim} tidak ditemukan`
        }
      });
    }

    const student = studentRows[0];

    const [transcripts] = await query(`
      SELECT 
        t.id AS transcript_id,
        t.class_id,
        c.class_code,
        c.class_name,
        c.semester,
        c.academic_year,
        t.score,
        t.synced_at
      FROM \`transcripts\` t
      JOIN \`classes\` c ON t.class_id = c.id
      WHERE t.student_id = ?
      ORDER BY c.academic_year DESC, c.semester DESC, c.class_code ASC
    `, [student.id]);

    // Hitung ringkasan akademik
    let totalPoints = 0;
    const items = transcripts.map(item => {
      const { letter, point } = calculateGradeLetter(item.score);
      totalPoints += point;
      return {
        ...item,
        gradeLetter: letter,
        gradePoint: point
      };
    });

    const gpa = items.length > 0 ? (totalPoints / items.length).toFixed(2) : '0.00';

    return res.status(200).json({
      success: true,
      data: {
        student: {
          id: student.id,
          name: student.name,
          nim: student.nim
        },
        summary: {
          totalCourses: items.length,
          gpa: parseFloat(gpa)
        },
        transcripts: items
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: `Gagal mengambil transkrip: ${error.message}`
      }
    });
  }
});

/**
 * POST /transkrip/sinkron
 * Endpoint sinkronisasi transkrip oleh Service Nilai
 * Hanya diizinkan untuk Service Token yang valid (User Token Ditolak!)
 */
router.post('/sinkron', async (req, res) => {
  const user = req.user;

  // 1. Verifikasi tipe token: Wajib Service Token
  if (user.type !== 'service' || user.role !== 'service') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Akses ditolak: User access token ditolak pada endpoint sinkronisasi. Hanya Service Token yang diizinkan.'
      }
    });
  }

  // 2. Verifikasi identitas client service
  if (user.sub !== 'service-nilai') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: `Akses ditolak: Service ${user.sub} tidak memiliki wewenang menyinkronkan transkrip`
      }
    });
  }

  const { classId, items } = req.body;

  if (!classId || !Array.isArray(items)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Format payload tidak valid. Field classId dan array items wajib disertakan.'
      }
    });
  }

  // 3. Eksekusi Sinkronisasi Idempoten di dalam Database Transaction
  try {
    const upsertCount = await withTransaction(async (conn) => {
      let count = 0;
      for (const item of items) {
        const { student_id, score, source_grade_id } = item;
        if (!student_id || score === undefined || !source_grade_id) continue;

        // Upsert idempoten menggunakan ON DUPLICATE KEY UPDATE
        await conn.execute(`
          INSERT INTO \`transcripts\` 
            (\`student_id\`, \`class_id\`, \`score\`, \`source_grade_id\`, \`synced_at\`)
          VALUES 
            (?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            \`score\` = VALUES(\`score\`),
            \`source_grade_id\` = VALUES(\`source_grade_id\`),
            \`synced_at\` = NOW()
        `, [student_id, classId, score, source_grade_id]);

        count++;
      }
      return count;
    });

    return res.status(200).json({
      success: true,
      message: 'Sinkronisasi transkrip akademik berhasil dieksekusi secara idempoten',
      data: {
        classId,
        syncedRecords: upsertCount,
        syncedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_EXECUTION_ERROR',
        message: `Gagal mengeksekusi sinkronisasi transkrip: ${error.message}`
      }
    });
  }
});

module.exports = router;
