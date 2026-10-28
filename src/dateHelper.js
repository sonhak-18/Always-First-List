const dayjs = require('dayjs');
require('dayjs/locale/id');

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

function getTargetDate(specifiedDay = null, baseDate = null, sessionDays = ['senin', 'rabu']) {
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

  // Academic cycle: listing happens prior to confirmation.
  // Today's confirmation is the flag triggering the listing for the subsequent session.
  const currentDayIndex = now.day();

  const validDays = (Array.isArray(sessionDays) && sessionDays.length >= 2)
    ? sessionDays.map(d => DAYS_MAP[String(d).toLowerCase()]).filter(v => v !== undefined)
    : [1, 3];

  validDays.sort((a, b) => a - b);
  const day1 = validDays[0];
  const day2 = validDays[1];

  let targetIndex;
  let addDays = 0;

  if (currentDayIndex <= day1) {
    targetIndex = day2;
    addDays = targetIndex - currentDayIndex;
    if (addDays <= 0) addDays += 7;
  } else if (currentDayIndex <= day2) {
    targetIndex = day1;
    addDays = (targetIndex - currentDayIndex) + 7;
  } else {
    targetIndex = day1;
    addDays = (targetIndex - currentDayIndex) + 7;
  }

  return now.add(addDays, 'day');
}

function formatListingDate(dateObj) {
  const dayName = dateObj.format('dddd');
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  return `${capitalizedDay}, ${dateObj.format('DD MMMM YYYY')}`;
}

function generateListingText(
  specifiedDay = null,
  members = ['Nama 1', 'Nama 2', 'Nama 3'],
  baseDate = null,
  template = null,
  sessionDays = ['senin', 'rabu']
) {
  const targetDate = getTargetDate(specifiedDay, baseDate, sessionDays);
  const formattedDate = formatListingDate(targetDate);
  const dayName = targetDate.format('dddd');
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);

  const formattedMembers = members.map((name, idx) => `${idx + 1}. ${name}`).join('\n');
  const rawMembers = members.join(', ');

  const defaultTemplate = 'List bimbingan {date}:\n{members}';
  const effectiveTemplate = (template && template.trim()) ? template : defaultTemplate;

  return effectiveTemplate
    .replace(/{date}/g, formattedDate)
    .replace(/{day}/g, capitalizedDay)
    .replace(/{members}/g, formattedMembers)
    .replace(/{members_raw}/g, rawMembers);
}

module.exports = {
  getTargetDate,
  formatListingDate,
  generateListingText,
  DAYS_MAP,
};
