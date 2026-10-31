/**
 * Konfigurasi Terpusat Zero Trust Security System
 */
require('dotenv').config();

const config = {
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME || 'zero_trust_security',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  },
  ports: {
    gateway: parseInt(process.env.GATEWAY_PORT || '3000', 10),
    nilai: parseInt(process.env.NILAI_PORT || '3001', 10),
    transkrip: parseInt(process.env.TRANSKRIP_PORT || '3002', 10)
  },
  services: {
    nilaiUrl: process.env.NILAI_SERVICE_URL || 'http://127.0.0.1:3001',
    transkripUrl: process.env.TRANSKRIP_SERVICE_URL || 'http://127.0.0.1:3002',
    gatewayUrl: process.env.GATEWAY_URL || 'http://127.0.0.1:3000',
    serviceNilaiClientId: process.env.SERVICE_NILAI_CLIENT_ID || 'service-nilai',
    serviceNilaiClientSecret: process.env.SERVICE_NILAI_CLIENT_SECRET || 'secret-credential-for-nilai-service-sync-2026'
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'default_jwt_access_secret_change_me_32chars!',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_jwt_refresh_secret_change_me_32chars!',
    serviceSecret: process.env.JWT_SERVICE_SECRET || 'default_jwt_service_secret_change_me_32chars!',
    accessExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '10m',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '1d',
    serviceExpiresIn: process.env.SERVICE_TOKEN_EXPIRES_IN || '5m'
  },
  gatewaySecret: process.env.GATEWAY_SECRET || 'default_gateway_secret_header_trust_token',
  timePolicy: {
    startHour: parseInt(process.env.ACCESS_START_HOUR || '7', 10),
    endHour: parseInt(process.env.ACCESS_END_HOUR || '21', 10),
    timeZone: process.env.TIME_ZONE || 'Asia/Jakarta'
  }
};

module.exports = config;
