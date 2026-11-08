//! Akses SQLite untuk Quick Shelf: skema, migrasi, dan query.
//! Tidak bergantung pada Tauri, jadi bisa diuji dengan database di memori.

use std::path::Path;
use std::time::Duration;

use rusqlite::types::Type;
use rusqlite::{params, Connection, OptionalExtension, Row};

use super::model::*;

/// Versi skema terbaru. Naikkan saat menambah migrasi.
const SCHEMA_VERSION: i64 = 1;
const KEY_DEFAULT_EXPIRY: &str = "default_expiry";
/// Menunggu kunci database sebelum menyerah (berguna bila ada proses lain yang menulis).
const BUSY_TIMEOUT: Duration = Duration::from_secs(3);

const SCHEMA_V1: &str = r#"
CREATE TABLE items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    kind            TEXT    NOT NULL CHECK (kind IN ('file', 'note', 'snippet')),
    title           TEXT    NOT NULL,
    body            TEXT,
    language        TEXT,
    file_name       TEXT,
    stored_rel_path TEXT,
    source_path     TEXT,
    extension       TEXT,
    size_bytes      INTEGER,
    pinned          INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    expires_at      INTEGER
);
CREATE INDEX idx_items_order   ON items (pinned DESC, created_at DESC);
CREATE INDEX idx_items_expires ON items (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_items_kind    ON items (kind);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

pub struct Db {
    conn: Connection,
}

/// Metadata file yang baru diimpor.
pub struct NewFile<'a> {
    pub title: &'a str,
    pub file_name: &'a str,
    pub source_path: Option<&'a str>,
    pub extension: Option<&'a str>,
    pub size_bytes: i64,
}

impl Db {
    /// Membuka (atau membuat) database di `path`, lalu menjalankan migrasi.
    pub fn open(path: &Path) -> ShelfResult<Self> {
        Self::init(Connection::open(path)?)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> ShelfResult<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(mut conn: Connection) -> ShelfResult<Self> {
        conn.busy_timeout(BUSY_TIMEOUT)?;
        // WAL: pembaca tidak memblokir penulis dan tahan terhadap penutupan paksa.
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;")?;
        Self::migrate(&mut conn)?;
        Ok(Self { conn })
    }

    fn migrate(conn: &mut Connection) -> ShelfResult<()> {
        let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

        if current > SCHEMA_VERSION {
            return Err(ShelfError::Invalid(
                "Database dibuat oleh versi Notchboo yang lebih baru. Perbarui aplikasi.".into(),
            ));
        }

        if current < 1 {
            // Skema dan nomor versi ditulis dalam satu transaksi: berhasil semua atau tidak sama sekali.
            let tx = conn.transaction()?;
            tx.execute_batch(SCHEMA_V1)?;
            tx.pragma_update(None, "user_version", 1)?;
            tx.commit()?;
        }
        Ok(())
    }

    // ---------- Item ----------

    pub fn get(&self, id: i64) -> ShelfResult<ShelfItem> {
        self.conn
            .query_row(
                "SELECT id, kind, title, body, language, file_name, source_path, extension, \
                 size_bytes, pinned, created_at, updated_at, expires_at FROM items WHERE id = ?1",
                [id],
                row_to_item,
            )
            .optional()?
            .ok_or(ShelfError::NotFound)
    }

    /// Daftar item. Item kedaluwarsa disembunyikan walau belum dibersihkan; item yang di-pin selalu tampil.
    /// `body` pada hasil hanya potongan awal.
    pub fn list(&self, filter: &ListFilter, now: i64) -> ShelfResult<Vec<ShelfItem>> {
        let sql = format!(
            r#"SELECT id, kind, title, substr(body, 1, {LIST_PREVIEW_CHARS}), language, file_name,
                      source_path, extension, size_bytes, pinned, created_at, updated_at, expires_at
               FROM items
               WHERE (pinned = 1 OR expires_at IS NULL OR expires_at > ?1)
                 AND (?2 IS NULL OR kind = ?2)
                 AND (?3 = 0 OR pinned = 1)
                 AND (?4 IS NULL OR title LIKE ?4 ESCAPE '\' OR body LIKE ?4 ESCAPE '\' OR file_name LIKE ?4 ESCAPE '\')
               ORDER BY pinned DESC, created_at DESC, id DESC
               LIMIT ?5"#
        );

        let kind = filter.kind.map(ItemKind::as_str);
        let pattern = filter
            .query
            .as_deref()
            .map(str::trim)
            .filter(|q| !q.is_empty())
            .map(like_pattern);

        let mut statement = self.conn.prepare(&sql)?;
        let items = statement
            .query_map(params![now, kind, filter.pinned_only as i64, pattern, LIST_LIMIT], row_to_item)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    /// Menambah catatan atau snippet. Masa berlaku mengikuti pengaturan bawaan.
    pub fn add_text(&self, kind: ItemKind, title: &str, body: &str, language: Option<&str>, now: i64) -> ShelfResult<ShelfItem> {
        let clean = clean_text(kind, title, body, language)?;
        let expires_at = self.default_expiry()?.expires_at(now);

        self.conn.execute(
            "INSERT INTO items (kind, title, body, language, pinned, created_at, updated_at, expires_at) \
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5, ?6)",
            params![kind.as_str(), clean.title, clean.body, clean.language, now, expires_at],
        )?;
        self.get(self.conn.last_insert_rowid())
    }

    /// Mengubah catatan atau snippet. Jenis item tidak bisa diganti, dan file tidak bisa diubah lewat sini.
    pub fn update_text(&self, id: i64, title: &str, body: &str, language: Option<&str>, now: i64) -> ShelfResult<ShelfItem> {
        let current = self.get(id)?;
        let clean = clean_text(current.kind, title, body, language)?;

        self.conn.execute(
            "UPDATE items SET title = ?2, body = ?3, language = ?4, updated_at = ?5 WHERE id = ?1",
            params![id, clean.title, clean.body, clean.language, now],
        )?;
        self.get(id)
    }

    /// Mem-pin atau melepas pin. Item yang di-pin tidak ikut dibersihkan.
    /// Jika saat dilepas masa berlakunya sudah lewat (terlewat selama di-pin),
    /// masa berlaku dihitung ulang dari sekarang agar item tidak langsung terhapus.
    pub fn set_pinned(&self, id: i64, pinned: bool, now: i64) -> ShelfResult<ShelfItem> {
        let fresh_expiry = self.default_expiry()?.expires_at(now);

        let changed = self.conn.execute(
            "UPDATE items SET pinned = ?2, updated_at = ?3, \
             expires_at = CASE WHEN ?2 = 0 AND expires_at IS NOT NULL AND expires_at <= ?3 THEN ?4 ELSE expires_at END \
             WHERE id = ?1",
            params![id, pinned as i64, now, fresh_expiry],
        )?;
        if changed == 0 {
            return Err(ShelfError::NotFound);
        }
        self.get(id)
    }

    /// Mengatur masa berlaku satu item, dihitung mulai `now`.
    pub fn set_expiry(&self, id: i64, expiry: Expiry, now: i64) -> ShelfResult<ShelfItem> {
        let changed = self.conn.execute(
            "UPDATE items SET expires_at = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, expiry.expires_at(now), now],
        )?;
        if changed == 0 {
            return Err(ShelfError::NotFound);
        }
        self.get(id)
    }

    /// Menambah item file. Baris dan penempatan file di disk dibuat dalam satu transaksi:
    /// `finalize(id)` menempatkan file di lokasi akhir dan mengembalikan path relatifnya.
    /// Jika `finalize` gagal, baris dibatalkan.
    pub fn insert_file(
        &self,
        file: &NewFile<'_>,
        now: i64,
        finalize: impl FnOnce(i64) -> std::io::Result<String>,
    ) -> ShelfResult<ShelfItem> {
        let title: String = file.title.chars().take(MAX_TITLE_CHARS).collect();
        let expires_at = self.default_expiry()?.expires_at(now);

        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO items (kind, title, file_name, source_path, extension, size_bytes, pinned, created_at, updated_at, expires_at) \
             VALUES ('file', ?1, ?2, ?3, ?4, ?5, 0, ?6, ?6, ?7)",
            params![title, file.file_name, file.source_path, file.extension, file.size_bytes, now, expires_at],
        )?;
        let id = tx.last_insert_rowid();

        let rel_path = finalize(id).map_err(|error| ShelfError::Storage(format!("Tidak bisa menyimpan file: {error}")))?;
        tx.execute("UPDATE items SET stored_rel_path = ?2 WHERE id = ?1", params![id, rel_path])?;
        tx.commit()?;

        self.get(id)
    }

    /// Path relatif file terkelola milik `id`. `None` untuk catatan dan snippet.
    pub fn stored_path(&self, id: i64) -> ShelfResult<Option<String>> {
        self.conn
            .query_row("SELECT stored_rel_path FROM items WHERE id = ?1", [id], |row| row.get::<_, Option<String>>(0))
            .optional()?
            .ok_or(ShelfError::NotFound)
    }

    /// Item kedaluwarsa yang tidak di-pin, beserta path file terkelolanya.
    pub fn expired(&self, now: i64) -> ShelfResult<Vec<(i64, Option<String>)>> {
        let mut statement = self.conn.prepare(
            "SELECT id, stored_rel_path FROM items WHERE pinned = 0 AND expires_at IS NOT NULL AND expires_at <= ?1",
        )?;
        let rows = statement
            .query_map([now], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Semua item file beserta path relatifnya (untuk sapuan konsistensi).
    pub fn file_rows(&self) -> ShelfResult<Vec<(i64, Option<String>)>> {
        let mut statement = self.conn.prepare("SELECT id, stored_rel_path FROM items WHERE kind = 'file'")?;
        let rows = statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Menghapus baris item. Penghapusan file di disk dilakukan lebih dulu oleh `ops::delete_item`.
    pub fn delete(&self, id: i64) -> ShelfResult<()> {
        let changed = self.conn.execute("DELETE FROM items WHERE id = ?1", [id])?;
        if changed == 0 {
            return Err(ShelfError::NotFound);
        }
        Ok(())
    }

    // ---------- Pengaturan ----------

    fn get_setting(&self, key: &str) -> ShelfResult<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| row.get(0))
            .optional()?)
    }

    fn set_setting(&self, key: &str, value: &str) -> ShelfResult<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    /// Masa berlaku bawaan untuk item baru. Nilai tak dikenal kembali ke 7 hari.
    pub fn default_expiry(&self) -> ShelfResult<Expiry> {
        Ok(self
            .get_setting(KEY_DEFAULT_EXPIRY)?
            .and_then(|value| Expiry::parse(&value))
            .unwrap_or_default())
    }

    pub fn set_default_expiry(&self, expiry: Expiry) -> ShelfResult<()> {
        self.set_setting(KEY_DEFAULT_EXPIRY, expiry.as_str())
    }

    pub fn settings(&self) -> ShelfResult<Settings> {
        Ok(Settings { default_expiry: self.default_expiry()? })
    }
}

fn row_to_item(row: &Row<'_>) -> rusqlite::Result<ShelfItem> {
    let kind_text: String = row.get(1)?;
    let kind = ItemKind::parse(&kind_text).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(1, Type::Text, format!("kind tidak dikenal: {kind_text}").into())
    })?;

    Ok(ShelfItem {
        id: row.get(0)?,
        kind,
        title: row.get(2)?,
        body: row.get(3)?,
        language: row.get(4)?,
        file_name: row.get(5)?,
        source_path: row.get(6)?,
        extension: row.get(7)?,
        size_bytes: row.get(8)?,
        pinned: row.get::<_, i64>(9)? != 0,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        expires_at: row.get(12)?,
    })
}

/// Pola `LIKE` yang mencari `query` sebagai teks biasa: `%`, `_`, dan `\` di-escape
/// (dipasangkan dengan `ESCAPE '\'` pada query).
fn like_pattern(query: &str) -> String {
    let mut pattern = String::with_capacity(query.len() + 2);
    pattern.push('%');
    for ch in query.chars() {
        if matches!(ch, '%' | '_' | '\\') {
            pattern.push('\\');
        }
        pattern.push(ch);
    }
    pattern.push('%');
    pattern
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: i64 = 1_700_000_000_000;
    const DAY: i64 = 86_400_000;

    fn db() -> Db {
        Db::open_in_memory().unwrap()
    }

    fn note(db: &Db, title: &str, at: i64) -> ShelfItem {
        db.add_text(ItemKind::Note, title, "isi", None, at).unwrap()
    }

    fn titles(items: &[ShelfItem]) -> Vec<&str> {
        items.iter().map(|i| i.title.as_str()).collect()
    }

    #[test]
    fn migration_sets_version_and_is_safe_to_rerun() {
        let mut db = db();
        let version: i64 = db.conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        Db::migrate(&mut db.conn).unwrap();
    }

    #[test]
    fn rejects_database_from_newer_version() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1).unwrap();
        assert!(matches!(Db::migrate(&mut conn), Err(ShelfError::Invalid(_))));
    }

    #[test]
    fn untitled_note_uses_first_line_and_default_expiry() {
        let db = db();
        let item = db.add_text(ItemKind::Note, "  ", "\n  baris pertama \nkedua", None, T).unwrap();
        assert_eq!(item.title, "baris pertama");
        assert_eq!(item.expires_at, Some(T + 7 * DAY));
        assert!(!item.pinned);
        assert_eq!(item.created_at, T);
    }

    #[test]
    fn snippet_keeps_lowercase_language_note_drops_it() {
        let db = db();
        let snippet = db.add_text(ItemKind::Snippet, "fn", "let x = 1;", Some(" Rust "), T).unwrap();
        assert_eq!(snippet.language.as_deref(), Some("rust"));
        let plain = db.add_text(ItemKind::Note, "n", "x", Some("rust"), T).unwrap();
        assert_eq!(plain.language, None);
    }

    #[test]
    fn rejects_empty_oversized_and_file_kind_input() {
        let db = db();
        assert!(matches!(db.add_text(ItemKind::Note, " ", " \n", None, T), Err(ShelfError::Invalid(_))));
        let big = "x".repeat(MAX_BODY_BYTES + 1);
        assert!(matches!(db.add_text(ItemKind::Note, "t", &big, None, T), Err(ShelfError::Invalid(_))));
        assert!(matches!(db.add_text(ItemKind::File, "t", "x", None, T), Err(ShelfError::Invalid(_))));
    }

    #[test]
    fn body_indentation_is_preserved() {
        let db = db();
        let item = db.add_text(ItemKind::Snippet, "t", "  a\n\tb\n", None, T).unwrap();
        assert_eq!(item.body.as_deref(), Some("  a\n\tb\n"));
    }

    #[test]
    fn default_expiry_never_yields_null() {
        let db = db();
        db.set_default_expiry(Expiry::Never).unwrap();
        assert_eq!(note(&db, "a", T).expires_at, None);
        db.set_default_expiry(Expiry::OneDay).unwrap();
        assert_eq!(note(&db, "b", T).expires_at, Some(T + DAY));
    }

    #[test]
    fn pinned_items_come_first_then_newest() {
        let db = db();
        let a = note(&db, "A", T);
        note(&db, "B", T + 1);
        note(&db, "C", T + 2);
        db.set_pinned(a.id, true, T + 3).unwrap();
        let items = db.list(&ListFilter::default(), T + 4).unwrap();
        assert_eq!(titles(&items), ["A", "C", "B"]);
    }

    #[test]
    fn search_treats_wildcards_as_plain_text() {
        let db = db();
        note(&db, "100% fokus", T);
        note(&db, "100 fokus", T + 1);
        note(&db, "a_b", T + 2);
        note(&db, "ab", T + 3);
        note(&db, r"path\to", T + 4);

        let find = |q: &str| {
            let filter = ListFilter { query: Some(q.into()), ..Default::default() };
            db.list(&filter, T + 10).unwrap()
        };
        assert_eq!(titles(&find("100%")), ["100% fokus"]);
        assert_eq!(titles(&find("a_b")), ["a_b"]);
        assert_eq!(titles(&find(r"path\to")), [r"path\to"]);
        assert_eq!(find("FOKUS").len(), 2); // tidak peka huruf besar/kecil (ASCII)
        assert_eq!(find("   ").len(), 5); // kueri kosong = semua
    }

    #[test]
    fn search_covers_body_and_file_name() {
        let db = db();
        db.add_text(ItemKind::Note, "judul", "ada kata rahasia di sini", None, T).unwrap();
        db.conn
            .execute(
                "INSERT INTO items (kind, title, file_name, pinned, created_at, updated_at) \
                 VALUES ('file', 'laporan.pdf', 'laporan.pdf', 0, ?1, ?1)",
                [T + 1],
            )
            .unwrap();

        let find = |q: &str| {
            let filter = ListFilter { query: Some(q.into()), ..Default::default() };
            db.list(&filter, T + 10).unwrap()
        };
        assert_eq!(find("rahasia").len(), 1);
        assert_eq!(find("laporan").len(), 1);
    }

    #[test]
    fn filters_by_kind_and_pinned_only() {
        let db = db();
        let n = note(&db, "catatan", T);
        db.add_text(ItemKind::Snippet, "kode", "x", None, T + 1).unwrap();
        db.set_pinned(n.id, true, T + 2).unwrap();

        let by_kind = ListFilter { kind: Some(ItemKind::Snippet), ..Default::default() };
        assert_eq!(titles(&db.list(&by_kind, T + 3).unwrap()), ["kode"]);

        let pinned = ListFilter { pinned_only: true, ..Default::default() };
        assert_eq!(titles(&db.list(&pinned, T + 3).unwrap()), ["catatan"]);
    }

    #[test]
    fn expired_items_are_hidden_unless_pinned() {
        let db = db();
        let item = note(&db, "sementara", T);
        let later = T + 8 * DAY;

        assert!(db.list(&ListFilter::default(), later).unwrap().is_empty());

        db.set_pinned(item.id, true, later).unwrap();
        assert_eq!(db.list(&ListFilter::default(), later).unwrap().len(), 1);

        // Dilepas setelah masa berlakunya lewat: dihitung ulang dari sekarang, tidak langsung hilang.
        let unpinned = db.set_pinned(item.id, false, later + 1).unwrap();
        assert_eq!(unpinned.expires_at, Some(later + 1 + 7 * DAY));
        assert_eq!(db.list(&ListFilter::default(), later + 1).unwrap().len(), 1);
    }

    #[test]
    fn unpinning_keeps_expiry_that_has_not_passed() {
        let db = db();
        let item = note(&db, "a", T);
        db.set_expiry(item.id, Expiry::OneDay, T).unwrap();
        db.set_pinned(item.id, true, T + 1).unwrap();
        let after = db.set_pinned(item.id, false, T + 2).unwrap();
        assert_eq!(after.expires_at, Some(T + DAY));
    }

    #[test]
    fn list_returns_body_preview_but_get_returns_full_body() {
        let db = db();
        let item = db.add_text(ItemKind::Note, "panjang", &"x".repeat(1000), None, T).unwrap();
        let listed = db.list(&ListFilter::default(), T).unwrap();
        assert_eq!(listed[0].body.as_deref().map(|b| b.chars().count()), Some(LIST_PREVIEW_CHARS));
        assert_eq!(db.get(item.id).unwrap().body.map(|b| b.len()), Some(1000));
    }

    #[test]
    fn update_text_works_and_rejects_file_items() {
        let db = db();
        let item = db.add_text(ItemKind::Snippet, "lama", "a", Some("js"), T).unwrap();
        let updated = db.update_text(item.id, "baru", "b", Some("TS"), T + 5).unwrap();
        assert_eq!((updated.title.as_str(), updated.body.as_deref()), ("baru", Some("b")));
        assert_eq!(updated.language.as_deref(), Some("ts"));
        assert_eq!((updated.created_at, updated.updated_at), (T, T + 5));

        db.conn
            .execute(
                "INSERT INTO items (kind, title, file_name, pinned, created_at, updated_at) \
                 VALUES ('file', 'a.txt', 'a.txt', 0, 1, 1)",
                [],
            )
            .unwrap();
        let file_id = db.conn.last_insert_rowid();
        assert!(matches!(db.update_text(file_id, "x", "y", None, T), Err(ShelfError::Invalid(_))));
        assert!(matches!(db.update_text(9999, "x", "y", None, T), Err(ShelfError::NotFound)));
    }

    #[test]
    fn set_expiry_and_delete() {
        let db = db();
        let item = note(&db, "a", T);
        assert_eq!(db.set_expiry(item.id, Expiry::OneDay, T + 10).unwrap().expires_at, Some(T + 10 + DAY));
        assert_eq!(db.set_expiry(item.id, Expiry::Never, T + 10).unwrap().expires_at, None);

        db.delete(item.id).unwrap();
        assert!(matches!(db.get(item.id), Err(ShelfError::NotFound)));
        assert!(matches!(db.delete(item.id), Err(ShelfError::NotFound)));
        assert!(matches!(db.set_pinned(item.id, true, T), Err(ShelfError::NotFound)));
    }

    #[test]
    fn insert_file_stores_metadata_and_passes_id_to_finalize() {
        let db = db();
        let file = NewFile { title: "a.txt", file_name: "a.txt", source_path: Some(r"C:\x\a.txt"), extension: Some("txt"), size_bytes: 5 };
        let item = db.insert_file(&file, T, |id| Ok(format!("files/{id}/a.txt"))).unwrap();

        assert_eq!(item.kind, ItemKind::File);
        assert_eq!((item.size_bytes, item.extension.as_deref()), (Some(5), Some("txt")));
        assert_eq!(item.source_path.as_deref(), Some(r"C:\x\a.txt"));
        assert_eq!(item.expires_at, Some(T + 7 * DAY));
        assert_eq!(db.stored_path(item.id).unwrap(), Some(format!("files/{}/a.txt", item.id)));
        assert_eq!(db.file_rows().unwrap().len(), 1);
    }

    #[test]
    fn insert_file_rolls_back_when_finalize_fails() {
        let db = db();
        let file = NewFile { title: "a", file_name: "a", source_path: None, extension: None, size_bytes: 1 };
        let result = db.insert_file(&file, T, |_| Err(std::io::Error::other("disk penuh")));
        assert!(matches!(result, Err(ShelfError::Storage(_))));
        assert!(db.list(&ListFilter::default(), T).unwrap().is_empty());
        assert!(db.file_rows().unwrap().is_empty());
    }

    #[test]
    fn stored_path_is_none_for_notes_and_not_found_for_unknown_id() {
        let db = db();
        let n = note(&db, "a", T);
        assert_eq!(db.stored_path(n.id).unwrap(), None);
        assert!(matches!(db.stored_path(9999), Err(ShelfError::NotFound)));
    }

    #[test]
    fn expired_returns_only_overdue_unpinned_items() {
        let db = db();
        let old = note(&db, "lama", T);
        let pinned = note(&db, "pin", T);
        let forever = note(&db, "abadi", T);
        db.set_expiry(forever.id, Expiry::Never, T).unwrap();
        db.set_pinned(pinned.id, true, T).unwrap();

        assert!(db.expired(T + DAY).unwrap().is_empty());
        let ids: Vec<i64> = db.expired(T + 8 * DAY).unwrap().into_iter().map(|(id, _)| id).collect();
        assert_eq!(ids, [old.id]);
    }

    #[test]
    fn settings_default_and_roundtrip() {
        let db = db();
        assert_eq!(db.default_expiry().unwrap(), Expiry::SevenDays);
        db.set_default_expiry(Expiry::Never).unwrap();
        db.set_default_expiry(Expiry::OneDay).unwrap();
        assert_eq!(db.settings().unwrap().default_expiry, Expiry::OneDay);
        db.set_setting(KEY_DEFAULT_EXPIRY, "rusak").unwrap();
        assert_eq!(db.default_expiry().unwrap(), Expiry::SevenDays);
    }

    #[test]
    fn data_survives_reopening_database() {
        let path = std::env::temp_dir().join(format!("notchboo-test-{}-{}.db", std::process::id(), now_ms()));
        {
            let db = Db::open(&path).unwrap();
            db.add_text(ItemKind::Note, "awet", "x", None, T).unwrap();
        }
        let items = Db::open(&path).unwrap().list(&ListFilter::default(), T).unwrap();
        assert_eq!(titles(&items), ["awet"]);

        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
        }
    }

    #[test]
    fn serialization_to_react_uses_camel_case() {
        let db = db();
        let item = db.add_text(ItemKind::Snippet, "t", "x", Some("rs"), T).unwrap();
        let json = serde_json::to_value(&item).unwrap();
        assert_eq!(json["kind"], "snippet");
        assert_eq!(json["createdAt"], T);
        assert_eq!(json["expiresAt"], T + 7 * DAY);
        assert!(json.get("storedRelPath").is_none()); // jalur internal tidak bocor ke React

        let settings = serde_json::to_value(db.settings().unwrap()).unwrap();
        assert_eq!(settings["defaultExpiry"], "7d");

        let filter: ListFilter = serde_json::from_str(r#"{"query":"a","kind":"note","pinnedOnly":true}"#).unwrap();
        assert!(filter.pinned_only && filter.kind == Some(ItemKind::Note));
        let empty: ListFilter = serde_json::from_str("{}").unwrap();
        assert!(empty.query.is_none() && !empty.pinned_only);
        assert_eq!(serde_json::from_str::<Expiry>("\"1d\"").unwrap(), Expiry::OneDay);
    }
}