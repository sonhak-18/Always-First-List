# Always First List - Panduan Operasional dan Teknis

Dokumen ini memuat panduan instalasi, konfigurasi berkas lingkungan, arsitektur logika siklus bimbingan, penggunaan konsol web lokal, mekanisme latar belakang Windows, serta penanganan kendala teknis.

---

## 1. Daftar Perintah Terminal

Semua perintah dijalankan di dalam direktori `wa-bimbingan-bot`:

| Perintah | Fungsi |
| :--- | :--- |
| `npm start` | Menjalankan bot di jendela terminal aktif (foreground) |
| `npm run autostart:on` | Mendaftarkan bot ke Windows Startup dan menjalankannya di latar belakang |
| `npm run autostart:off` | Menghapus bot dari Windows Startup dan mematikan proses di latar belakang |
| `npm run bg:start` | Menjalankan bot di latar belakang secara manual tanpa jendela terminal |
| `npm run bg:stop` | Menghentikan proses bot yang berjalan di latar belakang |
| `npm run clean` | Menghapus sesi lama Baileys jika baru saja logout dari WhatsApp ponsel |
| `npm run test:rules` | Menguji logika pencocokan kata kunci dan kalkulasi tanggal secara offline |

---

## 2. Alur Pemasangan dan Login Pertama Kali

```mermaid
flowchart TD
    Step1["1. Salin .env.example ke .env dan isi DOSEN_PHONE"] --> Step2["2. Jalankan npm start di terminal"]
    Step2 --> Step3["3. Pindai QR Code via menu Perangkat Tertaut di ponsel"]
    Step3 --> Step4["4. Salin ID JID grup yang dicetak bot di terminal"]
    Step4 --> Step5["5. Masukkan SOURCE_GROUP_JID dan TARGET_GROUP_JID ke .env"]
    Step5 --> Choice{"6. Tentukan Mode Operasi"}
    Choice -->|"Mode Terminal"| ModeA["npm start (Terminal aktif dan log langsung)"]
    Choice -->|"Mode Startup"| ModeB["npm run autostart:on (Otomatis saat PC menyala)"]
```

### Langkah Pemasangan:
1. Pastikan Node.js versi 18 atau lebih baru telah terpasang di komputer.
2. Pasang modul dependensi:
   ```bash
   npm install
   ```
3. Salin berkas konfigurasi sampel:
   ```bash
   copy .env.example .env
   ```
4. Buka berkas `.env` dan masukkan nomor WhatsApp dosen pembimbing:
   ```env
   DOSEN_PHONE=6281234567890
   ```
5. Jalankan bot di terminal untuk inisialisasi sesi WhatsApp:
   ```bash
   npm start
   ```
6. Buka aplikasi **WhatsApp di ponsel** > buka menu titik tiga (Android) atau Pengaturan (iOS) > pilih **Perangkat Tertaut** > pilih **Tautkan Perangkat**, lalu arahkan kamera ponsel ke QR Code yang muncul di terminal.
7. Setelah koneksi berhasil dibuat, bot membaca seluruh daftar grup WhatsApp yang Anda ikuti dan mencetaknya di layar terminal:
   ```text
   [INFO] Ditemukan grup WhatsApp:
   1. Bimbingan Skripsi Pak / Bu Dosen -> 120363xxxxxxxxxxxx@g.us
   2. Group Listing Bimbingan         -> 120363yyyyyyyyyyyy@g.us
   ```
8. Salin JID masing-masing grup ke berkas `.env`:
   ```env
   SOURCE_GROUP_JID=120363xxxxxxxxxxxx@g.us
   TARGET_GROUP_JID=120363yyyyyyyyyyyy@g.us
   ```
9. Tekan `Ctrl + C` pada terminal untuk menghentikan bot sementara, lalu jalankan kembali dalam mode pilihan Anda:
   - Mode interaktif: `npm start`
   - Mode otomatis menyala di latar belakang: `npm run autostart:on`

---

## 3. Rujukan Variabel Lingkungan (.env)

| Variabel | Format Wajib | Keterangan |
| :--- | :--- | :--- |
| `DOSEN_PHONE` | `628...` (angka saja) | Nomor WhatsApp dosen tanpa spasi, tanda tambah, atau tanda hubung |
| `SOURCE_GROUP_JID` | `...@g.us` | JID grup bimbingan tempat dosen mengumumkan kuota dan jadwal |
| `TARGET_GROUP_JID` | `...@g.us` | JID grup listing tempat bot otomatis mengirim format antrean |
| `LISTING_MEMBERS` | Teks dipisah koma | Daftar nama mahasiswa yang ditempatkan pada slot antrean |
| `COOLDOWN_MINUTES` | Angka bulat (menit) | Jeda waktu pengunci agar tidak mengirim pesan ganda jika dosen mengirim chat beruntun |
| `PORT` | Angka | Port HTTP server untuk Konsol Web lokal (standar: `3000`) |
| `HOST` | IP Address | Host interface listener (standar: `127.0.0.1` untuk isolasi loopback lokal) |

---

## 4. Keamanan dan Isolasi Sistem

Untuk menjamin keamanan data dan menjaga bot dari gangguan pihak luar:

1. **Isolasi Interface Loopback (Localhost Only)**:
   Server HTTP dan WebSocket dikunci secara default ke alamat `127.0.0.1`. Tindakan ini mencegah perangkat lain pada jaringan Wi-Fi/LAN publik atau kampus mengakses konsol web, riwayat chat, nomor telepon dosen, atau memindai kode QR WhatsApp Anda.
2. **Proteksi Cross-Site WebSocket Hijacking (Anti-CSWSH)**:
   Server menerapkan pengecekan header `Origin` pada tahap HTTP Upgrade sebelum koneksi WebSocket diterima (`verifyClient`). Permintaan koneksi WebSocket dari domain situs web lain yang dibuka di peramban otomatis ditolak dengan kode respon HTTP 403 Forbidden.
3. **Pencegahan ReDoS dan Validasi Regex**:
   Setiap kata kunci baru yang ditambahkan via konsol web divalidasi keabsahannya menggunakan fungsi `isValidRegex()`. Pada saat runtime, pemrosesan pesan dibungkus oleh `safeRegex()` sehingga kesalahan ekspresi reguler tidak menyebabkan proses Node.js mengalami crash atau hang.
4. **Sanitasi Skema Konfigurasi**:
   Semua pembaruan pengaturan melalui WebSocket melalui tahap validasi tipe data (`sanitizeConfig`) untuk mencegah injeksi nilai negatif atau polusi prototipe.
5. **Pengecualian Kredensial di Git**:
   Direktori kredensial Baileys (`auth_info_baileys/`), riwayat chat lokal (`logs_history.json`), dan berkas konfigurasi rahasia (`.env`) wajib selalu diabaikan oleh Git guna mencegah kebocoran sesi akun WhatsApp.

---

## 5. Logika Siklus dan Fleksibilitas Jadwal

Aplikasi menyediakan dua metode kalkulasi target antrean yang dapat dipilih melalui Konsol Web pada berkas `config.json`:

### Metode A: Siklus Maju / Advance Listing (`targetMode: "subsequent"`)
Prinsip kerja: **Pengiriman format antrean selalu mendahului pelaksanaan konfirmasi**. Chat konfirmasi kuota sesi berjalan berfungsi sebagai sinyal pemicu untuk langsung merebut kuota sesi berikutnya:

| Saat Dosen Konfirmasi di Hari | Sesi yang Berjalan | Target Listing yang Dibuka Bot |
| :--- | :--- | :--- |
| **Minggu atau Senin** | Bimbingan Senin | **Rabu minggu berjalan** |
| **Selasa atau Rabu** | Bimbingan Rabu | **Senin minggu berikutnya** |
| **Dosen menyebut hari khusus** | - | **Hari spesifik yang disebut dosen** |

### Metode B: Sesi Terdekat / Diumumkan (`targetMode: "immediate"`)
Prinsip kerja: **Pengiriman format antrean ditujukan langsung untuk sesi yang diumumkan**. Saat dosen membuka kuota (misal: *"Besok bimbingan ya kuota 6 orang"* atau chat konfirmasi di hari bimbingan), bot langsung mendaftarkan antrean untuk sesi terdekat tersebut tanpa melompat ke siklus berikutnya.

### Fleksibilitas Frekuensi Hari Bimbingan:
Bot tidak dibatasi hanya pada 2 hari sepekan. Sistem mendukung konfigurasi hari apa pun:
- **1x sepekan** (contoh: Jumat saja): Setiap konfirmasi otomatis membuka jadwal Jumat berikutnya.
- **2x sepekan** (contoh: Senin & Rabu, atau Selasa & Kamis).
- **3x sepekan atau lebih** (contoh: Senin, Rabu, & Jumat): Bot otomatis berputar maju secara sekuensial antar sesi yang aktif.

### Aturan Tambahan:
- **Pengalihan Jadwal (Redirect)**: Jika dosen mengirim pesan semacam *"Senin nggak bisa, bisanya rabu ya"*, mesin aturan mendeteksi pola kata kunci pengalihan dan menetapkan target bimbingan ke hari spesifik yang ditunjuk dosen terlepas dari mode yang aktif.
- **Pembatalan Sesi Terdekat (Cancellation)**: Jika dosen mengumumkan pembatalan untuk sesi terdekat (contoh: *"Besok saya tidak bisa bimbingan"*), bot tidak mengabaikan pesan tersebut, melainkan langsung membuka dan mengirimkan format antrean untuk jadwal berikutnya agar slot tetap terkunci lebih awal.
- **Dosen Berhalangan Panjang (Blacklist)**: Jika dosen mengumumkan tugas luar kota atau libur panjang (contoh: *"Besok sampai minggu depan saya ada penugasan luar kota"*), pesan diblokir oleh blacklist sehingga bot tidak mengirim pesan apa pun.

---

## 6. Konsol Web Lokal (http://localhost:3000)

Konsol web dapat diakses melalui peramban web pada alamat `http://localhost:3000` selama bot berjalan (baik mode terminal maupun mode latar belakang).

### Fitur Antarmuka:
1. **Live Activity Stream**: Memantau pesan masuk dari grup bimbingan secara real-time melalui WebSocket. Pesan yang berasal dari nomor dosen ditandai dengan badge `[DOSEN]` berwarna kuning.
2. **Aksi Cepat Kata Kunci**: Setiap baris chat yang masuk menyediakan tombol pintas:
   - `+ Whitelist`: Memasukkan teks pesan ke daftar pemicu bimbingan.
   - `+ Blacklist`: Memasukkan teks pesan ke daftar filter penolakan.
3. **Active Dictionary**: Menampilkan dan mengedit daftar kata kunci aktif (`whitelist`, `blacklist`, `cancellation`, `redirect`). Setiap kata kunci baru otomatis divalidasi format regex-nya sebelum disimpan ke `dictionary.json`.
4. **Jadwal & Format Pesan (Tab Pengaturan)**:
   - Memilih hari siklus bimbingan aktif (bisa 1 hari, 2 hari, atau lebih).
   - Memilih mode sasaran listing (`subsequent` untuk sesi berikutnya atau `immediate` untuk sesi terdekat).
   - Menyesuaikan template teks listing antrean dengan variabel:
     - `{date}`: Tanggal bimbingan berformat bahasa Indonesia.
     - `{day}`: Nama hari bimbingan.
     - `{members}`: Daftar berurutan nama anggota (`1. Nama... \n 2. Nama...`).
     - `{members_raw}`: Daftar nama dipisahkan koma.
     - Tombol pintas `+ Enter (Baris Baru)` serta dukungan langsung tombol keyboard Enter.
     - Sistem secara otomatis menormalkan penulisan kode baris baru literal (`\n` maupun `/n`) menjadi baris baru nyata.
   - Perubahan disimpan langsung ke `config.json` via WebSocket tanpa memerlukan restart bot.
5. **Testing Sandbox**: Formulir pengujian kalimat dosen secara offline. Masukkan kalimat simulasi untuk memverifikasi apakah pesan tersebut memicu aksi, diblokir blacklist, atau mengalihkan tanggal antrean.
6. **Pembersihan Log**: Tombol pembersih log untuk mengosongkan riwayat tampilan sekaligus mereset berkas penyimpanan `logs_history.json`.

---

## 7. Mekanisme Latar Belakang dan Autostart Windows

Fitur autostart memungkinkan bot aktif secara otomatis tanpa memunculkan jendela terminal hitam setiap kali komputer dinyalakan atau pengguna melakukan login Windows.

### Komponen Penggerak:
- **Runner VBScript Latar Belakang**:
  `always-first-list-autostart.vbs` dan `run-hidden.vbs` mengeksekusi perintah `node src/index.js` dengan opsi jendela tersembunyi (window style 0).
- **Pintasan Startup Windows**:
  Pintasan disimpan pada direktori:
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Always First List.lnk`
- **Pembersihan Port Otomatis (`releasePort`)**:
  Setiap kali bot dimulai, fungsi `releasePort` memeriksa apakah port 3000 sedang dikunci oleh proses Node.js sebelumnya. Jika ya, proses lama dihentikan secara otomatis agar server konsol web dapat langsung berjalan tanpa kendala `EADDRINUSE`.

### Cara Mengelola:
- Mengaktifkan autostart saat Windows booting:
  ```bash
  npm run autostart:on
  ```
- Menonaktifkan autostart dan mematikan bot:
  ```bash
  npm run autostart:off
  ```
- Menjalankan secara manual di latar belakang:
  ```bash
  npm run bg:start
  ```
- Menghentikan proses latar belakang secara manual:
  ```bash
  npm run bg:stop
  ```
- Memeriksa proses yang sedang berjalan melalui PowerShell:
  ```powershell
  Get-Process node
  ```

---

## 8. Penanganan Kendala Teknis

### Kendala 1: Kode QR Tidak Muncul Setelah Akun Dikeluarkan dari Ponsel
- **Penyebab**: Kredensial autentikasi lama di folder `auth_info_baileys` sudah tidak valid sehingga server WhatsApp menolak jabat tangan koneksi.
- **Penyelesaian**:
  1. Hentikan seluruh proses bot:
     ```bash
     npm run bg:stop
     ```
  2. Hapus sesi lama:
     ```bash
     npm run clean
     ```
  3. Jalankan kembali bot di terminal:
     ```bash
     npm start
     ```
  4. Pindai kode QR baru yang muncul.

### Kendala 2: Galat Port EADDRINUSE (Address Already in Use :::3000)
- **Penyebab**: Terdapat proses Node.js lain yang masih menempati port 3000.
- **Penyelesaian**:
  Jalankan perintah penghenti proses bawaan:
  ```bash
  npm run bg:stop
  ```
  Atau hentikan seluruh proses Node.js melalui PowerShell:
  ```powershell
  Stop-Process -Name node -Force -ErrorAction SilentlyContinue
  ```

### Kendala 3: Bot Tidak Merespons Pesan Dosen
- **Penyebab**:
  1. Format nomor `DOSEN_PHONE` pada berkas `.env` belum sesuai format numerik internasional (misal masih diawali angka 0 atau memakai tanda tambah).
  2. Identitas pengirim pada grup WhatsApp dienkripsi menggunakan format Linked Identity (LID) privasi.
- **Penyelesaian**:
  Pastikan nomor pada berkas `.env` menggunakan format angka penuh: `628xxxxxxxxxx`. Bot sudah mengimplementasikan pemetaan balik LID (`lid-mapping_reverse.json`) dan pembacaan metadata peserta grup secara otomatis untuk mengidentifikasi nomor telepon asli dosen di balik identitas LID.

### Kendala 4: Pengiriman Berulang Akibat Dosen Mengetik Berturut-turut
- **Penyelesaian**: Bot menerapkan batas jeda waktu melalui variabel `COOLDOWN_MINUTES` (bawaan: 15 menit). Setelah mengirim antrean pertama, bot mengabaikan seluruh pesan dosen selama durasi jeda tersebut agar grup target tidak menerima pesan duplikat.
