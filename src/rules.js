const { getDictionary } = require('./dictionary');
const { getContextDate, formatListingDate, isDatePassed } = require('./dateHelper');

const DAYS_LIST = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];

function safeRegex(patternStr, flags = 'i') {
  if (!patternStr || typeof patternStr !== 'string') return null;
  try {
    return new RegExp(patternStr, flags);
  } catch (err) {
    return null;
  }
}

function extractTargetDay(text) {
  const clean = text.toLowerCase();
  const dict = getDictionary();

  // Redirect patterns (e.g. "bisanya rabu", "ganti rabu") take precedence over normal day mentions
  for (const patternStr of dict.redirect || []) {
    const regex = safeRegex(patternStr, 'i');
    if (!regex) continue;
    const match = clean.match(regex);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  }

  // Handle negation followed by an alternative day (e.g. "senin nggak bisa, rabu ya")
  for (const day of DAYS_LIST) {
    const dayNegative = new RegExp(`(?:hari\\s+)?${day}\\s+(?:nggak|tidak|tdk|belum)\\s+bisa`, 'i');
    if (dayNegative.test(clean)) {
      for (const altDay of DAYS_LIST) {
        if (altDay !== day && clean.includes(altDay)) {
          return altDay;
        }
      }
    }
  }

  // Fallback to standalone day mention without negation
  for (const day of DAYS_LIST) {
    if (clean.includes(day)) {
      const isNegated =
        new RegExp(`(?:nggak|tidak|tdk|bukan|batal)\\s+(?:hari\\s+)?${day}`, 'i').test(clean) ||
        new RegExp(`(?:hari\\s+)?${day}\\s+(?:nggak|tidak|tdk|batal)`, 'i').test(clean);
      if (!isNegated) {
        return day;
      }
    }
  }

  return null;
}

function analyzeMessage(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { shouldTrigger: false, action: 'empty', reason: 'Pesan kosong', targetDay: null, detectedKeywords: [] };
  }

  const {
    registeredSessionDate = null,
    baseDate = null,
    sessionDays = ['senin', 'rabu'],
    stealMode = false,
  } = options;

  const cleanText = text.trim();
  const detectedKeywords = [];
  const dict = getDictionary();

  let isRedirect = false;
  const targetDay = extractTargetDay(cleanText);

  for (const patternStr of dict.redirect || []) {
    const regex = safeRegex(patternStr, 'i');
    if (!regex) continue;
    const match = cleanText.match(regex);
    if (match) {
      isRedirect = true;
      detectedKeywords.push(`Pengalihan: ${match[0]}`);
      break;
    }
  }

  if (isRedirect && targetDay) {
    return {
      shouldTrigger: true,
      action: 'redirect',
      reason: stealMode
        ? `[MODE MENCURI] Dosen mengalihkan bimbingan ke hari ${targetDay}`
        : `Dosen mengalihkan bimbingan ke hari ${targetDay}`,
      targetDay,
      detectedKeywords: stealMode ? ['Mode Mencuri', ...detectedKeywords] : detectedKeywords,
    };
  }

  // Blacklist check is skipped in steal mode or if the lecturer explicitly redirected to an alternative day
  if (!isRedirect && !stealMode) {
    for (const patternStr of dict.blacklist || []) {
      const regex = safeRegex(patternStr, 'i');
      if (!regex) continue;
      if (regex.test(cleanText)) {
        const match = cleanText.match(regex);
        return {
          shouldTrigger: false,
          action: 'blacklist',
          reason: `Terkena Blacklist (${patternStr}) - Dosen berhalangan panjang`,
          targetDay: null,
          detectedKeywords: match ? [match[0]] : [patternStr],
        };
      }
    }
  }

  // Determine the reference context date of the message
  const contextDateObj = getContextDate(cleanText, baseDate, sessionDays);
  const contextDateStr = contextDateObj.format('YYYY-MM-DD');
  const contextDateFormatted = formatListingDate(contextDateObj);

  const hasActiveSession = Boolean(registeredSessionDate) && !isDatePassed(registeredSessionDate, baseDate);
  const isSameSession = hasActiveSession && (registeredSessionDate === contextDateStr);

  // Immediate session cancellation triggers listing for the subsequent cycle session
  let isSessionCancellation = false;
  for (const patternStr of dict.cancellation || []) {
    const regex = safeRegex(patternStr, 'i');
    if (!regex) continue;
    const match = cleanText.match(regex);
    if (match) {
      isSessionCancellation = true;
      detectedKeywords.push(`Pembatalan Sesi: ${match[0]}`);
      break;
    }
  }

  if (isSessionCancellation) {
    if (isSameSession && !stealMode) {
      return {
        shouldTrigger: true,
        action: 'takeover',
        reason: `Sesi terdaftar kita (${contextDateFormatted}) dibatalkan dosen. Langsung mengambil alih kuota sesi berikutnya!`,
        targetDay: null,
        isCancellation: true,
        contextDate: contextDateStr,
        contextDateFormatted,
        detectedKeywords,
      };
    }

    return {
      shouldTrigger: true,
      action: stealMode ? 'takeover' : 'cancellation_advance',
      reason: stealMode
        ? '[MODE MENCURI] Pembatalan sesi terdeteksi, langsung mengambil alih kuota sesi berikutnya!'
        : 'Pembatalan sesi terdekat, membuka kuota sesi berikutnya!',
      targetDay: null,
      isCancellation: true,
      contextDate: contextDateStr,
      contextDateFormatted,
      detectedKeywords: stealMode ? ['Mode Mencuri', ...detectedKeywords] : detectedKeywords,
    };
  }

  // Mode Mencuri: Setiap chat dosen langsung memicu pengiriman list antrean tanpa menunggu whitelist
  if (stealMode) {
    return {
      shouldTrigger: true,
      action: 'steal',
      reason: 'Mode Mencuri: Setiap chat dosen langsung memicu pengiriman list antrean (mencuri semua waktu)',
      targetDay,
      contextDate: contextDateStr,
      contextDateFormatted,
      detectedKeywords: ['Mode Mencuri'],
    };
  }

  let matchedWhitelist = false;
  for (const patternStr of dict.whitelist || []) {
    const regex = safeRegex(patternStr, 'i');
    if (!regex) continue;
    const match = cleanText.match(regex);
    if (match) {
      matchedWhitelist = true;
      detectedKeywords.push(match[0]);
    }
  }

  if (matchedWhitelist || isRedirect) {
    if (isSameSession) {
      // Suppress listing when the group is already registered for this session.
      return {
        shouldTrigger: false,
        action: 'standby',
        reason: `Dosen mengonfirmasi bimbingan untuk sesi yang sudah kita daftarkan (${contextDateFormatted}). Menahan pengiriman list (STANDBY).`,
        targetDay: null,
        contextDate: contextDateStr,
        contextDateFormatted,
        detectedKeywords,
      };
    }

    return {
      shouldTrigger: true,
      action: 'normal',
      reason: 'Pesan lolos filter & sesuai whitelist!',
      targetDay,
      contextDate: contextDateStr,
      contextDateFormatted,
      detectedKeywords,
    };
  }

  return {
    shouldTrigger: false,
    action: 'ignored',
    reason: 'Pesan tidak mengandung kata kunci jadwal / bimbingan (diabaikan)',
    targetDay: null,
    contextDate: contextDateStr,
    contextDateFormatted,
    detectedKeywords: [],
  };
}

module.exports = {
  analyzeMessage,
  extractTargetDay,
};
