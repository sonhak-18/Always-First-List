const { performance } = require('perf_hooks');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { analyzeMessage } = require('../src/rules');
const { generateListingText, getTargetDate } = require('../src/dateHelper');
const { getConfig } = require('../src/config');

const DOSEN_PHONE = (process.env.DOSEN_PHONE || '628113491283').replace(/[^0-9]/g, '');
const MEMBERS = (process.env.LISTING_MEMBERS || 'Fawaid, Jeremy, Christopher').split(',').map(m => m.trim());
const config = getConfig();

function normalizeId(jid) {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

function checkIsDosen(senderJid, targetDosen) {
  if (!targetDosen) return false;
  const target = targetDosen.replace(/[^0-9]/g, '');
  const senderId = normalizeId(senderJid);
  if (senderId === target) return true;
  const targetZero = target.replace(/^62/, '0');
  const senderZero = senderId.replace(/^62/, '0');
  return targetZero === senderZero;
}

function runFullPipeline(text, senderJid) {
  const isDosen = checkIsDosen(senderJid, DOSEN_PHONE);
  if (!isDosen) return null;

  const analysis = analyzeMessage(text, {
    registeredSessionDate: config.registeredSessionDate,
    sessionDays: config.sessionDays,
    targetMode: config.targetMode,
  });

  if (analysis.action === 'standby') {
    return { action: 'standby' };
  }

  if (analysis.shouldTrigger) {
    const targetDateObj = getTargetDate(
      analysis.targetDay,
      null,
      config.sessionDays,
      config.targetMode,
      analysis.isCancellation
    );
    const listingMessage = generateListingText(
      analysis.targetDay,
      MEMBERS,
      null,
      config.messageTemplate,
      config.sessionDays,
      config.targetMode,
      analysis.isCancellation
    );
    return { action: analysis.action, text: listingMessage, targetDate: targetDateObj.format('YYYY-MM-DD') };
  }

  return { action: 'ignored' };
}

function benchmarkScenario(name, messageText, senderJid, iterations = 10000) {
  for (let i = 0; i < 500; i++) {
    runFullPipeline(messageText, senderJid);
  }

  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    runFullPipeline(messageText, senderJid);
    const t1 = performance.now();
    times.push((t1 - t0) * 1000); // in microseconds (µs)
  }

  times.sort((a, b) => a - b);
  const sum = times.reduce((acc, v) => acc + v, 0);
  const mean = sum / times.length;
  const median = times[Math.floor(times.length * 0.5)];
  const p90 = times[Math.floor(times.length * 0.9)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const min = times[0];
  const max = times[times.length - 1];

  return {
    name,
    iterations,
    minUs: min.toFixed(2),
    meanUs: mean.toFixed(2),
    medianUs: median.toFixed(2),
    p95Us: p95.toFixed(2),
    p99Us: p99.toFixed(2),
    maxUs: max.toFixed(2),
    meanMs: (mean / 1000).toFixed(4),
    medianMs: (median / 1000).toFixed(4),
    p99Ms: (p99 / 1000).toFixed(4),
  };
}

const scenarios = [
  {
    name: 'Real Lecturer Trigger (Pesan Asli Bu Tias)',
    text: 'Waktunya masih sama ya. Utk besok 5 mhswa. 2 utk 2024 dan 3 utk 2023.',
    sender: '628113491283@s.whatsapp.net',
  },
  {
    name: 'Standard Whitelist Trigger',
    text: 'Silahkan ya utk besok bimbingan 6 orang. InshaAllah jam 09.00.',
    sender: '628113491283@s.whatsapp.net',
  },
  {
    name: 'Redirect Trigger (Ganti Hari)',
    text: 'Mohon maaf hari ini nggak bisa, bisanya rabu ya.',
    sender: '628113491283@s.whatsapp.net',
  },
  {
    name: 'Cancellation / Takeover Trigger',
    text: 'Mohon maaf besok saya gak bisa ya, bimbingan batal.',
    sender: '628113491283@s.whatsapp.net',
  },
  {
    name: 'Non-Lecturer Chat (Fast Discard)',
    text: 'Selamat malam teman-teman, reminder besok ada kuliah jam 7.',
    sender: '6285336633837@s.whatsapp.net',
  },
];

console.log('='.repeat(75));
console.log('ALWAYS FIRST LIST - IN-MEMORY PIPELINE BENCHMARK (10.000x Iterations)');
console.log('='.repeat(75));

const results = scenarios.map(s => benchmarkScenario(s.name, s.text, s.sender, 10000));
console.table(results.map(r => ({
  Skenario: r.name,
  'Rata-rata (ms)': r.meanMs + ' ms',
  'Median (ms)': r.medianMs + ' ms',
  'p99 (ms)': r.p99Ms + ' ms',
  'Rata-rata (µs)': r.meanUs + ' µs',
  'Min (µs)': r.minUs + ' µs',
  'Max (µs)': r.maxUs + ' µs',
})));

console.log('\nKOMPONEN-PER-KOMPONEN BREAKDOWN:');
const sampleText = 'Waktunya masih sama ya. Utk besok 5 mhswa. 2 utk 2024 dan 3 utk 2023.';

let t0 = performance.now();
for (let i = 0; i < 100000; i++) checkIsDosen('628113491283@s.whatsapp.net', DOSEN_PHONE);
let t1 = performance.now();
console.log(`1. checkIsDosen()             : ${(((t1 - t0) / 100000) * 1000).toFixed(3)} µs per call`);

t0 = performance.now();
for (let i = 0; i < 100000; i++) {
  analyzeMessage(sampleText, { sessionDays: ['senin', 'rabu'], targetMode: 'subsequent' });
}
t1 = performance.now();
console.log(`2. analyzeMessage() (Regex)   : ${(((t1 - t0) / 100000) * 1000).toFixed(3)} µs (${(((t1 - t0) / 100000)).toFixed(4)} ms)`);

t0 = performance.now();
for (let i = 0; i < 100000; i++) {
  generateListingText(null, MEMBERS, null, config.messageTemplate, ['senin', 'rabu'], 'subsequent', false);
}
t1 = performance.now();
console.log(`3. generateListingText() (Tpl): ${(((t1 - t0) / 100000) * 1000).toFixed(3)} µs (${(((t1 - t0) / 100000)).toFixed(4)} ms)`);
