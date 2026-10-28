const { analyzeMessage } = require('./src/rules');
const { generateListingText } = require('./src/dateHelper');

const testCases = [
  {
    desc: 'Dosen membatalkan sesi terdekat saja (Besok gak bisa)',
    chat: 'Mohon maaf besok saya gak bisa ya',
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
    desc: 'Dosen membuka kuota 6 mhs (Approval Normal)',
    chat: 'Silahkan ya. Utk 6 mhswa. InshaAllah.',
  },
  {
    desc: 'Dosen menentukan jam dan kuota angkatan',
    chat: 'InshaAllah masih sama jamnya ya. 3 utk 2024 dan 3 utk 2023.',
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

  const result = analyzeMessage(tc.chat);
  console.log(`Lolos : ${result.shouldTrigger ? 'YA' : 'TIDAK'}`);
  console.log(`Alasan: ${result.reason}`);

  if (result.shouldTrigger) {
    console.log(`Target: ${result.targetDay || 'Siklus Berikutnya'}`);
    console.log(generateListingText(result.targetDay, ['Nama 1', 'Nama 2', 'Nama 3']));
  }
});
