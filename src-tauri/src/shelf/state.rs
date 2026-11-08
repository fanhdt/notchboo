//! State Quick Shelf yang dibagi ke semua command. Tidak bergantung pada Tauri.

use std::sync::Mutex;

use super::db::Db;
use super::model::{now_ms, ShelfError, ShelfResult};
use super::storage::Storage;

struct Inner {
    db: Mutex<Db>,
    storage: Storage,
    /// Saat state dibuat. Folder `.incoming-*` yang lebih tua dari ini sisa proses yang sudah mati.
    started_at_ms: i64,
}

/// Jika database gagal dibuka, alasannya disimpan di sini dan dilaporkan oleh tiap command.
/// Island tetap berjalan, dan tidak ada command yang panik karena state tidak terdaftar
/// (di build release `panic = "abort"` akan mematikan seluruh aplikasi).
pub struct ShelfState {
    inner: Result<Inner, String>,
}

impl ShelfState {
    pub fn new(db: Db, storage: Storage) -> Self {
        Self { inner: Ok(Inner { db: Mutex::new(db), storage, started_at_ms: now_ms() }) }
    }

    pub fn unavailable(reason: String) -> Self {
        Self { inner: Err(reason) }
    }

    fn inner(&self) -> ShelfResult<&Inner> {
        self.inner.as_ref().map_err(|reason| ShelfError::Unavailable(reason.clone()))
    }

    /// Menjalankan `work` dengan akses ke database. Error diubah menjadi teks untuk React.
    pub fn with_db<T>(&self, work: impl FnOnce(&Db) -> ShelfResult<T>) -> Result<T, String> {
        self.with_db_storage(|db, _| work(db))
    }

    /// Seperti `with_db`, tetapi juga memberi akses ke penyimpanan file.
    /// Database terkunci selama `work` berjalan, jadi operasi yang mengubah database dan disk
    /// sekaligus (hapus, bersihkan) tidak bisa disela pin/unpin dari command lain.
    pub fn with_db_storage<T>(&self, work: impl FnOnce(&Db, &Storage) -> ShelfResult<T>) -> Result<T, String> {
        let run = || -> ShelfResult<T> {
            let inner = self.inner()?;
            let db = inner
                .db
                .lock()
                .map_err(|_| ShelfError::Unavailable("kunci database rusak".into()))?;
            work(&db, &inner.storage)
        };
        run().map_err(|error| error.to_string())
    }

    /// Penyimpanan tanpa mengunci database. Dipakai untuk menyalin file besar
    /// sehingga daftar tetap bisa dibaca selama penyalinan.
    pub fn storage(&self) -> Result<&Storage, String> {
        self.inner().map(|inner| &inner.storage).map_err(|error| error.to_string())
    }

    pub fn started_at_ms(&self) -> i64 {
        self.inner().map(|inner| inner.started_at_ms).unwrap_or(0)
    }
}