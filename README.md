# Always First List

Otomatisasi WhatsApp berbasis Node.js dan Baileys untuk mendeteksi pengumuman kuota bimbingan dosen pada grup sumber, lalu mengirimkan format antrean mahasiswa ke grup target secara instan. Dilengkapi antarmuka web lokal berbasis WebSocket untuk pemantauan langsung, pengaturan jadwal fleksibel, penyesuaian template pesan, dan manajemen kamus kata kunci.

---

## Prasyarat Sistem

Sebelum memasang aplikasi, pastikan sistem telah memenuhi ketentuan berikut:

1. **Node.js**: Versi 18.x atau lebih baru.
2. **Sistem Operasi**: Windows 10/11 (diperlukan untuk runner VBS latar belakang dan autostart).
3. **Akun WhatsApp Aktif**: Perangkat ponsel yang memiliki akses ke grup bimbingan dan grup target antrean.
4. **Git**: Untuk mengunduh dan memperbarui repositori.

---

## Panduan Pemasangan dan Pengaturan Cepat

### 1. Salin Repositori
Buka terminal (PowerShell atau Command Prompt), lalu unduh repositori:
```bash
git clone https://github.com/sonhak-18/Always-First-List.git
cd Always-First-List
```

### 2. Pasang Ketergantungan
Jalankan pemasangan pustaka dependensi:
```bash
npm install
```

### 3. Siapkan Berkas Konfigurasi (.env)
Salin berkas sampel `.env.example` menjadi `.env`:
```bash
copy .env.example .env
```
Buka berkas `.env` dengan text editor, lalu masukkan nomor WhatsApp dosen pembimbing:
```env
# Nomor WhatsApp Dosen (angka saja dengan kode negara, tanpa tanda + atau spasi)
DOSEN_PHONE=6281234567890

# Grup sumber dan target (diisi setelah langkah 4)
SOURCE_GROUP_JID=
TARGET_GROUP_JID=

# Anggota tim untuk antrean (dipisahkan koma)
LISTING_MEMBERS=Nama Mahasiswa 1, Nama Mahasiswa 2, Nama Mahasiswa 3

# Cooldown anti-spam (menit)
COOLDOWN_MINUTES=15

# Host dan Port Konsol Web Lokal (terikat ke 127.0.0.1 untuk keamanan)
PORT=3000
HOST=127.0.0.1
```

### 4. Tautkan Akun WhatsApp dan Ambil ID Grup
Jalankan bot pada jendela terminal:
```bash
npm start
```
1. Pindai kode QR yang muncul pada layar terminal menggunakan aplikasi WhatsApp di ponsel (menu **Perangkat Tertaut** > **Tautkan Perangkat**).
2. Setelah sesi terhubung, bot membaca daftar grup WhatsApp yang Anda ikuti dan mencetaknya ke konsol:
   ```text
   [INFO] Ditemukan grup WhatsApp:
   1. Bimbingan Skripsi Pak / Bu Dosen -> 120363xxxxxxxxxxxx@g.us
   2. Group Listing Bimbingan         -> 120363yyyyyyyyyyyy@g.us
   ```
3. Salin JID grup yang relevan ke dalam berkas `.env`:
   - `SOURCE_GROUP_JID`: JID grup tempat dosen memberikan pengumuman jadwal bimbingan.
   - `TARGET_GROUP_JID`: JID grup tempat bot harus mengirimkan teks antrean mahasiswa.
4. Hentikan bot di terminal dengan menekan tombol `Ctrl + C`.

---

## Pilihan Menjalankan Bot

Pilih salah satu mode pengoperasian sesuai kebutuhan:

### Mode 1: Terminal Interaktif (Foreground)
Menjalankan bot langsung pada terminal aktif. Mode ini berguna saat ingin melihat log Baileys secara mendetail:
```bash
npm start
```
Akses konsol pemantau di peramban web melalui `http://localhost:3000`.

### Mode 2: Latar Belakang Windows (Tanpa Jendela Terminal)
Menjalankan bot sebagai proses background Windows secara tersembunyi tanpa jendela terminal:
```bash
npm run bg:start    # Menjalankan proses latar belakang
npm run bg:stop     # Menghentikan proses latar belakang
```

### Mode 3: Autostart Windows (Menyala Otomatis saat Booting)
Mendaftarkan bot ke folder Startup Windows agar otomatis aktif di latar belakang setiap kali komputer dinyalakan:
```bash
npm run autostart:on     # Pasang pintasan Startup dan aktifkan bot
npm run autostart:off    # Hapus dari Startup dan matikan proses bot
```

---

## Perintah Perawatan dan Pengujian

| Perintah | Deskripsi |
| :--- | :--- |
| `npm run test:rules` | Menguji logika aturan whitelist, blacklist, redirect, dan kalkulasi tanggal tanpa terhubung ke WhatsApp. |
| `npm run clean` | Menghapus folder kredensial sesi (`auth_info_baileys`) untuk login ulang jika akun terputus dari ponsel. |

---

## Konsol Web Lokal (Port 3000)

Saat bot berjalan, buka peramban di `http://localhost:3000` untuk memanfaatkan fitur konsol:

- **Live Activity Stream**: Memantau pesan masuk dari grup bimbingan secara langsung dengan badge penanda dosen.
- **Active Dictionary**: Menambah atau menghapus kata kunci whitelist, blacklist, redirect, dan cancellation secara dinamis tanpa restart.
- **Fleksibilitas Hari Siklus**: Memilih kombinasi hari bimbingan mingguan (misal Senin dan Rabu, atau Senin, Rabu, dan Jumat).
- **Mode Sasaran Listing**:
  - `subsequent`: Mendaftarkan antrean untuk sesi siklus berikutnya (Advance Listing).
  - `immediate`: Mendaftarkan antrean langsung untuk sesi terdekat yang diumumkan dosen.
- **Format Pesan Kustom**: Mengatur susunan teks listing pesan dengan variabel:
  - `{date}`: Tanggal bimbingan dalam format Indonesia (contoh: `Senin, 02 November 2026`).
  - `{day}`: Nama hari bimbingan (contoh: `Senin`).
  - `{members}`: Daftar anggota berurutan dengan nomor baris (`1. Nama... \n 2. Nama...`).
  - `{members_raw}`: Daftar nama anggota dipisahkan koma (`Nama 1, Nama 2`).
  - Tombol pintas `+ Enter (Baris Baru)` untuk membuat baris baru langsung di template.
- **Testing Sandbox**: Menguji kalimat chat dosen secara visual untuk memastikan deteksi filter, tanggal sasaran, dan hasil teks listing.
- **Log Persistence**: Riwayat chat dan trigger tersimpan otomatis di disk lokal (`logs_history.json`).

---

## Aspek Keamanan Sistem

1. **Isolasi Loopback Jaringan**: Server dashboard terikat khusus ke `127.0.0.1` (localhost), mencegah akses dari perangkat lain pada jaringan Wi-Fi/LAN yang sama.
2. **Proteksi WebSocket (Anti-CSWSH)**: Menggunakan verifikasi handshake HTTP Upgrade untuk memblokir koneksi dari origin situs web eksternal yang tidak dikenal.
3. **Penyaringan Regex**: Seluruh input kata kunci divalidasi keabsahan sintaks ekspresi regulernya sebelum disimpan untuk mencegah error fatal saat runtime.
4. **Validasi Konfigurasi**: Input konfigurasi disaring menggunakan whitelist ketat guna mencegah injeksi properti liar.
5. **Kerahasian Kredensial**: Sesi WhatsApp (`auth_info_baileys/`), berkas riwayat, dan `.env` otomatis diabaikan oleh Git.

---

## Dokumentasi Teknis Lanjutan

Penjelasan detail perihal kalkulasi siklus bimbingan akademik, penanganan pembatalan jadwal, mekanisme proteksi konflik port, dan panduan pemecahan masalah tersedia pada berkas [DOKUMENTASI.md](DOKUMENTASI.md).
