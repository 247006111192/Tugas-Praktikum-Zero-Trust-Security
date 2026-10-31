/**
 * Express Application: Service Transkrip (Port 3002)
 * Mengelola data transkrip akademik mahasiswa dan sinkronisasi
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { requireGatewaySecret } = require('./middleware/gateway-auth');
const { verifyServiceTokenAuth } = require('./middleware/token-auth');
const transkripRoutes = require('./routes/transkrip.routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Service Transkrip',
    port: 3002,
    timestamp: new Date().toISOString()
  });
});

// Zero Trust Defense-in-Depth:
// Seluruh endpoint internal wajib memverifikasi Gateway Secret dan JWT Token
app.use(requireGatewaySecret);
app.use(verifyServiceTokenAuth);

// Routing
app.use('/transkrip', transkripRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'RESOURCE_NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan pada Service Transkrip`
    }
  });
});

// Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Terjadi kesalahan pada Service Transkrip'
    }
  });
});

module.exports = app;
