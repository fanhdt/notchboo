# Notchboo

<p align="center">
  <strong>A tiny desktop companion with a little Bangboo energy.</strong>
  <br />
  A Dynamic Island-inspired desktop application for Windows, built with Tauri, Rust, and React.
</p>

<p align="center">
  <a href="#-bahasa-indonesia">🇮🇩 Bahasa Indonesia</a>
  &nbsp;•&nbsp;
  <a href="#-english">🇬🇧 English</a>
</p>

---

<a id="-bahasa-indonesia"></a>

# 🇮🇩 Bahasa Indonesia

## Tentang Notchboo

**Notchboo** adalah aplikasi desktop Windows yang terinspirasi dari konsep Dynamic Island. Aplikasi ini menghadirkan sebuah island interaktif di bagian atas layar untuk menampilkan informasi, aktivitas, dan berbagai utilitas tanpa harus membuka banyak jendela.

Notchboo menggabungkan interaksi minimalis ala Dynamic Island dengan sentuhan karakter game yang ekspresif. Tujuannya sederhana: membuat informasi penting lebih mudah diakses, sekaligus memberikan sedikit karakter pada desktop.

### 🐱 Kenapa Bangboo?

Untuk saat ini, Notchboo menggunakan **Bangboo dari Zenless Zone Zero** sebagai maskot sementara.

Alasannya cukup sederhana: Notchboo belum memiliki maskot orisinal. Daripada memaksakan karakter yang belum punya identitas visual, aku memilih menggunakan Bangboo sebagai inspirasi awal untuk menghadirkan sedikit kehidupan ke dalam aplikasi.

Penggunaan ini merupakan bagian dari proyek personal dan bukan produk resmi, kolaborasi, atau afiliasi dengan HoYoverse. Identitas maskot orisinal Notchboo masih menjadi bagian dari rencana pengembangan ke depan.

## ✨ Fitur

### Interactive Island

- Mode Compact dan Expanded.
- Ekspansi otomatis ketika kursor diarahkan ke island.
- Peek Mode untuk menyusutkan island ketika aplikasi lain sedang aktif.
- Bangboo dapat sesekali mengintip ketika island berada dalam Peek Mode.
- Pengaturan perilaku Peek Mode melalui system tray.

### Bangboo

- Animasi mata, berkedip, dan mengedipkan sebelah mata.
- Mengikuti pergerakan kursor.
- Memiliki kondisi idle, mengantuk, dan tidur.
- Ekspresi sederhana untuk memberikan karakter pada island.

### Media Player

- Integrasi dengan Windows Media Session.
- Menampilkan judul lagu, artis, album, dan artwork.
- Kontrol playback dan seek.
- Dukungan tampilan lirik.

### System Monitor

- Monitoring CPU dan RAM.
- Informasi penggunaan disk.
- Kecepatan jaringan download dan upload.
- Informasi baterai dan status pengisian daya.

### Pomodoro

- Sesi fokus dan istirahat.
- Start, pause, reset, dan skip.
- Pergantian fase otomatis.
- Notifikasi ketika sesi selesai.

### Water Reminder

- Target konsumsi air harian.
- Pencatatan jumlah gelas.
- Pengingat dengan interval yang dapat diatur.
- Fitur snooze untuk menunda pengingat.

### Quick Shelf

Tempat penyimpanan sementara untuk berbagai hal yang sering dibutuhkan.

- Menyimpan file, catatan, dan snippet.
- Drag and drop file.
- Pencarian dan filter item.
- Pin item penting.
- Membuka, menampilkan lokasi, atau menyalin item.
- Masa kedaluwarsa dan pembersihan otomatis.
- Penyimpanan lokal menggunakan SQLite.

## 🛠️ Tech Stack

| Bagian              | Teknologi      |
| ------------------- | -------------- |
| Desktop Framework   | Tauri 2        |
| Backend             | Rust           |
| Frontend            | React 19       |
| Language            | TypeScript     |
| Styling             | Tailwind CSS 4 |
| Animation           | Motion         |
| Build Tool          | Vite           |
| Database            | SQLite         |
| System Monitoring   | sysinfo        |
| Windows Integration | Windows API    |

## 🚀 Instalasi dan Development

### Persyaratan

Pastikan perangkat sudah memiliki:

- Windows 10 atau Windows 11.
- Node.js dan npm.
- Rust toolchain.
- Microsoft C++ Build Tools.
- WebView2 Runtime.

### 1. Clone repository

```bash
git clone https://github.com/fanhdt/notchboo.git
cd notchboo
```

### 2. Install dependencies

```bash
npm install
```

### 3. Jalankan development mode

```bash
npm run tauri dev
```

### 4. Build aplikasi

```bash
npm run tauri build
```

Hasil build aplikasi akan tersedia di direktori output Tauri.

## 📁 Struktur Project

```text
notchboo/
├── src/
│   ├── components/
│   │   └── island/
│   ├── hooks/
│   ├── pages/
│   │   ├── island/
│   │   └── shelf/
│   └── App.tsx
│
├── src-tauri/
│   └── src/
│       ├── shelf/
│       ├── activity.rs
│       ├── foreground.rs
│       ├── island.rs
│       ├── tray.rs
│       ├── window.rs
│       └── lib.rs
│
├── package.json
└── README.md
```

## 🗺️ Roadmap

Notchboo masih dalam tahap pengembangan. Beberapa hal yang ingin dikembangkan selanjutnya:

- [ ] Maskot orisinal Notchboo.
- [ ] Activity Manager dengan sistem prioritas.
- [ ] Respons ekspresi Bangboo berdasarkan aktivitas aplikasi.
- [ ] Penanganan exclusive fullscreen.
- [ ] Dukungan multi-monitor yang lebih baik.
- [ ] Penyempurnaan desain dan animasi.
- [ ] Sistem notifikasi dan attention management.

## 📌 Status Project

Notchboo merupakan proyek personal yang masih aktif dikembangkan. Fitur dan desain dapat berubah seiring proses pengembangan.

## 📄 License

Belum ada lisensi open-source yang ditetapkan untuk repository ini.

---

<a id="-english"></a>

# 🇬🇧 English

## About Notchboo

**Notchboo** is a Windows desktop application inspired by the Dynamic Island concept. It brings an interactive island to the top of your screen, providing quick access to information, activities, and useful utilities without opening multiple windows.

Notchboo combines the minimal interaction style of Dynamic Island with a playful game-inspired personality.

The goal is simple: make important information more accessible while bringing a little character to your desktop.

### 🐱 Why Bangboo?

For now, Notchboo uses **Bangboo from Zenless Zone Zero** as its temporary mascot.

The reason is simple: Notchboo does not have an original mascot yet. Rather than forcing a visual identity that has not been fully developed, Bangboo serves as an initial inspiration to bring some personality to the application.

This is a personal project and is not an official product, collaboration, or affiliation with HoYoverse. An original Notchboo mascot remains part of the future development plan.

## ✨ Features

### Interactive Island

- Compact and Expanded modes.
- Automatic expansion on cursor hover.
- Peek Mode when another application is active.
- Occasional Bangboo peek animations.
- Peek behavior settings through the system tray.

### Bangboo

- Eye animations, blinking, and winking.
- Cursor-following gaze.
- Idle, drowsy, and sleeping states.
- Simple expressions that bring personality to the island.

### Media Player

- Windows Media Session integration.
- Track title, artist, album, and artwork.
- Playback controls and seeking.
- Lyrics support.

### System Monitor

- CPU and RAM monitoring.
- Disk usage information.
- Network download and upload speeds.
- Battery and charging status.

### Pomodoro

- Focus and break sessions.
- Start, pause, reset, and skip controls.
- Automatic phase transitions.
- Session completion notification.

### Water Reminder

- Daily water intake target.
- Glass tracking.
- Configurable reminder intervals.
- Snooze functionality.

### Quick Shelf

A temporary storage space for things you frequently need.

- Store files, notes, and snippets.
- Drag and drop file support.
- Search and filter items.
- Pin important items.
- Open, reveal, or copy items.
- Expiration settings and automatic cleanup.
- Local SQLite storage.

## 🛠️ Tech Stack

| Area                | Technology     |
| ------------------- | -------------- |
| Desktop Framework   | Tauri 2        |
| Backend             | Rust           |
| Frontend            | React 19       |
| Language            | TypeScript     |
| Styling             | Tailwind CSS 4 |
| Animation           | Motion         |
| Build Tool          | Vite           |
| Database            | SQLite         |
| System Monitoring   | sysinfo        |
| Windows Integration | Windows API    |

## 🚀 Installation and Development

### Prerequisites

Make sure you have:

- Windows 10 or Windows 11.
- Node.js and npm.
- Rust toolchain.
- Microsoft C++ Build Tools.
- WebView2 Runtime.

### 1. Clone the repository

```bash
git clone https://github.com/fanhdt/notchboo.git
cd notchboo
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start development mode

```bash
npm run tauri dev
```

### 4. Build the application

```bash
npm run tauri build
```

The generated application bundles will be available in the Tauri build output directory.

## 📁 Project Structure

```text
notchboo/
├── src/
│   ├── components/
│   │   └── island/
│   ├── hooks/
│   ├── pages/
│   │   ├── island/
│   │   └── shelf/
│   └── App.tsx
│
├── src-tauri/
│   └── src/
│       ├── shelf/
│       ├── activity.rs
│       ├── foreground.rs
│       ├── island.rs
│       ├── tray.rs
│       ├── window.rs
│       └── lib.rs
│
├── package.json
└── README.md
```

## 🗺️ Roadmap

Notchboo is still under active development. Some planned improvements include:

- [ ] An original Notchboo mascot.
- [ ] Priority-based Activity Manager.
- [ ] Bangboo expressions based on application activities.
- [ ] Exclusive fullscreen handling.
- [ ] Improved multi-monitor support.
- [ ] Visual and animation refinements.
- [ ] Notification and attention management.

## 📌 Project Status

Notchboo is a personal project under active development. Features and designs may change as development progresses.

## 📄 License

No open-source license has been assigned to this repository yet.

---

<p align="center">
  Made with curiosity, Rust, and a little Bangboo energy.
  <br />
  <strong>Notchboo</strong> · A tiny companion for your desktop.
</p>
