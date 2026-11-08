//! Quick Shelf: ruang kerja sementara untuk file, catatan, dan snippet.
//!
//! - `model`: tipe data dan validasi (tanpa Tauri)
//! - `db`: SQLite (tanpa Tauri)
//! - `storage`: file terkelola di disk (tanpa Tauri)
//! - `state`: state bersama untuk semua command (tanpa Tauri)
//! - `ops`: operasi gabungan database + disk (tanpa Tauri)
//! - `commands`: command Tauri yang dipanggil React
//! - `window`: window `shelf` (dibuat sekali, dipakai ulang)

pub mod commands;
mod db;
mod model;
mod ops;
mod state;
mod storage;
pub mod window;
#[cfg(test)]
mod testutil;

use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager};

pub use self::state::ShelfState;
use self::db::Db;
use self::model::now_ms;
use self::storage::Storage;

/// Folder di dalam data lokal aplikasi (`%LOCALAPPDATA%\com.notchboo.app\`).
const SHELF_DIR: &str = "shelf";
const DB_FILE: &str = "shelf.db";

/// Seberapa sering item kedaluwarsa dibersihkan saat aplikasi berjalan.
const PURGE_INTERVAL: Duration = Duration::from_secs(60 * 60);

/// Membuka database dan folder penyimpanan Quick Shelf. Dipanggil sekali dari `setup`.
/// Kegagalan tidak menghentikan aplikasi: alasannya disimpan di state dan dilaporkan oleh tiap command.
pub fn init(app: &AppHandle) -> ShelfState {
    match open(app) {
        Ok(state) => state,
        Err(reason) => {
            eprintln!("Quick Shelf tidak bisa dibuka: {reason}");
            ShelfState::unavailable(reason)
        }
    }
}

fn open(app: &AppHandle) -> Result<ShelfState, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("folder data tidak ditemukan: {error}"))?
        .join(SHELF_DIR);

    let storage = Storage::new(dir.clone());
    storage.prepare().map_err(|error| format!("tidak bisa membuat {}: {error}", dir.display()))?;

    let db = Db::open(&dir.join(DB_FILE)).map_err(|error| error.to_string())?;
    Ok(ShelfState::new(db, storage))
}

/// Memulai thread pemeliharaan. Harus dipanggil setelah `ShelfState` didaftarkan lewat `app.manage`.
///
/// Saat mulai: menyelaraskan database dengan disk dan membersihkan sisa impor yang terputus.
/// Setelah itu tiap jam: menghapus item kedaluwarsa yang tidak di-pin.
pub fn start_maintenance(app: &AppHandle) {
    let app = app.clone();

    thread::spawn(move || {
        let state = app.state::<ShelfState>();

        match ops::sweep_orphans(&state) {
            Ok(report) if cfg!(debug_assertions) => eprintln!("Quick Shelf: sapuan awal {report:?}"),
            Ok(_) => {}
            Err(reason) => {
                // State tidak tersedia (database gagal dibuka): tidak ada yang bisa dipelihara.
                eprintln!("Quick Shelf: pemeliharaan dihentikan: {reason}");
                return;
            }
        }

        loop {
            match ops::purge_expired(&state, now_ms()) {
                Ok(report) if report.purged > 0 || report.failed > 0 => {
                    eprintln!("Quick Shelf: pembersihan {report:?}");
                }
                Ok(_) => {}
                Err(reason) => eprintln!("Quick Shelf: pembersihan gagal: {reason}"),
            }
            thread::sleep(PURGE_INTERVAL);
        }
    });
}