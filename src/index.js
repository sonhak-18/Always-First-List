const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { analyzeMessage, isConfirmationRequest, extractTargetDay } = require('./rules');
const { generateListingText, getTargetDate, isDatePassed, formatListingDate } = require('./dateHelper');
const { getConfig, updateConfig } = require('./config');
const DashboardServer = require('./server');

const DOSEN_PHONE = (process.env.DOSEN_PHONE || '').replace(/[^0-9]/g, '');
const SOURCE_GROUP_JID = process.env.SOURCE_GROUP_JID?.trim();
const TARGET_GROUP_JID = process.env.TARGET_GROUP_JID?.trim();
const COOLDOWN_MINUTES = parseInt(process.env.COOLDOWN_MINUTES || '15', 10);
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const MEMBERS = (process.env.LISTING_MEMBERS || 'Nama 1, Nama 2, Nama 3')
  .split(',')
  .map(m => m.trim())
  .filter(Boolean);

let lastTriggerTime = 0;
let lastConfirmationRequest = null;
const dashboard = new DashboardServer(PORT, HOST);
const authPath = path.resolve(__dirname, '../auth_info_baileys');
const groupParticipantMap = new Map();
const groupMetadataCache = new Map();
let precomputedListing = null;

function refreshPrecomputedListing() {
  try {
    const cfg = getConfig();
    const effectiveMembers = (Array.isArray(cfg.members) && cfg.members.length > 0)
      ? cfg.members
      : MEMBERS;
    const targetDateObj = getTargetDate(null, null, cfg.sessionDays, cfg.targetMode, false);
    const text = generateListingText(
      null,
      effectiveMembers,
      null,
      cfg.messageTemplate,
      cfg.sessionDays,
      cfg.targetMode,
      false
    );
    precomputedListing = {
      text,
      targetDateObj,
      targetDateStr: targetDateObj.format('YYYY-MM-DD'),
      mode: cfg.targetMode,
    };
  } catch (err) {}
}

dashboard.on('config_updated', () => refreshPrecomputedListing());

function normalizeId(jid) {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

// WhatsApp groups often identify senders by an opaque Linked Identity (LID) instead of their phone number
function resolveSenderPhone(senderJid, groupJid) {
  if (!senderJid) return '';
  const cleanId = normalizeId(senderJid);

  if (groupJid && groupParticipantMap.has(groupJid)) {
    const mapping = groupParticipantMap.get(groupJid);
    if (mapping.has(cleanId)) {
      return mapping.get(cleanId);
    }
  }

  const reverseFile = path.resolve(authPath, `lid-mapping-${cleanId}_reverse.json`);
  if (fs.existsSync(reverseFile)) {
    try {
      const raw = fs.readFileSync(reverseFile, 'utf-8').trim();
      const phone = JSON.parse(raw).replace(/[^0-9]/g, '');
      if (phone) return phone;
    } catch (err) {}
  }

  return cleanId;
}

function checkIsDosen(senderJid, groupJid, targetDosen) {
  if (!targetDosen) return false;
  const target = targetDosen.replace(/[^0-9]/g, '');
  const senderId = normalizeId(senderJid);
  const resolvedPhone = resolveSenderPhone(senderJid, groupJid);

  if (senderId === target || resolvedPhone === target) {
    return true;
  }

  // Handle prefix variations between 08... and 628...
  const targetZero = target.replace(/^62/, '0');
  const resolvedZero = resolvedPhone.replace(/^62/, '0');
  if (targetZero === resolvedZero) {
    return true;
  }

  // Handle minor digit repeats on country code (e.g. 628898... vs 62898...)
  if (target.replace(/^628+/, '628') === resolvedPhone.replace(/^628+/, '628')) {
    return true;
  }

  return false;
}

async function updateGroupCache(sock, groupJid) {
  if (!groupJid) return;
  try {
    const meta = await sock.groupMetadata(groupJid);
    if (meta && Array.isArray(meta.participants)) {
      groupMetadataCache.set(groupJid, meta);
      const mapping = new Map();
      for (const p of meta.participants) {
        const phone = p.id ? normalizeId(p.id) : '';
        const lid = p.lid ? normalizeId(p.lid) : '';
        if (phone && lid) {
          mapping.set(lid, phone);
          mapping.set(phone, lid);
        }
      }
      groupParticipantMap.set(groupJid, mapping);
    }
  } catch (err) {}
}

async function startBot() {
  dashboard.updateState({
    dosenPhone: DOSEN_PHONE,
    sourceGroupJid: SOURCE_GROUP_JID,
    targetGroupJid: TARGET_GROUP_JID,
    members: MEMBERS,
    cooldownMinutes: COOLDOWN_MINUTES,
  });

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['AlwaysFirstList', 'Console', '1.0.0'],
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: true,
    keepAliveIntervalMs: 10000,
    retryRequestDelayMs: 150,
    emitOwnEvents: false,
    cachedGroupMetadata: async (jid) => groupMetadataCache.get(jid),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      dashboard.updateState({ qr: true, connected: false });
      dashboard.addSystemLog('Menyiapkan QR Code login baru. Silakan pindai dari HP.', 'warn');
      console.log('\n[QR CODE] Silakan scan QR code di bawah ini:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403;
      dashboard.updateState({ connected: false, qr: false });

      if (isLoggedOut) {
        dashboard.addSystemLog('Sesi WhatsApp telah logout dari HP. Menghapus sesi lama...', 'error');
        console.log('[KONEKSI] Sesi telah logout dari HP. Menghapus data sesi lama...');
        try {
          fs.rmSync(authPath, { recursive: true, force: true });
        } catch (err) {}
        console.log('[KONEKSI] Menyiapkan QR Code baru dalam 2 detik...\n');
        setTimeout(startBot, 2000);
      } else {
        dashboard.addSystemLog(`Koneksi terputus (Status: ${statusCode || 'unknown'}). Reconnecting dalam 3 detik...`, 'warn');
        console.log(`[KONEKSI] Terputus (Status: ${statusCode}). Reconnecting dalam 3 detik...`);
        setTimeout(startBot, 3000);
      }
    } else if (connection === 'open') {
      dashboard.updateState({ qr: false, connected: true });
      dashboard.addSystemLog('Bot WhatsApp berhasil terhubung.', 'success');
      console.log('\n[KONEKSI] Bot WhatsApp Terhubung.');

      try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups).map(g => ({ id: g.id, name: g.subject }));
        dashboard.updateState({ groups: groupList });
        dashboard.addSystemLog(`Ditemukan ${groupList.length} grup WhatsApp. Cache bimbingan aktif.`, 'info');

        console.log(`[INFO] Ditemukan ${groupList.length} grup WhatsApp:`);
        groupList.forEach((grp, idx) => {
          console.log(`${idx + 1}. ${grp.name} -> ${grp.id}`);
        });

        if (SOURCE_GROUP_JID) {
          await updateGroupCache(sock, SOURCE_GROUP_JID);
        }
        if (TARGET_GROUP_JID) {
          await updateGroupCache(sock, TARGET_GROUP_JID);
        }
        refreshPrecomputedListing();
      } catch (err) {}
    }
  });

  sock.ev.on('groups.update', (updates) => {
    for (const u of updates) {
      if (groupMetadataCache.has(u.id)) {
        const existing = groupMetadataCache.get(u.id);
        groupMetadataCache.set(u.id, { ...existing, ...u });
      }
    }
  });

  sock.ev.on('group-participants.update', ({ id, participants, action }) => {
    const meta = groupMetadataCache.get(id);
    if (meta && Array.isArray(meta.participants)) {
      if (action === 'add') {
        const newParts = participants.map(p => ({ id: p, admin: null }));
        meta.participants.push(...newParts);
      } else if (action === 'remove') {
        meta.participants = meta.participants.filter(p => !participants.includes(p.id));
      }
      groupMetadataCache.set(id, meta);
    }
    updateGroupCache(sock, id).catch(() => {});
  });

  // Keep target group metadata, E2EE sender keys and precomputed text warm
  setInterval(() => {
    if (TARGET_GROUP_JID && sock?.ws?.readyState === 1) {
      updateGroupCache(sock, TARGET_GROUP_JID).catch(() => {});
    }
    refreshPrecomputedListing();
  }, 2 * 60 * 1000);

  sock.ev.on('messages.upsert', async (chatUpdate) => {
    try {
      const messages = chatUpdate.messages;
      if (!messages || messages.length === 0) return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;

        // Fast-path: Discard non-source groups immediately to avoid regex/LID overhead
        const groupJid = msg.key.remoteJid;
        if (SOURCE_GROUP_JID && groupJid !== SOURCE_GROUP_JID) {
          continue;
        }

        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          '';

        if (!text) continue;

        const senderJid = msg.key.participant || msg.participant || groupJid;
        const resolvedPhone = resolveSenderPhone(senderJid, groupJid);
        const isDosen = checkIsDosen(senderJid, groupJid, DOSEN_PHONE);

        if (!isDosen) {
          if (isConfirmationRequest(text)) {
            lastConfirmationRequest = {
              timestamp: Date.now(),
              text,
              sender: resolvedPhone,
            };
            dashboard.addSystemLog(
              `[PENGAJUAN MAHASISWA] Terdeteksi pesan pengajuan bimbingan dari ${resolvedPhone}. Mode Mencuri kini siap terpicu saat dosen merespons.`,
              'info'
            );
            dashboard.broadcast('confirmation_request_detected', lastConfirmationRequest);
            console.log(`[PENGAJUAN] Terdeteksi dari ${resolvedPhone}`);
          }
        }

        if (isDosen) {
          const tReceived = Date.now();
          const currentConfig = getConfig();

          // Auto-expire past registered session date
          if (currentConfig.registeredSessionDate && isDatePassed(currentConfig.registeredSessionDate)) {
            updateConfig({ registeredSessionDate: null });
            dashboard.broadcast('config_updated', getConfig());
            dashboard.addSystemLog('Sesi bimbingan sebelumnya telah selesai. Status pendaftaran direset otomatis.', 'info');
          }

          const effectiveCooldown = (typeof currentConfig.cooldownMinutes === 'number' && currentConfig.cooldownMinutes > 0)
            ? currentConfig.cooldownMinutes
            : COOLDOWN_MINUTES;
          const elapsedMinutes = (tReceived - lastTriggerTime) / (1000 * 60);

          let hasPrecedingConfirmation = false;
          if (lastConfirmationRequest) {
            if (Date.now() - lastConfirmationRequest.timestamp <= 24 * 60 * 60 * 1000) {
              hasPrecedingConfirmation = true;
            } else {
              lastConfirmationRequest = null;
            }
          }

          if (elapsedMinutes >= effectiveCooldown) {
            const analysis = analyzeMessage(text, {
              registeredSessionDate: currentConfig.registeredSessionDate,
              sessionDays: currentConfig.sessionDays,
              targetMode: currentConfig.targetMode,
              stealMode: currentConfig.stealMode,
              stealModeRequireConfirmation: currentConfig.stealModeRequireConfirmation,
              hasPrecedingConfirmation,
            });

            if (currentConfig.stealMode && currentConfig.stealModeRequireConfirmation && !hasPrecedingConfirmation && !analysis.shouldTrigger) {
              dashboard.addSystemLog(
                'Dosen mengirim chat, namun belum ada pesan pengajuan bimbingan dari mahasiswa sebelumnya. Mode Mencuri ditahan.',
                'info'
              );
            }

            if (analysis.action === 'standby') {
              dashboard.addSystemLog(
                `[STANDBY] Dosen mengonfirmasi bimbingan untuk sesi ${analysis.contextDateFormatted || ''}. Kelompok kita sudah terdaftar. Menahan pengiriman list.`,
                'info'
              );
              console.log(`[STANDBY] ${analysis.reason}`);
            } else if (analysis.shouldTrigger) {
              const effectiveMembers = (Array.isArray(currentConfig.members) && currentConfig.members.length > 0)
                ? currentConfig.members
                : MEMBERS;

              let targetDateObj;
              let targetDateStr;
              let listingMessage;

              // Ultra-fast path: Use pre-computed payload when no custom day redirect is needed
              if (!analysis.targetDay && !analysis.isCancellation && precomputedListing) {
                targetDateObj = precomputedListing.targetDateObj;
                targetDateStr = precomputedListing.targetDateStr;
                listingMessage = precomputedListing.text;
              } else {
                targetDateObj = getTargetDate(
                  analysis.targetDay,
                  null,
                  currentConfig.sessionDays,
                  currentConfig.targetMode,
                  analysis.isCancellation
                );
                targetDateStr = targetDateObj.format('YYYY-MM-DD');
                listingMessage = generateListingText(
                  analysis.targetDay,
                  effectiveMembers,
                  null,
                  currentConfig.messageTemplate,
                  currentConfig.sessionDays,
                  currentConfig.targetMode,
                  analysis.isCancellation
                );
              }

              const targetJid = TARGET_GROUP_JID;

              if (targetJid && targetJid.includes('@g.us')) {
                const sendStartTime = Date.now();
                const internalLatency = sendStartTime - tReceived;

                sock.sendMessage(targetJid, { text: listingMessage }).then(() => {
                  const ackTime = Date.now();
                  const networkLatency = ackTime - sendStartTime;
                  const totalLatency = ackTime - tReceived;
                  lastTriggerTime = ackTime;
                  lastConfirmationRequest = null;
                  dashboard.broadcast('confirmation_request_consumed', null);

                  // Lock in registered session date to avoid re-triggering during H-1 confirmations
                  const updatedCfg = updateConfig({ registeredSessionDate: targetDateStr });
                  dashboard.broadcast('config_updated', updatedCfg);
                  refreshPrecomputedListing();

                  dashboard.addTriggerLog({
                    timestamp: ackTime,
                    text,
                    targetDay: analysis.targetDay,
                    listingMessage,
                    latency: totalLatency,
                    internalLatency,
                    networkLatency,
                    action: analysis.action,
                  });
                  const actionLabel = analysis.action === 'steal'
                    ? 'MENCURI'
                    : (analysis.action === 'takeover' ? 'TAKEOVER' : 'SUCCESS');
                  dashboard.addSystemLog(
                    `[${actionLabel}] Listing untuk ${formatListingDate(targetDateObj)} berhasil terkirim ke ${targetJid} (Total: ${totalLatency}ms, Internal: ${internalLatency}ms, WA Ack: ${networkLatency}ms)`,
                    'success'
                  );
                  console.log(`[${actionLabel}] Listing terkirim ke ${targetJid} dalam ${totalLatency}ms (Internal: ${internalLatency}ms, WA Ack: ${networkLatency}ms)`);
                }).catch((err) => {
                  console.error('[ERROR] Gagal mengirim listing:', err);
                });
              }
            }
          }
        }

        // Asynchronous chat logging (non-blocking for message dispatch)
        dashboard.addChatLog({
          timestamp: Date.now(),
          sender: resolvedPhone !== normalizeId(senderJid)
            ? `${resolvedPhone} (${normalizeId(senderJid)})`
            : resolvedPhone,
          text,
          isDosen,
        });
      }
    } catch (err) {
      console.error('[ERROR] Gagal memproses pesan masuk:', err);
    }
  });
}

async function main() {
  await dashboard.start();
  await startBot();
}

main().catch(err => {
  console.error('[FATAL] Gagal memulai aplikasi:', err);
});
