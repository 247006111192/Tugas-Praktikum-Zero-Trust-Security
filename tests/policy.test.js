/**
 * Test Suite: Policy Engine, Audit Logging & Ketahanan Sistem
 */
const request = require('supertest');
const {
  gatewayApp,
  resetDatabase,
  startInternalServers,
  stopAll
} = require('./helpers');
const { generateAccessToken, generateServiceToken } = require('../src/shared/auth/jwt');
const { query } = require('../src/shared/database/pool');
const config = require('../src/shared/config/env');

describe('E. Audit Logging, Kebijakan, dan Ketahanan Sistem (Resilience)', () => {
  let mhs1Token;
  let serviceNilaiToken;

  beforeAll(async () => {
    await resetDatabase();
    await startInternalServers();

    mhs1Token = generateAccessToken({
      id: 4,
      email: 'mhs1@kampus.ac.id',
      role: 'student',
      name: 'Ahmad Fauzi',
      nim: '2021001'
    });

    serviceNilaiToken = generateServiceToken('service-nilai');
  });

  afterAll(async () => {
    await stopAll();
  });

  // 1. Keputusan ALLOW tercatat di audit_logs
  it('1. Keputusan ALLOW tercatat di tabel audit_logs', async () => {
    // Lakukan request yang diizinkan
    await request(gatewayApp)
      .get('/nilai')
      .set('Authorization', `Bearer ${mhs1Token}`)
      .set('X-Device-ID', 'DEV-MHS-01');

    const [logs] = await query(
      "SELECT * FROM `audit_logs` WHERE `decision` = 'ALLOW' AND `endpoint` = '/nilai' ORDER BY id DESC LIMIT 1"
    );

    expect(logs.length).toBe(1);
    expect(logs[0].decision).toBe('ALLOW');
    expect(logs[0].status_code).toBe(200);
    expect(logs[0].subject).toBe('4');
  });

  // 2. Keputusan DENY tercatat di audit_logs
  it('2. Keputusan DENY tercatat di tabel audit_logs', async () => {
    // Request yang ditolak (tanpa device ID)
    await request(gatewayApp)
      .get('/nilai')
      .set('Authorization', `Bearer ${mhs1Token}`);

    const [logs] = await query(
      "SELECT * FROM `audit_logs` WHERE `decision` = 'DENY' ORDER BY id DESC LIMIT 1"
    );

    expect(logs.length).toBe(1);
    expect(logs[0].decision).toBe('DENY');
    expect(logs[0].status_code).toBe(400);
    expect(logs[0].reason).toMatch(/X-Device-ID/i);
  });

  // 3. Input tidak valid ditangani dengan baik (400 Bad Request)
  it('3. Input tidak valid pada body login atau nilai ditangani dengan baik (400 Bad Request)', async () => {
    // Login tanpa email & password
    const res = await request(gatewayApp)
      .post('/auth/login')
      .set('X-Device-ID', 'DEV-MHS-01')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toHaveProperty('message');
  });

  // 4. Tidak ada secret atau token mentah dalam audit log
  it('4. Tidak ada password, secret, atau token mentah yang bocor di dalam audit log', async () => {
    const [allLogs] = await query('SELECT reason, subject FROM `audit_logs`');

    for (const log of allLogs) {
      // Pastikan tidak ada raw JWT (tiga segmen base64 dengan titik)
      expect(log.reason).not.toMatch(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
      // Pastikan tidak ada string secret gateway
      expect(log.reason).not.toContain(config.gatewaySecret);
      expect(log.reason).not.toContain(config.jwt.accessSecret);
      expect(log.reason).not.toContain('Password123!');
    }
  });

  // 5. Request duplikat sinkronisasi tidak menggandakan data transkrip (idempoten)
  it('5. Request sinkronisasi yang diulang berkali-kali tidak menggandakan baris transkrip (idempoten)', async () => {
    const syncPayload = {
      classId: 2,
      items: [
        { student_id: 5, score: 92.5, source_grade_id: 3 },
        { student_id: 6, score: 85.0, source_grade_id: 4 }
      ]
    };

    // Kirim sinkronisasi pertama kali
    const res1 = await request(gatewayApp)
      .post('/transkrip/sinkron')
      .set('Authorization', `Bearer ${serviceNilaiToken}`)
      .send(syncPayload);

    expect(res1.status).toBe(200);

    const [count1] = await query('SELECT COUNT(*) as cnt FROM `transcripts` WHERE class_id = 2');
    const firstCount = count1[0].cnt;
    expect(firstCount).toBe(2);

    // Kirim sinkronisasi kedua kali dengan data yang sama (atau score baru)
    const res2 = await request(gatewayApp)
      .post('/transkrip/sinkron')
      .set('Authorization', `Bearer ${serviceNilaiToken}`)
      .send(syncPayload);

    expect(res2.status).toBe(200);

    const [count2] = await query('SELECT COUNT(*) as cnt FROM `transcripts` WHERE class_id = 2');
    const secondCount = count2[0].cnt;

    // Jumlah baris tidak boleh bertambah (tetap 2 baris)
    expect(secondCount).toBe(firstCount);
  });
});
