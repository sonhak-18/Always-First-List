const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const CONFIG_FILE = path.resolve(__dirname, '../config.json');

function getEnvMembers() {
  if (!process.env.LISTING_MEMBERS) return [];
  return process.env.LISTING_MEMBERS.split(',').map(m => m.trim()).filter(Boolean);
}

function isPlaceholderMembers(members) {
  if (!Array.isArray(members) || members.length === 0) return true;
  return members.every((m, idx) => m.toLowerCase() === `nama ${idx + 1}`);
}

const DEFAULT_CONFIG = {
  messageTemplate: 'List bimbingan {date}:\n{members}',
  sessionDays: ['senin', 'rabu'],
  targetMode: 'subsequent',
  members: [],
  cooldownMinutes: parseInt(process.env.COOLDOWN_MINUTES || '15', 10),
  registeredSessionDate: null,
  stealMode: false,
};

let currentConfig = null;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      currentConfig = Object.assign({}, DEFAULT_CONFIG, parsed);
    } else {
      currentConfig = Object.assign({}, DEFAULT_CONFIG);
      saveConfig(currentConfig);
    }
  } catch (err) {
    currentConfig = Object.assign({}, DEFAULT_CONFIG);
  }
  return currentConfig;
}

function saveConfig(cfg) {
  currentConfig = Object.assign({}, DEFAULT_CONFIG, cfg);
  const toSave = Object.assign({}, currentConfig);
  const envMembers = getEnvMembers();

  // Keep config.json free of private member names if it matches .env or default placeholder
  if (
    !toSave.members ||
    toSave.members.length === 0 ||
    isPlaceholderMembers(toSave.members) ||
    (envMembers.length > 0 && JSON.stringify(toSave.members) === JSON.stringify(envMembers))
  ) {
    toSave.members = [];
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
  return getConfig();
}

function getConfig() {
  if (!currentConfig) {
    loadConfig();
  }
  const envMembers = getEnvMembers();
  const members = (currentConfig.members && currentConfig.members.length > 0 && !isPlaceholderMembers(currentConfig.members))
    ? currentConfig.members
    : (envMembers.length > 0 ? envMembers : ['Nama 1', 'Nama 2', 'Nama 3']);

  return Object.assign({}, currentConfig, { members });
}

function sanitizeConfig(input) {
  if (!input || typeof input !== 'object') return {};
  const clean = {};
  if (typeof input.messageTemplate === 'string') {
    clean.messageTemplate = input.messageTemplate.slice(0, 4000);
  }
  if (Array.isArray(input.sessionDays)) {
    const validDays = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
    clean.sessionDays = input.sessionDays
      .filter(d => typeof d === 'string')
      .map(d => d.toLowerCase().trim())
      .filter(d => validDays.includes(d));
  }
  if (input.targetMode === 'subsequent' || input.targetMode === 'immediate') {
    clean.targetMode = input.targetMode;
  }
  if (Array.isArray(input.members)) {
    clean.members = input.members
      .filter(m => typeof m === 'string')
      .map(m => m.trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  if (
    typeof input.cooldownMinutes === 'number' &&
    Number.isInteger(input.cooldownMinutes) &&
    input.cooldownMinutes >= 1 &&
    input.cooldownMinutes <= 1440
  ) {
    clean.cooldownMinutes = input.cooldownMinutes;
  }
  if (input.registeredSessionDate === null || input.registeredSessionDate === '') {
    clean.registeredSessionDate = null;
  } else if (typeof input.registeredSessionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.registeredSessionDate)) {
    clean.registeredSessionDate = input.registeredSessionDate;
  }
  if (typeof input.stealMode === 'boolean') {
    clean.stealMode = input.stealMode;
  }
  return clean;
}

function updateConfig(partial) {
  const cfg = getConfig();
  const sanitized = sanitizeConfig(partial);
  const updated = Object.assign({}, cfg, sanitized);
  return saveConfig(updated);
}

module.exports = {
  getConfig,
  loadConfig,
  saveConfig,
  updateConfig,
  DEFAULT_CONFIG,
};
