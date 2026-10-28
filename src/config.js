const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.resolve(__dirname, '../config.json');

const DEFAULT_CONFIG = {
  messageTemplate: 'List bimbingan {date}:\n{members}',
  sessionDays: ['senin', 'rabu'],
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

function updateConfig(partial) {
  const cfg = getConfig();
  const updated = Object.assign({}, cfg, partial);
  return saveConfig(updated);
}

module.exports = {
  getConfig,
  loadConfig,
  saveConfig,
  updateConfig,
  DEFAULT_CONFIG,
};
