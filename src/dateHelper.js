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

function getTargetDate(specifiedDay = null, baseDate = null) {
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

  // Minggu (0) & Senin (1): Lecturer confirms Monday session -> trigger listing for Wednesday
  if (currentDayIndex === 0) {
    return now.add(3, 'day');
  }
  if (currentDayIndex === 1) {
    return now.add(2, 'day');
  }

  // Selasa (2) & Rabu (3): Lecturer confirms Wednesday session -> trigger listing for next Monday
  if (currentDayIndex === 2) {
    return now.add(6, 'day');
  }
  if (currentDayIndex === 3) {
    return now.add(5, 'day');
  }

  // Kamis (4), Jumat (5), Sabtu (6): Subsequent cycle defaults to upcoming Wednesday
  let daysUntilWednesday = 3 - currentDayIndex;
  if (daysUntilWednesday <= 0) {
    daysUntilWednesday += 7;
  }
  return now.add(daysUntilWednesday, 'day');
}

function formatListingDate(dateObj) {
  const dayName = dateObj.format('dddd');
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  return `${capitalizedDay}, ${dateObj.format('DD MMMM YYYY')}`;
}

function generateListingText(specifiedDay = null, members = ['Nama 1', 'Nama 2', 'Nama 3'], baseDate = null) {
  const targetDate = getTargetDate(specifiedDay, baseDate);
  const formattedDate = formatListingDate(targetDate);

  const lines = [
    `List bimbingan ${formattedDate}:`,
    ...members.map((name, idx) => `${idx + 1}. ${name}`),
  ];

  return lines.join('\n');
}

module.exports = {
  getTargetDate,
  formatListingDate,
  generateListingText,
  DAYS_MAP,
};
