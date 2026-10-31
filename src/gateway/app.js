/**
 * Express Application untuk API Gateway (Port 3000)
 * Bertindak sebagai Policy Enforcement Point (PEP) dan titik masuk utama
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');

const authRoutes = require('./routes/auth.routes');
const nilaiRoutes = require('./routes/nilai.routes');
const kelasRoutes = require('./routes/kelas.routes');
const transkripRoutes = require('./routes/transkrip.routes');
const { errorHandler } = require('./middleware/error-handler');
const { authenticateJwt } = require('./middleware/authenticate');
const { requireRegisteredDevice } = require('./middleware/device-check');
const { getAuditLogs } = require('./services/audit.service');

const app = express();

// Security Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Tracing Middleware: Injeksi / Propagasi Request ID
app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = reqId;
  res.setHeader('X-Request-ID', reqId);
  next();
});

// Health Check Endpoint (Tidak mengekspos data sensitif)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'API Gateway (PEP)',
    port: 3000,
    timestamp: new Date().toISOString()
  });
});

// Audit Logs Endpoint (Terproteksi - Hanya untuk Administrator atau Pengujian)
app.get('/audit-logs', authenticateJwt, requireRegisteredDevice, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Hanya administrator yang berhak menginspeksi audit logs'
        }
      });
    }

    const limit = parseInt(req.query.limit || '100', 10);
    const logs = await getAuditLogs(limit);
    res.status(200).json({
      success: true,
      data: logs
    });
  } catch (err) {
    next(err);
  }
});

// Routing Modul
app.use('/auth', authRoutes);
app.use('/nilai', nilaiRoutes);
app.use('/kelas', kelasRoutes);
app.use('/transkrip', transkripRoutes);

// 404 Handler untuk route yang tidak ditemukan
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan pada API Gateway`
    }
  });
});

// Centralized Error Handler
app.use(errorHandler);

module.exports = app;
