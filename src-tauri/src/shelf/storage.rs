//! Penyimpanan file terkelola Quick Shelf di disk. Tidak bergantung pada Tauri.
//!
//! Struktur: `<root>/files/<id>/<nama-aman>`. File asli pengguna hanya dibaca, tidak pernah diubah.
//! Impor dua tahap: `stage` menyalin ke `files/.incoming-<waktu>-<n>/`, lalu `commit` memindahkan
//! folder itu ke `files/<id>/` setelah baris database dibuat.

use std::collections::HashSet;
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use super::model::now_ms;

pub const FILES_DIR: &str = "files";
const INCOMING_PREFIX: &str = ".incoming-";

/// Batas ukuran satu file. Shelf adalah ruang sementara, bukan tempat arsip.
pub const DEFAULT_MAX_FILE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// Panjang nama file tersimpan. Path Windows dibatasi 260 karakter; folder data + `files\<id>\` sudah memakan sebagian.
const MAX_STORED_NAME_CHARS: usize = 100;
const MAX_EXTENSION_CHARS: usize = 16;

/// Antivirus kadang menahan folder yang baru ditulis, sehingga `rename` gagal sesaat.
const RENAME_ATTEMPTS: u32 = 5;
const RENAME_RETRY_DELAY: Duration = Duration::from_millis(100);

static STAGE_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Nama perangkat yang dilarang Windows sebagai nama file (dengan atau tanpa ekstensi).
const RESERVED_NAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1",
    "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Ekstensi yang dijalankan (bukan sekadar dibaca) bila dibuka lewat aplikasi default Windows.
const RISKY_EXTENSIONS: &[&str] = &[
    "exe", "com", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi", "msp", "scr", "hta",
    "lnk", "url", "reg", "jar", "cpl", "dll", "pif", "appx", "msix", "application", "gadget", "inf", "scf",
];

// ---------- Nama file ----------

fn truncate_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

/// Memisahkan `nama` dan `ekstensi` pada titik terakhir. Titik di awal (`.gitignore`) bukan pemisah.
fn split_extension(name: &str) -> (&str, Option<&str>) {
    match name.rfind('.') {
        Some(index) if index > 0 => (&name[..index], Some(&name[index + 1..])),
        _ => (name, None),
    }
}

/// Mengubah nama file sembarang menjadi nama yang aman di Windows:
/// karakter terlarang dan karakter kontrol diganti `_`, titik/spasi di ujung dibuang,
/// nama perangkat (`CON`, `NUL`, ...) diberi awalan `_`, dan panjangnya dibatasi.
/// Hasilnya idempoten: membersihkan nama yang sudah bersih tidak mengubahnya.
pub fn sanitize_file_name(original: &str) -> String {
    let cleaned: String = original
        .chars()
        .map(|c| if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') { '_' } else { c })
        .collect();

    let trimmed = cleaned.trim_start().trim_end_matches(|c: char| c == '.' || c.is_whitespace());
    if trimmed.is_empty() {
        return "file".to_string();
    }

    let mut name = trimmed.to_string();
    let base = name.split('.').next().unwrap_or("");
    if RESERVED_NAMES.iter().any(|reserved| reserved.eq_ignore_ascii_case(base)) {
        name.insert(0, '_');
    }

    let (stem, extension) = split_extension(&name);
    let extension = extension.map(|e| truncate_chars(e, MAX_EXTENSION_CHARS));
    let budget = MAX_STORED_NAME_CHARS.saturating_sub(extension.as_ref().map_or(0, |e| e.chars().count() + 1));
    let stem = truncate_chars(stem, budget);

    let rebuilt = match extension {
        Some(extension) => format!("{stem}.{extension}"),
        None => stem,
    };
    let rebuilt = rebuilt.trim_end_matches(|c: char| c == '.' || c.is_whitespace());

    if rebuilt.is_empty() { "file".to_string() } else { rebuilt.to_string() }
}

/// Ekstensi huruf kecil tanpa titik, atau `None`.
pub fn extension_of(name: &str) -> Option<String> {
    split_extension(name)
        .1
        .filter(|e| !e.is_empty())
        .map(|e| e.to_lowercase())
}

pub fn is_risky_extension(extension: &str) -> bool {
    RISKY_EXTENSIONS.iter().any(|risky| risky.eq_ignore_ascii_case(extension))
}

// ---------- Kegagalan impor ----------

#[derive(Debug, PartialEq, Eq)]
pub enum ImportError {
    NotFound,
    IsDirectory,
    NotRegularFile,
    TooLarge { limit: u64 },
    Io(String),
}

impl fmt::Display for ImportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => f.write_str("File tidak ditemukan."),
            Self::IsDirectory => f.write_str("Folder belum didukung. Impor file di dalamnya satu per satu."),
            Self::NotRegularFile => f.write_str("Bukan file biasa."),
            Self::TooLarge { limit } => write!(f, "Ukuran file melebihi batas {} GB.", limit / (1024 * 1024 * 1024)),
            Self::Io(message) => write!(f, "Gagal menyalin: {message}"),
        }
    }
}

/// File yang sudah disalin ke area sementara, menunggu ditempatkan di lokasi akhir.
#[derive(Debug)]
pub struct Staged {
    tmp_dir: PathBuf,
    pub stored_name: String,
    pub original_name: String,
    pub size_bytes: u64,
    pub extension: Option<String>,
}

// ---------- Storage ----------

pub struct Storage {
    root: PathBuf,
    max_file_bytes: u64,
}

impl Storage {
    pub fn new(root: PathBuf) -> Self {
        Self { root, max_file_bytes: DEFAULT_MAX_FILE_BYTES }
    }

    #[cfg(test)]
    pub fn with_max_file_bytes(mut self, max_file_bytes: u64) -> Self {
        self.max_file_bytes = max_file_bytes;
        self
    }

    fn files_dir(&self) -> PathBuf {
        self.root.join(FILES_DIR)
    }

    /// Membuat folder penyimpanan bila belum ada.
    pub fn prepare(&self) -> io::Result<()> {
        fs::create_dir_all(self.files_dir())
    }

    /// Tahap 1: memvalidasi dan menyalin `source` ke area sementara. Tidak menyentuh database.
    ///
    /// Memakai `fs::copy` (di Windows: `CopyFileEx`), bukan salinan manual per potongan,
    /// supaya atribut file dan alternate data stream ikut tersalin, termasuk tanda
    /// "diunduh dari internet" yang memicu peringatan SmartScreen saat file dibuka.
    pub fn stage(&self, source: &Path) -> Result<Staged, ImportError> {
        let metadata = fs::metadata(source).map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound { ImportError::NotFound } else { ImportError::Io(error.to_string()) }
        })?;

        if metadata.is_dir() {
            return Err(ImportError::IsDirectory);
        }
        if !metadata.is_file() {
            return Err(ImportError::NotRegularFile);
        }
        if metadata.len() > self.max_file_bytes {
            return Err(ImportError::TooLarge { limit: self.max_file_bytes });
        }

        let original_name = source
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .ok_or(ImportError::NotRegularFile)?;
        let stored_name = sanitize_file_name(&original_name);

        let tmp_dir = self.files_dir().join(format!(
            "{INCOMING_PREFIX}{}-{}",
            now_ms(),
            STAGE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&tmp_dir).map_err(|error| ImportError::Io(error.to_string()))?;

        let destination = tmp_dir.join(&stored_name);
        if let Err(error) = fs::copy(source, &destination) {
            let _ = fs::remove_dir_all(&tmp_dir);
            return Err(ImportError::Io(error.to_string()));
        }

        let size_bytes = fs::metadata(&destination).map(|m| m.len()).unwrap_or(metadata.len());
        let extension = extension_of(&stored_name);
        Ok(Staged { tmp_dir, stored_name, original_name, size_bytes, extension })
    }

    /// Tahap 2: memindahkan folder sementara menjadi `files/<id>/`. Mengembalikan path relatif.
    pub fn commit(&self, staged: &Staged, id: i64) -> io::Result<String> {
        let final_dir = self.files_dir().join(id.to_string());

        let mut attempt = 1;
        loop {
            match fs::rename(&staged.tmp_dir, &final_dir) {
                Ok(()) => break,
                Err(error) if attempt >= RENAME_ATTEMPTS => return Err(error),
                Err(_) => {
                    attempt += 1;
                    thread::sleep(RENAME_RETRY_DELAY);
                }
            }
        }
        Ok(format!("{FILES_DIR}/{id}/{}", staged.stored_name))
    }

    /// Membuang hasil `stage` yang tidak jadi dipakai.
    pub fn discard(&self, staged: &Staged) {
        let _ = fs::remove_dir_all(&staged.tmp_dir);
    }

    /// Mengubah path relatif dari database menjadi path absolut, atau `None` bila bentuknya
    /// bukan persis `files/<angka>/<nama-aman>`. Ini mencegah `..`, path absolut, dan sejenisnya
    /// keluar dari folder penyimpanan, walau isi database rusak.
    pub fn resolve(&self, rel: &str) -> Option<PathBuf> {
        let mut parts = rel.split('/');
        let (dir, id, name) = (parts.next()?, parts.next()?, parts.next()?);

        let valid = parts.next().is_none()
            && dir == FILES_DIR
            && !id.is_empty()
            && id.bytes().all(|b| b.is_ascii_digit())
            && !name.is_empty()
            && sanitize_file_name(name) == name;

        // Disusun per komponen agar separatornya sesuai Windows (explorer.exe menolak campuran `/` dan `\`).
        valid.then(|| self.files_dir().join(id).join(name))
    }

    /// Menghapus folder item. Folder yang memang sudah tidak ada dianggap berhasil.
    pub fn remove_item(&self, rel: &str) -> io::Result<()> {
        let file = self
            .resolve(rel)
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path penyimpanan tidak valid"))?;
        let dir = file
            .parent()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path penyimpanan tidak valid"))?;

        match fs::remove_dir_all(dir) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
            _ => Ok(()),
        }
    }

    /// Membersihkan folder yatim di `files/`: folder `<id>` yang tidak punya baris database,
    /// dan sisa `.incoming-*` dari proses yang sudah mati (cap waktunya lebih tua dari `stale_before_ms`).
    /// Folder dengan nama lain tidak disentuh. Mengembalikan jumlah folder yang dihapus.
    pub fn sweep(&self, known_ids: &HashSet<i64>, stale_before_ms: i64) -> usize {
        let Ok(entries) = fs::read_dir(self.files_dir()) else {
            return 0;
        };

        let mut removed = 0;
        for entry in entries.flatten() {
            // `file_type` tidak mengikuti symlink/junction, jadi kita tidak pernah menelusuri keluar.
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }

            let name = entry.file_name().to_string_lossy().into_owned();
            let orphan = if let Some(rest) = name.strip_prefix(INCOMING_PREFIX) {
                rest.split('-')
                    .next()
                    .and_then(|stamp| stamp.parse::<i64>().ok())
                    .map_or(true, |stamp| stamp < stale_before_ms)
            } else {
                name.parse::<i64>().map(|id| !known_ids.contains(&id)).unwrap_or(false)
            };

            if orphan && fs::remove_dir_all(entry.path()).is_ok() {
                removed += 1;
            }
        }
        removed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shelf::testutil::{write_file, TempDir};

    fn storage(tmp: &TempDir) -> Storage {
        let storage = Storage::new(tmp.path().join("shelf"));
        storage.prepare().unwrap();
        storage
    }

    #[test]
    fn file_names_are_sanitized() {
        let cases = [
            ("laporan.pdf", "laporan.pdf"),
            ("a<b>.txt", "a_b_.txt"),
            ("report: final?.pdf", "report_ final_.pdf"),
            (r"C:\temp\x.txt", "C__temp_x.txt"),
            ("a\u{0007}b", "a_b"),
            ("name. . ", "name"),
            ("...", "file"),
            ("   ", "file"),
            ("", "file"),
            (".gitignore", ".gitignore"),
            ("CON", "_CON"),
            ("nul.txt", "_nul.txt"),
            ("com1.tar.gz", "_com1.tar.gz"),
            ("CONSOLE.txt", "CONSOLE.txt"),
            ("COM10", "COM10"),
            ("catatan é ü 日本語.md", "catatan é ü 日本語.md"),
        ];
        for (input, expected) in cases {
            assert_eq!(sanitize_file_name(input), expected, "input: {input:?}");
        }
    }

    #[test]
    fn long_names_are_truncated_keeping_extension_on_char_boundaries() {
        let ascii = sanitize_file_name(&format!("{}.txt", "a".repeat(300)));
        assert_eq!(ascii.chars().count(), MAX_STORED_NAME_CHARS);
        assert!(ascii.ends_with(".txt"));

        let unicode = sanitize_file_name(&format!("{}.md", "é".repeat(300)));
        assert_eq!(unicode.chars().count(), MAX_STORED_NAME_CHARS);
        assert!(unicode.ends_with(".md"));

        let long_ext = sanitize_file_name(&format!("a.{}", "x".repeat(40)));
        assert_eq!(long_ext, format!("a.{}", "x".repeat(MAX_EXTENSION_CHARS)));
    }

    #[test]
    fn sanitizing_is_idempotent() {
        for input in ["a<b>.txt", "CON", "..", "x ", &"é".repeat(300), &format!("{}.{}", "a".repeat(200), "b".repeat(30)), "con.tar.gz"] {
            let once = sanitize_file_name(input);
            assert_eq!(sanitize_file_name(&once), once, "input: {input:?}");
        }
    }

    #[test]
    fn extension_parsing_and_risky_list() {
        assert_eq!(extension_of("Archive.TAR.GZ").as_deref(), Some("gz"));
        assert_eq!(extension_of("noext"), None);
        assert_eq!(extension_of(".gitignore"), None);
        assert!(is_risky_extension("exe") && is_risky_extension("PS1") && is_risky_extension("lnk"));
        assert!(!is_risky_extension("txt") && !is_risky_extension("pdf"));
    }

    #[test]
    fn stage_copies_without_modifying_original() {
        let tmp = TempDir::new("stage");
        let source = write_file(tmp.path(), "asli.txt", b"halo");
        let storage = storage(&tmp);

        let staged = storage.stage(&source).unwrap();
        assert_eq!((staged.stored_name.as_str(), staged.size_bytes), ("asli.txt", 4));
        assert_eq!(staged.extension.as_deref(), Some("txt"));
        assert_eq!(fs::read(staged.tmp_dir.join("asli.txt")).unwrap(), b"halo");
        assert_eq!(fs::read(&source).unwrap(), b"halo");
    }

    #[test]
    fn stage_rejects_folder_missing_and_oversized_files() {
        let tmp = TempDir::new("reject");
        let storage = storage(&tmp).with_max_file_bytes(3);

        assert_eq!(storage.stage(tmp.path()).unwrap_err(), ImportError::IsDirectory);
        assert_eq!(storage.stage(&tmp.path().join("tidak-ada.txt")).unwrap_err(), ImportError::NotFound);

        let big = write_file(tmp.path(), "besar.bin", b"12345");
        assert!(matches!(storage.stage(&big).unwrap_err(), ImportError::TooLarge { .. }));
        // Penolakan terjadi sebelum ada yang disalin: tidak ada folder sementara tersisa.
        let leftovers = fs::read_dir(tmp.path().join("shelf").join(FILES_DIR)).unwrap().count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn commit_resolve_and_remove_item() {
        let tmp = TempDir::new("commit");
        let source = write_file(tmp.path(), "x.txt", b"isi");
        let storage = storage(&tmp);

        let staged = storage.stage(&source).unwrap();
        let rel = storage.commit(&staged, 42).unwrap();
        assert_eq!(rel, "files/42/x.txt");

        let path = storage.resolve(&rel).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"isi");
        assert!(!staged.tmp_dir.exists());

        storage.remove_item(&rel).unwrap();
        assert!(!path.exists() && !path.parent().unwrap().exists());
        storage.remove_item(&rel).unwrap(); // sudah hilang: tetap berhasil
    }

    #[test]
    fn discard_removes_staging_folder() {
        let tmp = TempDir::new("discard");
        let source = write_file(tmp.path(), "x.txt", b"isi");
        let storage = storage(&tmp);
        let staged = storage.stage(&source).unwrap();
        storage.discard(&staged);
        assert!(!staged.tmp_dir.exists());
    }

    #[test]
    fn resolve_rejects_paths_that_could_escape_storage() {
        let storage = Storage::new(PathBuf::from("root"));
        assert!(storage.resolve("files/1/a.txt").is_some());
        for bad in [
            "../x",
            "files/../x",
            "files/1/../../x",
            "files/1/..",
            "files/1/",
            "files//a.txt",
            "files/abc/a.txt",
            "files/-1/a.txt",
            "files/1/a/b.txt",
            "other/1/a.txt",
            "/etc/passwd",
            "C:/Windows/system32/cmd.exe",
            r"files/1/a\b.txt",
            "files/1/a:b.txt",
            "",
        ] {
            assert!(storage.resolve(bad).is_none(), "seharusnya ditolak: {bad:?}");
        }
        assert!(storage.remove_item("../x").is_err());
    }

    #[test]
    fn sweep_removes_only_orphans() {
        let tmp = TempDir::new("sweep");
        let storage = storage(&tmp);
        let files = tmp.path().join("shelf").join(FILES_DIR);
        let now = now_ms();

        for dir in ["1", "2", ".incoming-5-0", &format!(".incoming-{}-0", now + 60_000), "catatan-pribadi"] {
            fs::create_dir_all(files.join(dir)).unwrap();
        }
        fs::write(files.join("readme.txt"), b"x").unwrap();

        let known: HashSet<i64> = [1].into();
        let removed = storage.sweep(&known, now);

        assert_eq!(removed, 2); // folder "2" (yatim) dan ".incoming-5-0" (basi)
        assert!(files.join("1").exists());
        assert!(!files.join("2").exists());
        assert!(!files.join(".incoming-5-0").exists());
        assert!(files.join(format!(".incoming-{}-0", now + 60_000)).exists()); // impor yang sedang berjalan aman
        assert!(files.join("catatan-pribadi").exists()); // bukan milik kita
        assert!(files.join("readme.txt").exists());
    }
}