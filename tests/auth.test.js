/**
 * Test Suite: Autentikasi dan Token (Zero Trust Security)
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { gatewayApp, resetDatabase, closePool } = require('./helpers');
const config = require('../src/shared/config/env');
const { hashToken } = require('../src/shared/auth/jwt');
const { query } = require('../src/shared/database/pool');

describe('A. Autentikasi dan Manajemen Token', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await require('../src/shared/database/pool').closePool();
  });

  // 1. Login dengan kredensial valid dan perangkat terdaftar berhasil
  it('1. Login dengan kredensial valid dan perangkat terdaftar berhasil (200 OK)', async () => {
    const res = await request(gatewayApp)
      .post('/auth/login')
      .set('X-Device-ID', 'DEV-DOSEN-01')
      .send({
        email: 'dosen1@kampus.ac.id',
        password: 'Password123!'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens).toHaveProperty('accessToken');
    expect(res.body.data.tokens).toHaveProperty('refreshToken');
    expect(res.body.data.user.email).toBe('dosen1@kampus.ac.id');
    expect(res.body.data.device.id).toBe('DEV-DOSEN-01');
  });

  // 2. Login dengan password salah ditolak
  it('2. Login dengan password salah ditolak (401 Unauthorized)', async () => {
    const res = await request(gatewayApp)
      .post('/auth/login')
      .set('X-Device-ID', 'DEV-DOSEN-01')
      .send({
        email: 'dosen1@kampus.ac.id',
        password: 'WrongPassword!'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 3. Login dengan akun nonaktif ditolak
  it('3. Login dengan akun nonaktif ditolak (403 Forbidden)', async () => {
    const res = await request(gatewayApp)
      .post('/auth/login')
      .set('X-Device-ID', 'DEV-INACTIVE-01')
      .send({
        email: 'inactive@kampus.ac.id',
        password: 'Password123!'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // 4. Login tanpa X-Device-ID ditolak
  it('4. Login tanpa X-Device-ID ditolak (400 Bad Request)', async () => {
    const res = await request(gatewayApp)
      .post('/auth/login')
      .send({
        email: 'dosen1@kampus.ac.id',
        password: 'Password123!'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 5. Login menggunakan device yang tidak terdaftar ditolak
  it('5. Login menggunakan device yang tidak terdaftar ditolak (403 Forbidden)', async () => {
    const res = await request(gatewayApp)
      .post('/auth/login')
      .set('X-Device-ID', 'DEV-UNREGISTERED-XYZ')
      .send({
        email: 'dosen1@kampus.ac.id',
        password: 'Password123!'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // 6. Access token kedaluwarsa ditolak
  it('6. Access token kedaluwarsa ditolak (401 Unauthorized)', async () => {
    // Generate expired access token secara manual
    const expiredToken = jwt.sign(
      { sub: '2', role: 'lecturer', type: 'access' },
      config.jwt.accessSecret,
      { expiresIn: '-1s' }
    );

    const res = await request(gatewayApp)
      .get('/nilai')
      .set('Authorization', `Bearer ${expiredToken}`)
      .set('X-Device-ID', 'DEV-DOSEN-01');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 7. Refresh token valid berhasil
  it('7. Refresh token valid berhasil menghasilkan token baru (200 OK)', async () => {
    // Login terlebih dahulu untuk mendapatkan token asli
    const loginRes = await request(gatewayApp)
      .post('/auth/login')
      .set('X-Device-ID', 'DEV-DOSEN-01')
      .send({
        email: 'dosen1@kampus.ac.id',
        password: 'Password123!'
      });

    const refreshToken = loginRes.body.data.tokens.refreshToken;

    const refreshRes = await request(gatewayApp)
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data).toHaveProperty('accessToken');
    expect(refreshRes.body.data).toHaveProperty('refreshToken');
  });

  // 8. Refresh token kedaluwarsa ditolak
  it('8. Refresh token kedaluwarsa ditolak (401 Unauthorized)', async () => {
    const expiredRefresh = jwt.sign(
      { sub: '2', role: 'lecturer', type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: '-1s' }
    );

    const res = await request(gatewayApp)
      .post('/auth/refresh')
      .send({ refreshToken: expiredRefresh });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 9. Refresh token yang dicabut ditolak
  it('9. Refresh token yang telah dicabut ditolak (401 Unauthorized)', async () => {
    // Login
    const loginRes = await request(gatewayApp)
      .post('/auth/login')
      .set('X-Device-ID', 'DEV-DOSEN-01')
      .send({
        email: 'dosen1@kampus.ac.id',
        password: 'Password123!'
      });

    const refreshToken = loginRes.body.data.tokens.refreshToken;

    // Logout untuk mencabut token
    await request(gatewayApp)
      .post('/auth/logout')
      .send({ refreshToken });

    // Coba gunakan kembali token yang sudah dicabut
    const res = await request(gatewayApp)
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 10. Refresh token lama tidak dapat digunakan kembali setelah rotation
  it('10. Refresh token lama tidak dapat digunakan kembali setelah rotation (401 Unauthorized)', async () => {
    const loginRes = await request(gatewayApp)
      .post('/auth/login')
      .set('X-Device-ID', 'DEV-DOSEN-01')
      .send({
        email: 'dosen1@kampus.ac.id',
        password: 'Password123!'
      });

    const oldRefreshToken = loginRes.body.data.tokens.refreshToken;

    // Lakukan rotasi pertama
    const rotate1 = await request(gatewayApp)
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken });

    expect(rotate1.status).toBe(200);

    // Coba gunakan kembali refresh token lama
    const reuseAttempt = await request(gatewayApp)
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken });

    expect(reuseAttempt.status).toBe(401);
    expect(reuseAttempt.body.success).toBe(false);
  });

  // 11. Logout mencabut refresh token
  it('11. Logout berhasil mencabut refresh token (200 OK)', async () => {
    const loginRes = await request(gatewayApp)
      .post('/auth/login')
      .set('X-Device-ID', 'DEV-MHS-01')
      .send({
        email: 'mhs1@kampus.ac.id',
        password: 'Password123!'
      });

    const refreshToken = loginRes.body.data.tokens.refreshToken;

    const logoutRes = await request(gatewayApp)
      .post('/auth/logout')
      .send({ refreshToken });

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Verifikasi di database bahwa revoked_at terisi
    const tokenHash = hashToken(refreshToken);
    const [rows] = await query('SELECT revoked_at FROM `refresh_tokens` WHERE token_hash = ?', [tokenHash]);
    expect(rows[0].revoked_at).not.toBeNull();
  });
});
