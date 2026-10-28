const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { getDictionary, addKeyword, removeKeyword, saveDictionary } = require('./dictionary');
const { analyzeMessage } = require('./rules');
const { generateListingText } = require('./dateHelper');

const HISTORY_FILE = path.resolve(__dirname, '../logs_history.json');

function releasePort(port) {
  try {
    if (process.platform === 'win32') {
      const psCmd = `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`;
      execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'ignore' });
    }
  } catch (err) {}
}

class DashboardServer {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });

    this.state = {
      connected: false,
      qr: null,
      dosenPhone: '',
      sourceGroupJid: '',
      targetGroupJid: '',
      members: [],
      cooldownMinutes: 15,
      lastTriggerTime: 0,
      groups: [],
    };

    this.recentChats = [];
    this.recentTriggers = [];
    this.recentSystemLogs = [];
    this.loadHistory();

    this.setupRoutes();
    this.setupWebSocket();
  }

  loadHistory() {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.recentChats = parsed.chats || [];
        this.recentTriggers = parsed.triggers || [];
        this.recentSystemLogs = parsed.systemLogs || [];
      }
    } catch (err) {
      this.recentChats = [];
      this.recentTriggers = [];
      this.recentSystemLogs = [];
    }
  }

  saveHistory() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        const payload = {
          chats: this.recentChats.slice(0, 200),
          triggers: this.recentTriggers.slice(0, 100),
          systemLogs: this.recentSystemLogs.slice(0, 150),
        };
        fs.writeFile(HISTORY_FILE, JSON.stringify(payload, null, 2), 'utf-8', () => {});
      } catch (err) {}
    }, 50);
  }

  setupRoutes() {
    this.app.use(express.json());
    this.app.use(express.static(path.resolve(__dirname, '../public')));

    this.app.get('/api/state', (req, res) => {
      res.json({
        state: this.state,
        dictionary: getDictionary(),
        recentChats: this.recentChats,
        recentTriggers: this.recentTriggers,
        recentSystemLogs: this.recentSystemLogs,
      });
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      ws.send(JSON.stringify({
        type: 'init',
        data: {
          state: this.state,
          dictionary: getDictionary(),
          recentChats: this.recentChats,
          recentTriggers: this.recentTriggers,
          recentSystemLogs: this.recentSystemLogs,
        },
      }));

      ws.on('message', (raw) => {
        try {
          const payload = JSON.parse(raw.toString());
          this.handleClientMessage(ws, payload);
        } catch (err) {}
      });
    });
  }

  handleClientMessage(ws, payload) {
    const { type, data } = payload;

    if (type === 'test_chat') {
      const analysis = analyzeMessage(data.text);
      const members = this.state.members.length ? this.state.members : ['Nama 1', 'Nama 2', 'Nama 3'];
      let preview = '';
      if (analysis.shouldTrigger) {
        preview = generateListingText(analysis.targetDay, members);
      }
      ws.send(JSON.stringify({
        type: 'test_result',
        data: {
          text: data.text,
          analysis,
          preview,
        },
      }));
    } else if (type === 'add_keyword') {
      const updated = addKeyword(data.category, data.keyword);
      this.broadcast('dictionary_updated', updated);
    } else if (type === 'remove_keyword') {
      const updated = removeKeyword(data.category, data.keyword);
      this.broadcast('dictionary_updated', updated);
    } else if (type === 'clear_history') {
      this.recentChats = [];
      this.recentTriggers = [];
      this.recentSystemLogs = [];
      this.saveHistory();
      this.broadcast('history_cleared', {});
      this.addSystemLog('Riwayat log berhasil dibersihkan.', 'info');
    }
  }

  broadcast(type, data) {
    const message = JSON.stringify({ type, data });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  updateState(partial) {
    Object.assign(this.state, partial);
    this.broadcast('state_update', this.state);
  }

  addSystemLog(text, level = 'info') {
    const entry = {
      timestamp: Date.now(),
      text,
      level,
    };
    this.recentSystemLogs.unshift(entry);
    if (this.recentSystemLogs.length > 150) {
      this.recentSystemLogs.pop();
    }
    this.saveHistory();
    this.broadcast('new_system_log', entry);
  }

  addChatLog(chatLog) {
    this.recentChats.unshift(chatLog);
    if (this.recentChats.length > 200) {
      this.recentChats.pop();
    }
    this.saveHistory();
    this.broadcast('new_chat', chatLog);
  }

  addTriggerLog(triggerLog) {
    this.recentTriggers.unshift(triggerLog);
    if (this.recentTriggers.length > 100) {
      this.recentTriggers.pop();
    }
    this.saveHistory();
    this.broadcast('new_trigger', triggerLog);
  }

  start() {
    releasePort(this.port);

    return new Promise((resolve, reject) => {
      const onError = (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[PORT] Port ${this.port} sedang digunakan. Melepaskan port dan mencoba ulang...`);
          releasePort(this.port);
          setTimeout(() => {
            this.server.listen(this.port, () => {
              console.log(`[DASHBOARD] Always First List Console running on http://localhost:${this.port}`);
              resolve();
            });
          }, 1000);
        } else {
          reject(err);
        }
      };

      this.server.once('error', onError);

      this.server.listen(this.port, () => {
        this.server.removeListener('error', onError);
        console.log(`[DASHBOARD] Always First List Console running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }
}

module.exports = DashboardServer;
