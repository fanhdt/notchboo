//! Tipe data Quick Shelf yang tidak bergantung pada Tauri, sehingga mudah diuji.

use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Batas panjang judul (karakter).
pub const MAX_TITLE_CHARS: usize = 200;
/// Panjang judul otomatis yang diambil dari baris pertama isi (karakter).
const AUTO_TITLE_CHARS: usize = 60;
/// Batas panjang label bahasa snippet (karakter).
const MAX_LANGUAGE_CHARS: usize = 32;
/// Batas ukuran isi catatan/snippet (byte).
pub const MAX_BODY_BYTES: usize = 1_000_000;
/// Daftar item hanya membawa potongan awal isi sebanyak ini (karakter).
pub const LIST_PREVIEW_CHARS: usize = 240;
/// Jumlah maksimum item yang dikembalikan satu kali `list`.
pub const LIST_LIMIT: i64 = 500;

const DAY_MS: i64 = 86_400_000;
const UNTITLED_NOTE: &str = "Catatan tanpa judul";
const UNTITLED_SNIPPET: &str = "Snippet tanpa judul";

/// Waktu sekarang dalam milidetik sejak epoch Unix.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------- Jenis item ----------

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemKind {
    File,
    Note,
    Snippet,
}

impl ItemKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::File => "file",
            Self::Note => "note",
            Self::Snippet => "snippet",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "file" => Some(Self::File),
            "note" => Some(Self::Note),
            "snippet" => Some(Self::Snippet),
            _ => None,
        }
    }
}

// ---------- Masa berlaku ----------

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
pub enum Expiry {
    #[serde(rename = "1d")]
    OneDay,
    #[default]
    #[serde(rename = "7d")]
    SevenDays,
    #[serde(rename = "never")]
    Never,
}

impl Expiry {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OneDay => "1d",
            Self::SevenDays => "7d",
            Self::Never => "never",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "1d" => Some(Self::OneDay),
            "7d" => Some(Self::SevenDays),
            "never" => Some(Self::Never),
            _ => None,
        }
    }

    /// Waktu kedaluwarsa (ms) jika masa berlaku dihitung mulai `now_ms`. `None` = tidak pernah.
    pub fn expires_at(self, now_ms: i64) -> Option<i64> {
        match self {
            Self::OneDay => Some(now_ms + DAY_MS),
            Self::SevenDays => Some(now_ms + 7 * DAY_MS),
            Self::Never => None,
        }
    }
}

// ---------- Data yang dikirim ke React ----------

/// Satu item di shelf. Pada hasil `list`, `body` hanya potongan awal;
/// gunakan `get` untuk isi lengkap.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfItem {
    pub id: i64,
    pub kind: ItemKind,
    pub title: String,
    pub body: Option<String>,
    pub language: Option<String>,
    pub file_name: Option<String>,
    pub source_path: Option<String>,
    pub extension: Option<String>,
    pub size_bytes: Option<i64>,
    pub pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub expires_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub default_expiry: Expiry,
}

/// File yang gagal diimpor beserta alasannya.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
    pub path: String,
    pub reason: String,
}

/// Hasil impor satu atau banyak file.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub imported: Vec<ShelfItem>,
    pub skipped: Vec<SkippedFile>,
}

/// Kemajuan impor, dikirim ke React sebelum tiap file disalin. `index` dimulai dari 1.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub index: usize,
    pub count: usize,
    pub file_name: String,
}

/// Hasil `shelf_open`. `NeedsConfirmation`: file berisiko (mis. .exe), React harus meminta
/// persetujuan lalu memanggil ulang dengan `allowRisky = true`.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OpenOutcome {
    Opened,
    NeedsConfirmation,
}

// ---------- Data yang diterima dari React ----------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewText {
    pub kind: ItemKind,
    pub title: String,
    pub body: String,
    pub language: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextUpdate {
    pub title: String,
    pub body: String,
    pub language: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ListFilter {
    pub query: Option<String>,
    pub kind: Option<ItemKind>,
    pub pinned_only: bool,
}

// ---------- Error ----------

#[derive(Debug)]
pub enum ShelfError {
    Db(rusqlite::Error),
    Invalid(String),
    NotFound,
    Unavailable(String),
    /// Masalah penyimpanan file di disk.
    Storage(String),
}

pub type ShelfResult<T> = Result<T, ShelfError>;

impl fmt::Display for ShelfError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Db(error) => write!(f, "Kesalahan database: {error}"),
            Self::Invalid(message) => f.write_str(message),
            Self::NotFound => f.write_str("Item tidak ditemukan."),
            Self::Unavailable(reason) => write!(f, "Quick Shelf tidak tersedia: {reason}"),
            Self::Storage(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for ShelfError {}

impl From<rusqlite::Error> for ShelfError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Db(error)
    }
}

// ---------- Validasi teks ----------

/// Teks yang sudah dirapikan dan siap disimpan.
#[derive(Debug, PartialEq, Eq)]
pub struct CleanText {
    pub title: String,
    pub body: String,
    pub language: Option<String>,
}

fn truncate_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

/// Judul otomatis: baris pertama yang tidak kosong dari isi.
fn derive_title(kind: ItemKind, body: &str) -> String {
    body.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| truncate_chars(line, AUTO_TITLE_CHARS))
        .unwrap_or_else(|| match kind {
            ItemKind::Snippet => UNTITLED_SNIPPET.to_string(),
            _ => UNTITLED_NOTE.to_string(),
        })
}

/// Memvalidasi dan merapikan input catatan/snippet.
/// Isi (`body`) sengaja tidak di-trim supaya indentasi kode tetap utuh.
pub fn clean_text(kind: ItemKind, title: &str, body: &str, language: Option<&str>) -> ShelfResult<CleanText> {
    if kind == ItemKind::File {
        return Err(ShelfError::Invalid("File harus diimpor, bukan dibuat sebagai teks.".into()));
    }
    if body.len() > MAX_BODY_BYTES {
        return Err(ShelfError::Invalid(format!("Isi terlalu besar (maksimum {} KB).", MAX_BODY_BYTES / 1000)));
    }

    let title = title.trim();
    if title.is_empty() && body.trim().is_empty() {
        return Err(ShelfError::Invalid("Judul atau isi tidak boleh kosong.".into()));
    }

    let title = if title.is_empty() {
        derive_title(kind, body)
    } else {
        truncate_chars(&title.replace(['\r', '\n'], " "), MAX_TITLE_CHARS)
    };

    let language = if kind == ItemKind::Snippet {
        language
            .map(|l| truncate_chars(l.trim(), MAX_LANGUAGE_CHARS).to_lowercase())
            .filter(|l| !l.is_empty())
    } else {
        None
    };

    Ok(CleanText { title, body: body.to_string(), language })
}