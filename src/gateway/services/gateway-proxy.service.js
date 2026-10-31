/**
 * Gateway Proxy Service
 * Meneruskan request yang telah lolos Policy Engine ke Service Internal (Nilai / Transkrip)
 * Menambahkan header X-Gateway-Secret dan meneruskan Bearer Token untuk verifikasi mandiri
 */
const config = require('../../shared/config/env');

/**
 * Proxy helper untuk meneruskan request ke internal service
 * @param {string} targetBaseUrl - URL dasar service internal (e.g. http://127.0.0.1:3001)
 * @param {string} path - Path tujuan pada service internal
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function forwardToService(targetBaseUrl, path, req, res) {
  const targetUrl = new URL(path, targetBaseUrl);

  // Teruskan query params jika ada
  if (req.query && Object.keys(req.query).length > 0) {
    for (const [key, val] of Object.entries(req.query)) {
      targetUrl.searchParams.append(key, val);
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    // Zero Trust Defense-in-Depth: Sertakan Gateway Secret rahasia
    'X-Gateway-Secret': config.gatewaySecret,
    // Teruskan token otentikasi agar service tujuan memverifikasi secara mandiri
    'Authorization': req.headers.authorization || '',
    // Tracing Request ID
    'X-Request-ID': req.requestId || '',
    // Testing Time Override jika disertakan
    ...(req.headers['x-test-time-override'] ? { 'X-Test-Time-Override': req.headers['x-test-time-override'] } : {})
  };

  const options = {
    method: req.method,
    headers,
    signal: AbortSignal.timeout(10000) // Timeout 10 detik
  };

  if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase()) && req.body) {
    options.body = JSON.stringify(req.body);
  }

  try {
    const serviceResponse = await fetch(targetUrl.toString(), options);
    const contentType = serviceResponse.headers.get('content-type') || '';

    let responseData;
    if (contentType.includes('application/json')) {
      responseData = await serviceResponse.json();
    } else {
      const text = await serviceResponse.text();
      responseData = { message: text };
    }

    return res.status(serviceResponse.status).json(responseData);
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        error: {
          code: 'GATEWAY_TIMEOUT',
          message: 'Layanan internal tidak merespons dalam batas waktu yang ditentukan (Timeout)'
        }
      });
    }

    // Tangani service offline / connection refused
    return res.status(502).json({
      success: false,
      error: {
        code: 'BAD_GATEWAY',
        message: `Gagal berkomunikasi dengan layanan internal: ${error.message}`
      }
    });
  }
}

module.exports = {
  forwardToService
};
