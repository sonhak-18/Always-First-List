const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.resolve(__dirname, '../config.json');

const DEFAULT_CONFIG = {
  messageTemplate: 'List bimbingan {date}:\n{members}',
  sessionDays: ['senin', 'rabu'],
  targetMode: 'subsequent',
  members: [],
  cooldownMinutes: 15,
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
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf-8');
  return currentConfig;
}

function getConfig() {
  if (!currentConfig) {
    loadConfig();
  }
  return currentConfig;
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
