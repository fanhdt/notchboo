use std::{
    path::Path,
    sync::{
        Mutex, MutexGuard,
        atomic::{AtomicBool, Ordering},
    },
};

use super::{
    db::ClipboardDb,
    model::{ClipboardFilter, ClipboardItem},
};

#[cfg(windows)]
pub(super) struct MonitorWorker {
    pub thread_id: u32,
    pub handle: std::thread::JoinHandle<()>,
}

/// State bersama untuk Clipboard Manager.
pub struct ClipboardState {
    db: Mutex<ClipboardDb>,
    paused: AtomicBool,

    #[cfg(windows)]
    pub(super) worker: Mutex<Option<MonitorWorker>>,
}

impl ClipboardState {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        Ok(Self {
            db: Mutex::new(ClipboardDb::open(path)?),
            paused: AtomicBool::new(false),

            #[cfg(windows)]
            worker: Mutex::new(None),
        })
    }

    fn lock(&self) -> Result<MutexGuard<'_, ClipboardDb>, String> {
        self.db
            .lock()
            .map_err(|_| "Database clipboard sedang tidak tersedia.".to_string())
    }

    pub fn add(
        &self,
        content: &str,
        source_app: Option<&str>,
        max_items: u16,
    ) -> Result<ClipboardItem, String> {
        self.lock()?.add(content, source_app, max_items)
    }

    pub fn get(&self, id: i64) -> Result<ClipboardItem, String> {
        self.lock()?.get(id)
    }

    pub fn list(&self, filter: &ClipboardFilter) -> Result<Vec<ClipboardItem>, String> {
        self.lock()?.list(filter)
    }

    pub fn set_pinned(&self, id: i64, pinned: bool) -> Result<ClipboardItem, String> {
        self.lock()?.set_pinned(id, pinned)
    }

    pub fn delete(&self, id: i64) -> Result<(), String> {
        self.lock()?.delete(id)
    }

    pub fn clear(&self) -> Result<(), String> {
        self.lock()?.clear()
    }

    pub fn prune_retention(&self, retention_days: Option<u16>) -> Result<usize, String> {
        self.lock()?
            .prune_retention(retention_days, super::model::now_ms())
    }

    pub fn count(&self) -> Result<u64, String> {
        self.lock()?.count()
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Relaxed)
    }

    pub fn set_paused(&self, paused: bool) {
        self.paused.store(paused, Ordering::Relaxed);
    }
}
