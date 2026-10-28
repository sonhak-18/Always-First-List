const fs = require('fs');
const path = require('path');

const DICTIONARY_FILE = path.resolve(__dirname, '../dictionary.json');

const DEFAULT_DICTIONARY = {
  blacklist: [
    'penugasan luar kota',
    'luar kota',
    'berhalangan hadir sampai',
    'tidak ada bimbingan sampai',
    'diundur sampai waktu',
    'sampai waktu yang belum ditentukan',
    'sampai\\s+(?:minggu|pekan|bulan)\\s+depan',
    'libur\\s+\\d+\\s*(?:minggu|pekan|bulan)',
    'off\\s+dulu',
    'batal\\s+semua',
  ],
  cancellation: [
    '(?:besok|hari ini|senin|rabu)(?:\\s+\\w+){0,3}\\s+(?:nggak|tidak|tdk|gak|belum)\\s+bisa',
    '(?:nggak|tidak|tdk|gak|belum)\\s+bisa(?:\\s+\\w+){0,3}\\s+(?:besok|hari ini|senin|rabu)',
    '(?:besok|hari ini)(?:\\s+\\w+){0,2}\\s+(?:tidak|nggak|gak|belum)\\s+ada\\s+bimbingan',
    'besok(?:\\s+\\w+){0,2}\\s+(?:ada\\s+)?(?:acara|kegiatan|rapat|halangan|tugas)',
    'bimbingan\\s+(?:besok|hari ini)\\s+batal',
    'besok(?:\\s+\\w+){0,2}\\s+libur',
  ],
  redirect: [
    'bisanya\\s+(?:hari\\s+)?(senin|selasa|rabu|kamis|jumat|sabtu|minggu)',
    'ganti\\s+(?:ke\\s+)?(?:hari\\s+)?(senin|selasa|rabu|kamis|jumat|sabtu|minggu)',
    'pindah\\s+(?:ke\\s+)?(?:hari\\s+)?(senin|selasa|rabu|kamis|jumat|sabtu|minggu)',
    'jadinya\\s+(?:hari\\s+)?(senin|selasa|rabu|kamis|jumat|sabtu|minggu)',
  ],
  whitelist: [
    'silahkan',
    'silakan',
    'utk\\s+(?:besok\\s+)?\\d+\\s*mhswa',
    'untuk\\s+(?:besok\\s+)?\\d+\\s*(?:orang|mhs|mhswa|mahasiswa)',
    '\\d+\\s*utk\\s*\\d{4}',
    'kuota',
    'masih sama jamnya',
    'waktu(?:nya)?\\s+masih\\s+sama',
    'jam\\s*\\d{1,2}(?:\\.\\d{2})?',
    'inshaallah|insyaallah|inshallah',
    'list bimbingan',
    'monggo',
  ],
};

let currentDictionary = null;

function loadDictionary() {
  try {
    if (fs.existsSync(DICTIONARY_FILE)) {
      const raw = fs.readFileSync(DICTIONARY_FILE, 'utf-8');
      currentDictionary = JSON.parse(raw);
    } else {
      currentDictionary = JSON.parse(JSON.stringify(DEFAULT_DICTIONARY));
      saveDictionary(currentDictionary);
    }
  } catch (err) {
    currentDictionary = JSON.parse(JSON.stringify(DEFAULT_DICTIONARY));
  }
  return currentDictionary;
}

function saveDictionary(dict) {
  currentDictionary = dict;
  fs.writeFileSync(DICTIONARY_FILE, JSON.stringify(dict, null, 2), 'utf-8');
  return currentDictionary;
}

function getDictionary() {
  if (!currentDictionary) {
    loadDictionary();
  }
  return currentDictionary;
}

function isValidRegex(pattern) {
  try {
    new RegExp(pattern);
    return true;
  } catch (err) {
    return false;
  }
}

function addKeyword(category, keyword) {
  const dict = getDictionary();
  if (!dict[category]) {
    dict[category] = [];
  }
  const trimmed = typeof keyword === 'string' ? keyword.trim() : '';
  if (trimmed && isValidRegex(trimmed) && !dict[category].includes(trimmed)) {
    dict[category].push(trimmed);
    saveDictionary(dict);
  }
  return dict;
}

function removeKeyword(category, keyword) {
  const dict = getDictionary();
  if (dict[category]) {
    dict[category] = dict[category].filter(k => k !== keyword);
    saveDictionary(dict);
  }
  return dict;
}

module.exports = {
  loadDictionary,
  saveDictionary,
  getDictionary,
  addKeyword,
  removeKeyword,
};
