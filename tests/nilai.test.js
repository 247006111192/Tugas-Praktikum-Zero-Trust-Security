/**
 * Test Suite: Layanan Nilai Akademik (Service Nilai & Policy Engine)
 */
const request = require('supertest');
const {
  gatewayApp,
  resetDatabase,
  startInternalServers,
  stopAll
} = require('./helpers');
const { generateAccessToken } = require('../src/shared/auth/jwt');
const { query } = require('../src/shared/database/pool');

describe('C. Layanan Nilai dan Otorisasi (Zero Trust Grade Access)', () => {
  let mhs1Token;
  let mhs2Token;
  let dosen1Token;
  let dosen2Token;

  beforeAll(async () => {
    await resetDatabase();
    await startInternalServers();

    // Mahasiswa 1: Ahmad Fauzi (id: 4)
    mhs1Token = generateAccessToken({
      id: 4,
      email: 'mhs1@kampus.ac.id',
      role: 'student',
      name: 'Ahmad Fauzi',
      nim: '2021001'
    });

    // Mahasiswa 2: Bunga Citra (id: 5)
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
  });

  afterAll(async () => {
    await stopAll();
  });

  // 1. Mahasiswa dapat melihat nilai sendiri
  it('1. Mahasiswa dapat melihat nilai miliknya sendiri (200 OK)', async () => {
    const res = await request(gatewayApp)
      .get('/nilai')
      .set('Authorization', `Bearer ${mhs1Token}`)
      .set('X-Device-ID', 'DEV-MHS-01');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Seluruh item nilai yang kembali harus milik student_id = 4
    for (const item of res.body.data) {
      expect(item.student_id).toBe(4);
    }
  });

  // 2. Mahasiswa tidak dapat melihat nilai mahasiswa lain
  it('2. Mahasiswa tidak dapat melihat nilai mahasiswa lain meskipun mengubah query param (200 OK, terfilter aman)', async () => {
    // Mahasiswa 1 mencoba meminta data Mahasiswa 2 (id: 5) lewat query param
    const res = await request(gatewayApp)
      .get('/nilai?student_id=5')
      .set('Authorization', `Bearer ${mhs1Token}`)
      .set('X-Device-ID', 'DEV-MHS-01');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const item of res.body.data) {
      // Backend tetap hanya mengembalikan data Ahmad Fauzi (id: 4)
      expect(item.student_id).toBe(4);
    }
  });

  // 3. Dosen dapat melihat nilai kelas yang diampunya
  it('3. Dosen dapat melihat nilai mahasiswa pada kelas yang diampunya (200 OK)', async () => {
    // Dosen 1 mengampu kelas 1 (TIF-301)
    const res = await request(gatewayApp)
      .get('/nilai')
      .set('Authorization', `Bearer ${dosen1Token}`)
      .set('X-Device-ID', 'DEV-DOSEN-01');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const item of res.body.data) {
      expect(item.class_id).toBe(1);
    }
  });

  // 4. Dosen tidak dapat mengubah nilai kelas dosen lain
  it('4. Dosen tidak dapat mengubah nilai kelas dosen lain (403 Forbidden)', async () => {
    // Nilai ID 3 adalah milik Kelas 2 (diampu oleh Dosen 2, Dr. Siti)
    // Dosen 1 (Dr. Budi) mencoba mengubahnya
    const res = await request(gatewayApp)
      .put('/nilai/3')
      .set('Authorization', `Bearer ${dosen1Token}`)
      .set('X-Device-ID', 'DEV-DOSEN-01')
      .send({ score: 99.0 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/bukan dosen pengampu/i);
  });

  // 5. Mahasiswa tidak dapat mengubah nilai
  it('5. Mahasiswa tidak dapat mengubah nilai (403 Forbidden)', async () => {
    const res = await request(gatewayApp)
      .put('/nilai/1')
      .set('Authorization', `Bearer ${mhs1Token}`)
      .set('X-Device-ID', 'DEV-MHS-01')
      .send({ score: 100 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // 6. Perubahan nilai yang valid dalam jam akses berhasil
  it('6. Perubahan nilai yang valid dalam jam akses berhasil (200 OK)', async () => {
    // Dosen 1 mengubah nilai ID 1 (milik Kelas 1 yang diampunya)
    // Simulasi jam 10:00 WIB (dalam jam akses 07:00-21:00)
    const insideHoursDate = '2026-10-29T10:00:00+07:00';

    const res = await request(gatewayApp)
      .put('/nilai/1')
      .set('Authorization', `Bearer ${dosen1Token}`)
      .set('X-Device-ID', 'DEV-DOSEN-01')
      .set('X-Test-Time-Override', insideHoursDate)
      .send({ score: 88.5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.data.score)).toBe(88.5);
  });

  // 7. Perubahan nilai di luar jam akses ditolak
  it('7. Perubahan nilai di luar jam akses ditolak (403 Forbidden)', async () => {
    // Simulasi jam 23:30 WIB (di luar jam akses 07:00 - 21:00)
    const outsideHoursDate = '2026-10-29T23:30:00+07:00';

    const res = await request(gatewayApp)
      .put('/nilai/1')
      .set('Authorization', `Bearer ${dosen1Token}`)
      .set('X-Device-ID', 'DEV-DOSEN-01')
      .set('X-Test-Time-Override', outsideHoursDate)
      .send({ score: 95.0 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/luar jam operasional/i);
  });

  // 8. Perubahan nilai setelah finalisasi ditolak
  it('8. Perubahan nilai setelah kelas difinalisasi ditolak (403 Forbidden)', async () => {
    // Set status kelas 1 menjadi difinalisasi di database
    await query('UPDATE `classes` SET `is_finalized` = 1, `finalized_at` = NOW() WHERE `id` = 1');

    const res = await request(gatewayApp)
      .put('/nilai/1')
      .set('Authorization', `Bearer ${dosen1Token}`)
      .set('X-Device-ID', 'DEV-DOSEN-01')
      .send({ score: 90.0 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/sudah difinalisasi/i);

    // Kembalikan status kelas 1 agar tidak mengganggu test berikutnya
    await query('UPDATE `classes` SET `is_finalized` = 0, `finalized_at` = NULL WHERE `id` = 1');
  });
});
