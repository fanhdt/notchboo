use std::path::Path;

use rusqlite::{Connection, OptionalExtension, params};

use super::model::{
    ClipboardFilter, ClipboardItem, normalize_source_app, now_ms, validate_clipboard_text,
};

/// Database lokal khusus Clipboard Manager.
pub struct ClipboardDb {
    connection: Connection,
}

impl ClipboardDb {
    /// Membuka atau membuat database clipboard.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref();

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Tidak bisa membuat folder database clipboard {}: {error}",
                    parent.display()
                )
            })?;
        }

        let connection = Connection::open(path)
            .map_err(|error| format!("Tidak bisa membuka database clipboard: {error}"))?;

        Self::initialize(connection)
    }

    /// Membuat database in-memory untuk pengujian.
    #[cfg(test)]
    fn in_memory() -> Result<Self, String> {
        let connection = Connection::open_in_memory()
            .map_err(|error| format!("Tidak bisa membuat database pengujian: {error}"))?;

        Self::initialize(connection)
    }

    fn initialize(connection: Connection) -> Result<Self, String> {
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|error| format!("Tidak bisa mengatur timeout database: {error}"))?;

        connection
            .execute_batch(
                "
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;

                CREATE TABLE IF NOT EXISTS clipboard_items (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    content     TEXT NOT NULL UNIQUE,
                    pinned      INTEGER NOT NULL DEFAULT 0
                                CHECK (pinned IN (0, 1)),
                    source_app  TEXT,
                    created_at  INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_clipboard_created_at
                    ON clipboard_items(created_at DESC, id DESC);

                CREATE INDEX IF NOT EXISTS idx_clipboard_pinned
                    ON clipboard_items(pinned, created_at DESC);
                ",
            )
            .map_err(|error| format!("Tidak bisa menyiapkan database clipboard: {error}"))?;

        Ok(Self { connection })
    }

    /// Menambahkan teks clipboard.
    ///
    /// Konten duplikat diperbarui, bukan dibuat sebagai item baru.
    /// Item pinned tidak dihapus ketika batas maksimum diterapkan.
    pub fn add(
        &mut self,
        content: &str,
        source_app: Option<&str>,
        max_items: u16,
    ) -> Result<ClipboardItem, String> {
        validate_clipboard_text(content)?;

        let source_app = normalize_source_app(source_app);
        let created_at = now_ms();

        let transaction = self
            .connection
            .transaction()
            .map_err(|error| format!("Tidak bisa memulai transaksi clipboard: {error}"))?;

        transaction
            .execute(
                "
                INSERT INTO clipboard_items (content, source_app, created_at)
                VALUES (?1, ?2, ?3)
                ON CONFLICT(content) DO UPDATE SET
                    source_app = excluded.source_app,
                    created_at = excluded.created_at
                ",
                params![content, source_app, created_at],
            )
            .map_err(|error| format!("Tidak bisa menyimpan clipboard: {error}"))?;

        // Batas maksimum hanya berlaku untuk item yang tidak di-pin.
        transaction
            .execute(
                "
                DELETE FROM clipboard_items
                WHERE pinned = 0
                  AND id NOT IN (
                      SELECT id
                      FROM clipboard_items
                      WHERE pinned = 0
                      ORDER BY created_at DESC, id DESC
                      LIMIT ?1
                  )
                ",
                params![max_items.max(1)],
            )
            .map_err(|error| format!("Tidak bisa membatasi clipboard history: {error}"))?;

        let item = transaction
            .query_row(
                "
                SELECT id, content, pinned, source_app, created_at
                FROM clipboard_items
                WHERE content = ?1
                ",
                params![content],
                Self::map_item,
            )
            .map_err(|error| format!("Tidak bisa membaca clipboard yang disimpan: {error}"))?;

        transaction
            .commit()
            .map_err(|error| format!("Tidak bisa menyelesaikan transaksi clipboard: {error}"))?;

        Ok(item)
    }

    /// Mengambil satu item berdasarkan ID.
    pub fn get(&self, id: i64) -> Result<ClipboardItem, String> {
        self.connection
            .query_row(
                "
                SELECT id, content, pinned, source_app, created_at
                FROM clipboard_items
                WHERE id = ?1
                ",
                params![id],
                Self::map_item,
            )
            .optional()
            .map_err(|error| format!("Tidak bisa membaca clipboard: {error}"))?
            .ok_or_else(|| "Item clipboard tidak ditemukan.".to_string())
    }

    /// Mengambil daftar history dengan pencarian dan filter pin.
    pub fn list(&self, filter: &ClipboardFilter) -> Result<Vec<ClipboardItem>, String> {
        let query = filter
            .query
            .as_deref()
            .map(str::trim)
            .filter(|query| !query.is_empty());

        let mut statement = self
            .connection
            .prepare(
                "
                SELECT id, content, pinned, source_app, created_at
                FROM clipboard_items
                WHERE (?1 IS NULL OR instr(lower(content), lower(?1)) > 0)
                  AND (?2 = 0 OR pinned = 1)
                ORDER BY pinned DESC, created_at DESC, id DESC
                LIMIT ?3
                ",
            )
            .map_err(|error| format!("Tidak bisa menyiapkan pencarian clipboard: {error}"))?;

        let rows = statement
            .query_map(
                params![query, filter.pinned_only, filter.normalized_limit()],
                Self::map_item,
            )
            .map_err(|error| format!("Tidak bisa mengambil clipboard history: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Tidak bisa membaca hasil clipboard: {error}"))
    }

    /// Mengubah status pin sebuah item.
    pub fn set_pinned(&self, id: i64, pinned: bool) -> Result<ClipboardItem, String> {
        let changed = self
            .connection
            .execute(
                "UPDATE clipboard_items SET pinned = ?1 WHERE id = ?2",
                params![pinned, id],
            )
            .map_err(|error| format!("Tidak bisa mengubah pin clipboard: {error}"))?;

        if changed == 0 {
            return Err("Item clipboard tidak ditemukan.".into());
        }

        self.get(id)
    }

    /// Menghapus satu item, termasuk item yang di-pin.
    pub fn delete(&self, id: i64) -> Result<(), String> {
        let changed = self
            .connection
            .execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])
            .map_err(|error| format!("Tidak bisa menghapus clipboard: {error}"))?;

        if changed == 0 {
            return Err("Item clipboard tidak ditemukan.".into());
        }

        Ok(())
    }

    /// Menghapus seluruh history, termasuk item yang di-pin.
    pub fn clear(&self) -> Result<(), String> {
        self.connection
            .execute("DELETE FROM clipboard_items", [])
            .map_err(|error| format!("Tidak bisa menghapus clipboard history: {error}"))?;

        Ok(())
    }

    /// Menghapus item yang melewati masa penyimpanan.
    ///
    /// Item pinned selalu dipertahankan.
    /// None berarti tidak ada batas waktu penyimpanan.
    pub fn prune_retention(
        &self,
        retention_days: Option<u16>,
        current_time_ms: i64,
    ) -> Result<usize, String> {
        let Some(days) = retention_days else {
            return Ok(0);
        };

        let retention_ms = i64::from(days) * 24 * 60 * 60 * 1000;
        let cutoff = current_time_ms.saturating_sub(retention_ms);

        self.connection
            .execute(
                "
                DELETE FROM clipboard_items
                WHERE pinned = 0 AND created_at < ?1
                ",
                params![cutoff],
            )
            .map_err(|error| format!("Tidak bisa membersihkan clipboard lama: {error}"))
    }

    /// Jumlah item dalam history.
    /// Jumlah item dalam history.
    pub fn count(&self) -> Result<u64, String> {
        let count: i64 = self
            .connection
            .query_row("SELECT COUNT(*) FROM clipboard_items", [], |row| row.get(0))
            .map_err(|error| format!("Tidak bisa menghitung clipboard history: {error}"))?;

        u64::try_from(count).map_err(|error| format!("Jumlah clipboard tidak valid: {error}"))
    }

    fn map_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClipboardItem> {
        Ok(ClipboardItem {
            id: row.get(0)?,
            content: row.get(1)?,
            pinned: row.get(2)?,
            source_app: row.get(3)?,
            created_at: row.get(4)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> ClipboardDb {
        ClipboardDb::in_memory().unwrap()
    }

    #[test]
    fn inserts_and_reads_clipboard_item() {
        let mut db = database();

        let inserted = db
            .add("Hello Mochi", Some(r"C:\Apps\editor.exe"), 100)
            .unwrap();

        let loaded = db.get(inserted.id).unwrap();

        assert_eq!(loaded.content, "Hello Mochi");
        assert_eq!(loaded.source_app.as_deref(), Some("editor.exe"));
        assert!(!loaded.pinned);
    }

    #[test]
    fn duplicate_content_updates_existing_item() {
        let mut db = database();

        let first = db.add("Duplicate", Some("first.exe"), 100).unwrap();
        let second = db.add("Duplicate", Some("second.exe"), 100).unwrap();

        assert_eq!(first.id, second.id);
        assert_eq!(db.count().unwrap(), 1);
        assert_eq!(
            db.get(second.id).unwrap().source_app.as_deref(),
            Some("second.exe")
        );
    }

    #[test]
    fn duplicate_content_preserves_pin_status() {
        let mut db = database();

        let item = db.add("Pinned content", None, 100).unwrap();
        db.set_pinned(item.id, true).unwrap();

        let updated = db.add("Pinned content", None, 100).unwrap();

        assert!(updated.pinned);
    }

    #[test]
    fn list_supports_search_and_pin_filter() {
        let mut db = database();

        let first = db.add("Rust programming", None, 100).unwrap();
        db.add("React development", None, 100).unwrap();

        db.set_pinned(first.id, true).unwrap();

        let search = db
            .list(&ClipboardFilter {
                query: Some("rust".into()),
                ..Default::default()
            })
            .unwrap();

        assert_eq!(search.len(), 1);
        assert_eq!(search[0].id, first.id);

        let pinned = db
            .list(&ClipboardFilter {
                pinned_only: true,
                ..Default::default()
            })
            .unwrap();

        assert_eq!(pinned.len(), 1);
        assert!(pinned[0].pinned);
    }

    #[test]
    fn max_items_removes_oldest_unpinned_items() {
        let mut db = database();

        let first = db.add("First", None, 2).unwrap();
        db.add("Second", None, 2).unwrap();
        db.add("Third", None, 2).unwrap();

        assert!(db.get(first.id).is_err());
        assert_eq!(db.count().unwrap(), 2);
    }

    #[test]
    fn pinned_items_are_not_removed_by_max_items() {
        let mut db = database();

        let pinned = db.add("Pinned", None, 1).unwrap();
        db.set_pinned(pinned.id, true).unwrap();

        db.add("Second", None, 1).unwrap();
        db.add("Third", None, 1).unwrap();

        assert!(db.get(pinned.id).unwrap().pinned);
        assert_eq!(db.count().unwrap(), 2);
    }

    #[test]
    fn retention_removes_expired_unpinned_items() {
        let db = database();
        let old_time = 1_000_000_i64;

        db.connection
            .execute(
                "
                INSERT INTO clipboard_items (content, pinned, created_at)
                VALUES ('Expired', 0, ?1), ('Pinned', 1, ?1)
                ",
                params![old_time],
            )
            .unwrap();

        let deleted = db
            .prune_retention(Some(1), old_time + 2 * 24 * 60 * 60 * 1000)
            .unwrap();

        assert_eq!(deleted, 1);
        assert_eq!(db.count().unwrap(), 1);
    }

    #[test]
    fn no_retention_does_not_delete_items() {
        let db = database();

        db.connection
            .execute(
                "
                INSERT INTO clipboard_items (content, created_at)
                VALUES ('Keep forever', 1)
                ",
                [],
            )
            .unwrap();

        assert_eq!(db.prune_retention(None, now_ms()).unwrap(), 0);
        assert_eq!(db.count().unwrap(), 1);
    }

    #[test]
    fn clear_removes_all_items_including_pinned() {
        let mut db = database();

        let item = db.add("Pinned", None, 100).unwrap();
        db.set_pinned(item.id, true).unwrap();
        db.add("Regular", None, 100).unwrap();

        db.clear().unwrap();

        assert_eq!(db.count().unwrap(), 0);
    }

    #[test]
    fn rejects_invalid_clipboard_content() {
        let mut db = database();

        assert!(db.add("  ", None, 100).is_err());
        assert_eq!(db.count().unwrap(), 0);
    }
}
