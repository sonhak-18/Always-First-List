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

function isConfirmationRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const dict = getDictionary();
  const patterns = dict.confirmation_request || [
    'mengajukan\\s+bimbingan',
    'mohon\\s+izin\\s+bertanya.*bimbingan',
    'apakah.*berkenan.*pukul\\s+berapa',
    'bimbingan\\s+untuk\\s+(?:besok|hari\\s+\\w+)',
  ];
  return patterns.some((patternStr) => {
    const regex = safeRegex(patternStr, 'is');
    return regex && regex.test(text);
  });
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
    stealModeRequireConfirmation = false,
    hasPrecedingConfirmation = false,
    promptTargetDay = null,
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

  // Determine the reference context date of the message
  const contextDateObj = getContextDate(cleanText, baseDate, sessionDays);
  const contextDateStr = contextDateObj.format('YYYY-MM-DD');
  const contextDateFormatted = formatListingDate(contextDateObj);

  const hasActiveSession = Boolean(registeredSessionDate) && !isDatePassed(registeredSessionDate, baseDate);
  const isSameSession = hasActiveSession && (registeredSessionDate === contextDateStr);

  // Steal Mode logic:
  // If stealModeRequireConfirmation is enabled, Steal Mode only triggers if preceding student confirmation was detected.
  const isStealArmed = stealMode && (!stealModeRequireConfirmation || hasPrecedingConfirmation);

  if (isStealArmed) {
    const finalTargetDay = targetDay || promptTargetDay || null;

    if (isRedirect && targetDay) {
      return {
        shouldTrigger: true,
        action: 'redirect',
        reason: `[MODE MENCURI] Dosen mengalihkan bimbingan ke hari ${targetDay}`,
        targetDay,
        contextDate: contextDateStr,
        contextDateFormatted,
        detectedKeywords: ['Mode Mencuri', ...detectedKeywords],
      };
    }

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
      return {
        shouldTrigger: true,
        action: 'takeover',
        reason: '[MODE MENCURI] Pembatalan sesi terdeteksi, langsung mengambil alih kuota sesi berikutnya!',
        targetDay: null,
        isCancellation: true,
        contextDate: contextDateStr,
        contextDateFormatted,
        detectedKeywords: ['Mode Mencuri', ...detectedKeywords],
      };
    }

    return {
      shouldTrigger: true,
      action: 'steal',
      reason: stealModeRequireConfirmation
        ? `Mode Mencuri: Dipicu setelah konfirmasi pengajuan mahasiswa terdeteksi${finalTargetDay ? ` (target: ${finalTargetDay})` : ''}`
        : 'Mode Mencuri: Setiap chat dosen langsung memicu pengiriman list antrean (mencuri semua waktu)',
      targetDay: finalTargetDay,
      contextDate: contextDateStr,
      contextDateFormatted,
      detectedKeywords: stealModeRequireConfirmation
        ? ['Mode Mencuri', 'Pengajuan Terkonfirmasi']
        : ['Mode Mencuri'],
    };
  }

  // Blacklist check is skipped if the lecturer explicitly redirected to an alternative day
  if (!isRedirect) {
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
    if (isSameSession) {
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
      action: 'cancellation_advance',
      reason: 'Pembatalan sesi terdekat, membuka kuota sesi berikutnya!',
      targetDay: null,
      isCancellation: true,
      contextDate: contextDateStr,
      contextDateFormatted,
      detectedKeywords,
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
  isConfirmationRequest,
};
