const { getDictionary } = require('./dictionary');

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

function analyzeMessage(text) {
  if (!text || typeof text !== 'string') {
    return { shouldTrigger: false, reason: 'Pesan kosong', targetDay: null, detectedKeywords: [] };
  }

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
      reason: `Dosen mengalihkan bimbingan ke hari ${targetDay}`,
      targetDay,
      detectedKeywords,
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
    return {
      shouldTrigger: true,
      reason: 'Pembatalan sesi terdekat, membuka kuota sesi berikutnya!',
      targetDay: null,
      isCancellation: true,
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
    return {
      shouldTrigger: true,
      reason: 'Pesan lolos filter & sesuai whitelist!',
      targetDay,
      detectedKeywords,
    };
  }

  return {
    shouldTrigger: false,
    reason: 'Pesan tidak mengandung kata kunci jadwal / bimbingan (diabaikan)',
    targetDay: null,
    detectedKeywords: [],
  };
}

module.exports = {
  analyzeMessage,
  extractTargetDay,
};
