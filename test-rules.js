const { analyzeMessage } = require('./src/rules');
const { generateListingText, getContextDate } = require('./src/dateHelper');
const dayjs = require('dayjs');

// Reference date: Tuesday 27 October 2026
const SIMULATED_BASE_DATE = dayjs('2026-10-27T14:00:00.000Z');
const WEDNESDAY_SESSION = '2026-10-28';

const testCases = [
  {
    desc: 'H-1: Dosen konfirmasi bimbingan besok, tapi KELOMPOK KITA SUDAH TERDAFTAR (Kasus komplain kemarin)',
    chat: 'Waktunya masih sama ya. Utk besok 5 mhswa. 2 utk 2024 dan 3 utk 2023.',
    options: {
      registeredSessionDate: WEDNESDAY_SESSION,
      baseDate: SIMULATED_BASE_DATE,
      sessionDays: ['senin', 'rabu'],
    },
  },
  {
    desc: 'H-1: Dosen batalkan sesi besok, dan KELOMPOK KITA SUDAH TERDAFTAR (Takeover sesi berikutnya)',
    chat: 'Mohon maaf besok saya gak bisa ya',
    options: {
      registeredSessionDate: WEDNESDAY_SESSION,
      baseDate: SIMULATED_BASE_DATE,
      sessionDays: ['senin', 'rabu'],
    },
  },
  {
    desc: 'Dosen membuka kuota baru dan KITA BELUM TERDAFTAR (Approval Normal)',
    chat: 'Silahkan ya. Utk 6 mhswa. InshaAllah.',
    options: {
      registeredSessionDate: null,
      baseDate: SIMULATED_BASE_DATE,
      sessionDays: ['senin', 'rabu'],
    },
  },
  {
    desc: 'Dosen berhalangan panjang (Luar Kota)',
    chat: 'Mohon maaf besok - minggu saya ada penugasan luar kota 🙏🏼',
  },
  {
    desc: 'Dosen berhalangan dengan rentang waktu',
    chat: 'Mohon maaf bimbingan tidak bisa sampai minggu depan ya',
  },
  {
    desc: 'Dosen mengalihkan hari (Senin nggak bisa, bisanya rabu)',
    chat: 'hari senin nggak bisa, bisanya rabu ya',
  },
  {
    desc: 'Dosen ganti hari dengan jam',
    chat: 'Mohon maaf hari ini libur, jadinya rabu jam 09.00 ya',
  },
  {
    desc: 'Chat biasa di luar bimbingan',
    chat: 'Selamat pagi semuanya, laporan minggu lalu tolong dicek kembali.',
  },
];

console.log('SIMULASI ANALISIS PESAN DOSEN');
testCases.forEach((tc, idx) => {
  console.log(`\n[${idx + 1}] ${tc.desc}`);
  console.log(`Pesan: "${tc.chat}"`);

  const result = analyzeMessage(tc.chat, tc.options);
  console.log(`Aksi  : ${result.action || (result.shouldTrigger ? 'trigger' : 'ignore')}`);
  console.log(`Lolos : ${result.shouldTrigger ? 'YA' : 'TIDAK'}`);
  console.log(`Alasan: ${result.reason}`);

  if (result.shouldTrigger) {
    console.log(`Target: ${result.targetDay || 'Siklus Berikutnya'}`);
    console.log(generateListingText(result.targetDay, ['Nama 1', 'Nama 2', 'Nama 3'], tc.options?.baseDate));
  }
});
