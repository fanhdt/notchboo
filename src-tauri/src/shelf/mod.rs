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
#[cfg(test)]
mod testutil;
pub mod window;

use std::{
    sync::{
        Mutex, OnceLock,
        mpsc::{self, RecvTimeoutError, Sender},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use tauri::{AppHandle, Manager};

use self::db::Db;
use self::model::now_ms;
pub use self::state::ShelfState;
use self::storage::Storage;

/// Folder di dalam data lokal aplikasi (`%LOCALAPPDATA%\com.notchboo.app\`).
const SHELF_DIR: &str = "shelf";
const DB_FILE: &str = "shelf.db";

/// Seberapa sering item kedaluwarsa dibersihkan saat aplikasi berjalan.
const PURGE_INTERVAL: Duration = Duration::from_secs(60 * 60);

/// Worker pemeliharaan Quick Shelf.
struct MaintenanceWorker {
    stop_sender: Sender<()>,
    handle: JoinHandle<()>,
}

/// Hanya satu worker pemeliharaan boleh berjalan.
static MAINTENANCE_WORKER: OnceLock<Mutex<Option<MaintenanceWorker>>> = OnceLock::new();

fn maintenance_worker() -> &'static Mutex<Option<MaintenanceWorker>> {
    MAINTENANCE_WORKER.get_or_init(|| Mutex::new(None))
}

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
    storage
        .prepare()
        .map_err(|error| format!("tidak bisa membuat {}: {error}", dir.display()))?;

    let db = Db::open(&dir.join(DB_FILE)).map_err(|error| error.to_string())?;
    Ok(ShelfState::new(db, storage))
}

/// Memulai thread pemeliharaan. Harus dipanggil setelah `ShelfState` didaftarkan lewat `app.manage`.
///
/// Saat mulai: menyelaraskan database dengan disk dan membersihkan sisa impor yang terputus.
/// Setelah itu tiap jam: menghapus item kedaluwarsa yang tidak di-pin.
pub fn start_maintenance(app: &AppHandle) {
    let mut worker_slot = maintenance_worker()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    // Mencegah worker ganda jika fungsi dipanggil lebih dari sekali.
    if worker_slot.is_some() {
        return;
    }

    let app = app.clone();
    let (stop_sender, stop_receiver) = mpsc::channel();

    let handle = match thread::Builder::new()
        .name("notchboo-shelf-maintenance".into())
        .spawn(move || {
            let state = app.state::<ShelfState>();

            match ops::sweep_orphans(&state) {
                Ok(report) if cfg!(debug_assertions) => {
                    eprintln!("Quick Shelf: sapuan awal {report:?}");
                }
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
                    Err(reason) => {
                        eprintln!("Quick Shelf: pembersihan gagal: {reason}");
                    }
                }

                // Menunggu interval, tetapi bisa langsung dibangunkan saat aplikasi keluar.
                match stop_receiver.recv_timeout(PURGE_INTERVAL) {
                    Ok(()) | Err(RecvTimeoutError::Disconnected) => break,
                    Err(RecvTimeoutError::Timeout) => {}
                }
            }
        }) {
        Ok(handle) => handle,
        Err(error) => {
            eprintln!("Quick Shelf: gagal memulai worker pemeliharaan: {error}");
            return;
        }
    };

    *worker_slot = Some(MaintenanceWorker {
        stop_sender,
        handle,
    });
}

/// Menghentikan worker pemeliharaan dan menunggu thread selesai.
pub fn stop_maintenance() {
    let worker = {
        let mut worker_slot = maintenance_worker()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        worker_slot.take()
    };

    if let Some(worker) = worker {
        let _ = worker.stop_sender.send(());

        if worker.handle.join().is_err() {
            eprintln!("Quick Shelf: worker pemeliharaan berhenti karena panic");
        }
    }
}
