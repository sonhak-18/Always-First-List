const path = require('path');
const dayjs = require('dayjs');
require('dayjs/locale/id');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

dayjs.locale('id');

const DAYS_MAP = {
  minggu: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  sabtu: 6,
};

const DAYS_LIST = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

function getTargetDate(
  specifiedDay = null,
  baseDate = null,
  sessionDays = ['senin', 'rabu'],
  targetMode = 'subsequent',
  isCancellation = false
) {
  const now = baseDate ? dayjs(baseDate) : dayjs();

  // If the lecturer explicitly specifies a target day, calculate the next occurrence of that day
  if (specifiedDay) {
    const targetDayIndex = DAYS_MAP[specifiedDay.toLowerCase()];
    if (targetDayIndex !== undefined) {
      const currentDayIndex = now.day();
      let daysDiff = targetDayIndex - currentDayIndex;
      if (daysDiff <= 0) {
        daysDiff += 7;
      }
      return now.add(daysDiff, 'day');
    }
  }

  const currentDayIndex = now.day();

  // Parse and sort unique session day indices
  const validIndices = Array.from(
    new Set(
      (Array.isArray(sessionDays) && sessionDays.length > 0 ? sessionDays : ['senin', 'rabu'])
        .map(d => DAYS_MAP[String(d).toLowerCase()])
        .filter(v => v !== undefined)
    )
  ).sort((a, b) => a - b);

  if (validIndices.length === 0) {
    validIndices.push(1, 3);
  }

  // Single session day per week (e.g. only Wednesday or only Friday)
  if (validIndices.length === 1) {
    const onlyDay = validIndices[0];
    let daysDiff = onlyDay - currentDayIndex;
    if (targetMode === 'immediate' && !isCancellation) {
      if (daysDiff < 0) daysDiff += 7;
    } else {
      // Subsequent mode or cancellation: confirming/cancelling this week opens next week's session
      if (daysDiff <= 0) daysDiff += 7;
    }
    return now.add(daysDiff, 'day');
  }

  // Multiple session days per week
  if (targetMode === 'immediate' && !isCancellation) {
    // Mode A (Immediate / Announced Session):
    // Target is the closest upcoming session day.
    let bestDiff = null;
    for (const dayIdx of validIndices) {
      let diff = dayIdx - currentDayIndex;
      if (diff < 0) diff += 7;
      if (bestDiff === null || diff < bestDiff) {
        bestDiff = diff;
      }
    }
    return now.add(bestDiff, 'day');
  }

  // Mode B (Subsequent Cycle / Advance Listing):
  // Listing always precedes confirmation. Confirming session N triggers listing for session N+1.
  const k = validIndices.length;
  let targetIdx;
  let addDays = 0;

  if (currentDayIndex <= validIndices[0]) {
    // Before or on first session -> target is second session of this week
    targetIdx = validIndices[1];
    addDays = targetIdx - currentDayIndex;
    if (addDays <= 0) addDays += 7;
  } else {
    // Find where currentDayIndex falls among the session days
    let found = false;
    for (let i = 0; i < k - 1; i++) {
      if (currentDayIndex <= validIndices[i + 1]) {
        // Confirmation is for session (i + 1), target is the next session
        if (i + 2 < k) {
          targetIdx = validIndices[i + 2];
          addDays = targetIdx - currentDayIndex;
        } else {
          // Wrap around to first session of next week
          targetIdx = validIndices[0];
          addDays = (targetIdx - currentDayIndex) + 7;
        }
        found = true;
        break;
      }
    }

    if (!found) {
      // After the last session day of the week -> wraps around to first session of next week
      targetIdx = validIndices[0];
      addDays = (targetIdx - currentDayIndex) + 7;
    }
  }

  return now.add(addDays, 'day');
}

function formatListingDate(dateObj) {
  const dayName = dateObj.format('dddd');
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  return `${capitalizedDay}, ${dateObj.format('DD MMMM YYYY')}`;
}

function getDefaultListingMembers() {
  if (process.env.LISTING_MEMBERS) {
    const parsed = process.env.LISTING_MEMBERS.split(',').map(m => m.trim()).filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  return ['Nama 1', 'Nama 2', 'Nama 3'];
}

function generateListingText(
  specifiedDay = null,
  members = null,
  baseDate = null,
  template = null,
  sessionDays = ['senin', 'rabu'],
  targetMode = 'subsequent',
  isCancellation = false
) {
  const activeMembers = (Array.isArray(members) && members.length > 0)
    ? members
    : getDefaultListingMembers();
  const targetDate = getTargetDate(specifiedDay, baseDate, sessionDays, targetMode, isCancellation);
  const formattedDate = formatListingDate(targetDate);
  const dayName = targetDate.format('dddd');
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);

  const formattedMembers = activeMembers.map((name, idx) => `${idx + 1}. ${name}`).join('\n');
  const rawMembers = activeMembers.join(', ');

  const defaultTemplate = 'List bimbingan {date}:\n{members}';
  let effectiveTemplate = (template && template.trim()) ? template : defaultTemplate;

  // Convert literal escape sequences (\n or accidental /n) into real newlines
  effectiveTemplate = effectiveTemplate
    .replace(/\\n/g, '\n')
    .replace(/\/n/gi, '\n');

  return effectiveTemplate
    .replace(/{date}/g, formattedDate)
    .replace(/{day}/g, capitalizedDay)
    .replace(/{members}/g, formattedMembers)
    .replace(/{members_raw}/g, rawMembers);
}

function getContextDate(text = '', baseDate = null, sessionDays = ['senin', 'rabu']) {
  const now = baseDate ? dayjs(baseDate) : dayjs();
  const clean = (text || '').toLowerCase();

  if (/\bbesok\b/i.test(clean)) {
    return now.add(1, 'day');
  }

  if (/\bhari\s+ini\b/i.test(clean)) {
    return now;
  }

  for (const day of DAYS_LIST) {
    const isNegated = new RegExp(`(?:nggak|tidak|tdk|bukan|batal)\\s+(?:hari\\s+)?${day}`, 'i').test(clean);
    if (clean.includes(day) && !isNegated) {
      return getTargetDate(day, now, sessionDays, 'immediate');
    }
  }

  return getTargetDate(null, now, sessionDays, 'immediate');
}

function isDatePassed(dateStr, baseDate = null) {
  if (!dateStr || typeof dateStr !== 'string') return true;
  const now = baseDate ? dayjs(baseDate) : dayjs();
  const sessionEnd = dayjs(dateStr).endOf('day');
  return now.isAfter(sessionEnd);
}

module.exports = {
  getTargetDate,
  formatListingDate,
  generateListingText,
  getContextDate,
  isDatePassed,
  DAYS_MAP,
  DAYS_LIST,
};
