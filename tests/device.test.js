/**
 * Test Suite: Device Security (Zero Trust Device Verification)
 */
const request = require('supertest');
const { gatewayApp, resetDatabase, closePool } = require('./helpers');
const { generateAccessToken } = require('../src/shared/auth/jwt');

describe('B. Keamanan Perangkat (Device Security)', () => {
  let mhs1Token;
  let mhs2Token;
  let dosen1Token;

  beforeAll(async () => {
    await resetDatabase();

    // Buat token untuk Mahasiswa 1 (id: 4, nim: 2021001)
    mhs1Token = generateAccessToken({
      id: 4,
      email: 'mhs1@kampus.ac.id',
      role: 'student',
      name: 'Ahmad Fauzi',
      nim: '2021001'
    });

    // Buat token untuk Mahasiswa 2 (id: 5, nim: 2021002)
    mhs2Token = generateAccessToken({
      id: 5,
      email: 'mhs2@kampus.ac.id',
      role: 'student',
      name: 'Bunga Citra',
      nim: '2021002'
    });

    // Buat token untuk Dosen 1 (id: 2)
    dosen1Token = generateAccessToken({
      id: 2,
      email: 'dosen1@kampus.ac.id',
      role: 'lecturer',
      name: 'Dr. Budi Santoso, M.Kom.'
    });
  });

  afterAll(async () => {
    await resetDatabase();
    await require('../src/shared/database/pool').closePool();
  });

  // 1. Device terdaftar dapat digunakan oleh pemiliknya
  it('1. Device terdaftar dapat digunakan oleh pemiliknya (200 OK / lolos verifikasi perangkat)', async () => {
    // Ahmad Fauzi memiliki device DEV-MHS-01
    const res = await request(gatewayApp)
      .get('/transkrip/2021001')
      .set('Authorization', `Bearer ${mhs1Token}`)
      .set('X-Device-ID', 'DEV-MHS-01');

    // Endpoint policy mengevaluasi device valid
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(400);
  });

  // 2. Device milik user lain ditolak
  it('2. Device milik user lain ditolak (403 Forbidden)', async () => {
    // Ahmad Fauzi (mhs1) mencoba memakai device Bunga Citra (DEV-MHS-02)
    const res = await request(gatewayApp)
      .get('/transkrip/2021001')
      .set('Authorization', `Bearer ${mhs1Token}`)
      .set('X-Device-ID', 'DEV-MHS-02');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/tidak terdaftar untuk identitas pengguna ini/i);
  });

  // 3. Device yang dinonaktifkan ditolak
  it('3. Device yang dinonaktifkan ditolak (403 Forbidden)', async () => {
    // Ahmad Fauzi mencoba memakai perangkat lamanya yang dinonaktifkan (DEV-MHS-REVOKED)
    const res = await request(gatewayApp)
      .get('/transkrip/2021001')
      .set('Authorization', `Bearer ${mhs1Token}`)
      .set('X-Device-ID', 'DEV-MHS-REVOKED');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/status dinonaktifkan/i);
  });

  // 4. Request tanpa device ID ditolak sesuai kebijakan
  it('4. Request tanpa device ID ditolak (400 Bad Request)', async () => {
    const res = await request(gatewayApp)
      .get('/transkrip/2021001')
      .set('Authorization', `Bearer ${mhs1Token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/X-Device-ID/i);
  });
});
