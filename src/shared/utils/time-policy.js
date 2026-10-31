/**
 * Modul Kebijakan Pembatasan Waktu Akses (Time-based Access Policy)
 * Mengontrol akses modifikasi data akademik sesuai jam operasional (07:00 - 21:00 WIB)
 */
const config = require('../config/env');

/**
 * Mendapatkan representasi jam dan menit saat ini pada zona waktu target (Asia/Jakarta)
 * @param {Date} [customDate] - Tanggal opsional untuk keperluan testing
 * @param {string} [timeZone] - Zona waktu default Asia/Jakarta
 * @returns {{ hour: number, minute: number, second: number, timeString: string }}
 */
function getZonedTime(customDate = new Date(), timeZone = config.timePolicy.timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(customDate);
  const partMap = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const hour = parseInt(partMap.hour, 10);
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);
  const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')} WIB`;

  return { hour, minute, second, timeString };
}

/**
 * Memeriksa apakah waktu saat ini berada dalam rentang jam operasional
 * @param {Date} [customDate]
 * @returns {{ allowed: boolean, currentHour: number, timeString: string, reason: string }}
 */
function isWithinOperationalHours(customDate = new Date()) {
  const { startHour, endHour } = config.timePolicy;
  const { hour, minute, timeString } = getZonedTime(customDate);

  // Akses diizinkan jika jam >= startHour DAN jam < endHour
  // Contoh: 07:00 s.d. 20:59:59 (sampai batas pukul 21:00:00)
  const isAllowed = hour >= startHour && hour < endHour;

  let reason = '';
  if (!isAllowed) {
    reason = `Operasi ditolak di luar jam operasional akademik (${startHour}.00 - ${endHour}.00 WIB). Waktu sistem saat ini: ${timeString}.`;
  } else {
    reason = `Waktu request berada dalam jam operasional (${startHour}.00 - ${endHour}.00 WIB).`;
  }

  return {
    allowed: isAllowed,
    currentHour: hour,
    currentMinute: minute,
    timeString,
    reason
  };
}

module.exports = {
  getZonedTime,
  isWithinOperationalHours
};
