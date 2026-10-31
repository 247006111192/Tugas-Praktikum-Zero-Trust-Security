/**
 * Test Suite: Finalisasi Kelas & Layanan Transkrip (Service Transkrip)
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const {
  gatewayApp,
  transkripApp,
  resetDatabase,
  startInternalServers,
  stopAll
} = require('./helpers');
const config = require('../src/shared/config/env');
const { generateAccessToken, generateServiceToken } = require('../src/shared/auth/jwt');
const { query } = require('../src/shared/database/pool');

describe('D. Finalisasi Kelas dan Layanan Transkrip Akademik', () => {
  let mhs1Token;
  let mhs2Token;
  let dosen1Token;
  let dosen2Token;
  let adminToken;
  let serviceNilaiToken;

  beforeAll(async () => {
    await resetDatabase();
    await startInternalServers();

    // Mahasiswa 1: Ahmad Fauzi (NIM: 2021001, id: 4)
    mhs1Token = generateAccessToken({
      id: 4,
      email: 'mhs1@kampus.ac.id',
      role: 'student',
      name: 'Ahmad Fauzi',
      nim: '2021001'
    });

    // Mahasiswa 2: Bunga Citra (NIM: 2021002, id: 5)
    mhs2Token = generateAccessToken({
      id: 5,
      email: 'mhs2@kampus.ac.id',
      role: 'student',
      name: 'Bunga Citra',
      nim: '2021002'
    });

    // Dosen 1: Dr. Budi Santoso (id: 2, Pengampu Kelas 1: TIF-301)
    dosen1Token = generateAccessToken({
      id: 2,
      email: 'dosen1@kampus.ac.id',
      role: 'lecturer',
      name: 'Dr. Budi Santoso, M.Kom.'
    });

    // Dosen 2: Dr. Siti Aminah (id: 3, Pengampu Kelas 2: TIF-302)
    dosen2Token = generateAccessToken({
      id: 3,
      email: 'dosen2@kampus.ac.id',
      role: 'lecturer',
      name: 'Dr. Siti Aminah, M.T.'
    });

    // Admin (id: 1)
    adminToken = generateAccessToken({
      id: 1,
      email: 'admin@kampus.ac.id',
      role: 'admin',
      name: 'Administrator Akademik'
    });

    // Service Nilai Token
    serviceNilaiToken = generateServiceToken('service-nilai');
  });

  afterAll(async () => {
    await stopAll();
  });

  // 1. Dosen yang bukan pengampu ditolak saat memfinalisasi kelas
  it('1. Dosen yang bukan pengampu ditolak saat finalisasi kelas (403 Forbidden)', async () => {
    // Dosen 2 (Dr. Siti) mencoba memfinalisasi Kelas 1 (milik Dr. Budi)
    const res = await request(gatewayApp)
      .post('/kelas/1/finalisasi')
      .set('Authorization', `Bearer ${dosen2Token}`)
      .set('X-Device-ID', 'DEV-DOSEN-02');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/bukan dosen pengampu/i);
  });

  // 2. Finalisasi di luar jam akses ditolak
  it('2. Finalisasi kelas di luar jam akses ditolak (403 Forbidden)', async () => {
    const outsideHours = '2026-10-29T02:00:00+07:00'; // Jam 02:00 WIB (luar operasional)

    const res = await request(gatewayApp)
      .post('/kelas/1/finalisasi')
      .set('Authorization', `Bearer ${dosen1Token}`)
      .set('X-Device-ID', 'DEV-DOSEN-01')
      .set('X-Test-Time-Override', outsideHours);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/luar jam operasional/i);
  });

  // 3. Dosen pengampu dapat memfinalisasi kelas dalam jam akses & tersinkron ke transkrip
  it('3. Dosen pengampu dapat memfinalisasi kelas dalam jam akses & nilai tersinkron (200 OK)', async () => {
    const insideHours = '2026-10-29T14:00:00+07:00'; // Jam 14:00 WIB

    const res = await request(gatewayApp)
      .post('/kelas/1/finalisasi')
      .set('Authorization', `Bearer ${dosen1Token}`)
      .set('X-Device-ID', 'DEV-DOSEN-01')
      .set('X-Test-Time-Override', insideHours);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.class.isFinalized).toBe(true);

    // Verifikasi data kelas di database
    const [classRows] = await query('SELECT is_finalized, finalized_by FROM `classes` WHERE id = 1');
    expect(classRows[0].is_finalized).toBe(1);
    expect(classRows[0].finalized_by).toBe(2);

    // Verifikasi bahwa nilai kelas 1 sudah masuk ke tabel transcripts
    const [transRows] = await query('SELECT * FROM `transcripts` WHERE class_id = 1');
    expect(transRows.length).toBeGreaterThan(0);
  });

  // 4. Mahasiswa hanya dapat melihat transkrip sendiri
  it('4. Mahasiswa hanya dapat melihat transkrip miliknya sendiri (200 OK)', async () => {
    // Ahmad Fauzi (NIM: 2021001) melihat transkrip 2021001
    const res = await request(gatewayApp)
      .get('/transkrip/2021001')
      .set('Authorization', `Bearer ${mhs1Token}`)
      .set('X-Device-ID', 'DEV-MHS-01');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.student.nim).toBe('2021001');
  });

  // 5. Mahasiswa ditolak saat mencoba melihat transkrip mahasiswa lain
  it('5. Mahasiswa ditolak saat mencoba melihat transkrip mahasiswa lain (403 Forbidden)', async () => {
    // Ahmad Fauzi (NIM: 2021001) mencoba melihat transkrip Bunga Citra (NIM: 2021002)
    const res = await request(gatewayApp)
      .get('/transkrip/2021002')
      .set('Authorization', `Bearer ${mhs1Token}`)
      .set('X-Device-ID', 'DEV-MHS-01');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/hanya berhak melihat transkrip miliknya sendiri/i);
  });

  // 6. Admin dapat melihat transkrip mahasiswa mana pun
  it('6. Admin dapat melihat transkrip mahasiswa mana pun (200 OK)', async () => {
    const res = await request(gatewayApp)
      .get('/transkrip/2021001')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Device-ID', 'DEV-ADMIN-01');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.student.nim).toBe('2021001');
  });

  // 7. User token ditolak pada endpoint sinkronisasi
  it('7. User access token ditolak pada endpoint sinkronisasi (403 Forbidden)', async () => {
    // Admin mencoba mengirim sinkronisasi menggunakan user access token
    const res = await request(gatewayApp)
      .post('/transkrip/sinkron')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Device-ID', 'DEV-ADMIN-01')
      .send({
        classId: 1,
        items: [{ student_id: 4, score: 90, source_grade_id: 1 }]
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/service token.*bukan user token|hanya dapat diakses oleh Service Nilai/i);
  });

  // 8. Service token valid dari Service Nilai diizinkan
  it('8. Service token valid dari Service Nilai diizinkan (200 OK)', async () => {
    const res = await request(gatewayApp)
      .post('/transkrip/sinkron')
      .set('Authorization', `Bearer ${serviceNilaiToken}`)
      .send({
        classId: 1,
        items: [{ student_id: 4, score: 95.0, source_grade_id: 1 }]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // 9. Token service yang kedaluwarsa ditolak
  it('9. Token service yang kedaluwarsa ditolak (401 Unauthorized)', async () => {
    const expiredServiceToken = jwt.sign(
      { sub: 'service-nilai', role: 'service', type: 'service' },
      config.jwt.serviceSecret,
      { expiresIn: '-1s' }
    );

    const res = await request(gatewayApp)
      .post('/transkrip/sinkron')
      .set('Authorization', `Bearer ${expiredServiceToken}`)
      .send({
        classId: 1,
        items: []
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 10. Request langsung ke service internal tanpa gateway secret ditolak
  it('10. Request langsung ke Service Transkrip tanpa Gateway Secret ditolak (403 Forbidden)', async () => {
    // Mengakses port internal 3002 secara langsung tanpa X-Gateway-Secret
    const res = await request(transkripApp)
      .get('/transkrip/2021001')
      .set('Authorization', `Bearer ${mhs1Token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_GATEWAY_SECRET');
  });
});
