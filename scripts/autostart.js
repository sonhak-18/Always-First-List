const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STARTUP_DIR = path.resolve(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup');
const SHORTCUT_NAME = 'Always First List.lnk';
const SHORTCUT_PATH = path.join(STARTUP_DIR, SHORTCUT_NAME);
const PROJECT_DIR = path.resolve(__dirname, '..');
const RUNNER_VBS_PATH = path.join(PROJECT_DIR, 'always-first-list-autostart.vbs');

const KNOWN_SHORTCUTS = [
  SHORTCUT_PATH,
  path.join(STARTUP_DIR, 'AlwaysFirstList.lnk'),
  path.join(STARTUP_DIR, 'WaBimbinganBot.lnk'),
  path.join(STARTUP_DIR, 'wa-bimbingan-bot.lnk')
];

const action = process.argv[2];

function removeAllShortcuts() {
  for (const file of KNOWN_SHORTCUTS) {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (err) {}
    }
  }
}

function stopRunningBot() {
  try {
    const psCmd = 'Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }';
    execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'ignore' });
  } catch (err) {}
}

function startBackgroundBot() {
  stopRunningBot();
  try {
    execSync(`wscript.exe "${RUNNER_VBS_PATH}"`, { stdio: 'ignore' });
  } catch (err) {}
}

if (action === 'enable') {
  removeAllShortcuts();

  const nodePath = process.execPath;
  const entryPath = path.join(PROJECT_DIR, 'src', 'index.js');
  const vbsContent = `Set WshShell = CreateObject("WScript.Shell")\r\nWshShell.CurrentDirectory = "${PROJECT_DIR}"\r\nWshShell.Run """${nodePath}"" ""${entryPath}""", 0, False\r\n`;
  fs.writeFileSync(RUNNER_VBS_PATH, vbsContent, 'utf-8');

  const psCommand = `$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${SHORTCUT_PATH.replace(/'/g, "''")}'); $s.TargetPath = 'wscript.exe'; $s.Arguments = [char]34 + '${RUNNER_VBS_PATH.replace(/'/g, "''")}' + [char]34; $s.WorkingDirectory = '${PROJECT_DIR.replace(/'/g, "''")}'; $s.WindowStyle = 7; $s.Save()`;

  try {
    execSync(`powershell -NoProfile -Command "${psCommand}"`, { stdio: 'inherit' });
    console.log('[AUTOSTART] Sukses terdaftar di Windows Startup:');
    console.log(`- Shortcut: ${SHORTCUT_PATH}`);
    console.log(`- Runner  : ${RUNNER_VBS_PATH}`);
    startBackgroundBot();
    console.log('[STATUS] Bot telah dijalankan di latar belakang.');
    console.log('Buka http://localhost:3000 di browser untuk melihat konsol.');
  } catch (err) {
    console.error('[ERROR] Gagal mendaftarkan auto-start:', err.message);
  }
} else if (action === 'disable') {
  removeAllShortcuts();
  console.log('[AUTOSTART] Shortcut di Windows Startup telah dibersihkan.');
  stopRunningBot();
  console.log('[STATUS] Bot di latar belakang telah dihentikan.');
} else if (action === 'start') {
  startBackgroundBot();
  console.log('[STATUS] Always First List aktif di latar belakang.');
  console.log('Buka http://localhost:3000 di browser.');
} else if (action === 'stop') {
  stopRunningBot();
  console.log('[STATUS] Always First List di latar belakang telah dimatikan.');
} else {
  console.log('Penggunaan:');
  console.log('  npm run autostart:on   (Aktifkan auto-start Windows)');
  console.log('  npm run autostart:off  (Matikan auto-start Windows)');
}
