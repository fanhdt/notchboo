use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Batas ukuran teks clipboard: 1 MiB.
pub const MAX_CLIPBOARD_TEXT_BYTES: usize = 1024 * 1024;

/// Batas jumlah item yang dapat diminta dalam satu query.
pub const MAX_LIST_LIMIT: u16 = 500;

/// Waktu sekarang dalam milidetik sejak Unix epoch.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// Satu item dalam clipboard history.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardItem {
    pub id: i64,
    pub content: String,
    pub pinned: bool,
    pub source_app: Option<String>,
    pub created_at: i64,
}

/// Filter untuk mengambil clipboard history.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClipboardFilter {
    pub query: Option<String>,
    pub pinned_only: bool,
    pub limit: Option<u16>,
}

impl ClipboardFilter {
    pub fn normalized_limit(&self) -> u16 {
        self.limit.unwrap_or(100).clamp(1, MAX_LIST_LIMIT)
    }
}

/// Memastikan teks clipboard layak disimpan.
///
/// Isi teks tidak di-trim agar whitespace dan indentasi kode tetap terjaga.
pub fn validate_clipboard_text(content: &str) -> Result<(), String> {
    if content.trim().is_empty() {
        return Err("Clipboard kosong.".into());
    }

    if content.len() > MAX_CLIPBOARD_TEXT_BYTES {
        return Err(format!(
            "Teks clipboard terlalu besar. Maksimum {} MiB.",
            MAX_CLIPBOARD_TEXT_BYTES / (1024 * 1024)
        ));
    }

    if content.contains('\0') {
        return Err("Teks clipboard mengandung karakter null.".into());
    }

    Ok(())
}

/// Membersihkan nama aplikasi sumber untuk disimpan sebagai metadata.
///
/// Hanya nama executable, bukan path lengkap, yang disimpan.
pub fn normalize_source_app(value: Option<&str>) -> Option<String> {
    value
        .map(|value| {
            value
                .rsplit(['/', '\\'])
                .next()
                .unwrap_or(value)
                .trim()
                .to_string()
        })
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_normal_text() {
        assert!(validate_clipboard_text("Hello Mochi").is_ok());
    }

    #[test]
    fn preserves_whitespace_and_indentation() {
        let content = "  hello\n    world\n";
        assert!(validate_clipboard_text(content).is_ok());
    }

    #[test]
    fn rejects_empty_or_whitespace_only_text() {
        assert!(validate_clipboard_text("").is_err());
        assert!(validate_clipboard_text("  \n\t ").is_err());
    }

    #[test]
    fn rejects_text_over_size_limit() {
        let content = "a".repeat(MAX_CLIPBOARD_TEXT_BYTES + 1);
        assert!(validate_clipboard_text(&content).is_err());
    }

    #[test]
    fn rejects_null_character() {
        assert!(validate_clipboard_text("hello\0world").is_err());
    }

    #[test]
    fn normalizes_executable_path_to_file_name() {
        assert_eq!(
            normalize_source_app(Some(r"C:\Program Files\Example\example.exe")),
            Some("example.exe".into())
        );

        assert_eq!(
            normalize_source_app(Some("/usr/bin/example")),
            Some("example".into())
        );
    }

    #[test]
    fn ignores_empty_source_app() {
        assert_eq!(normalize_source_app(None), None);
        assert_eq!(normalize_source_app(Some("  ")), None);
    }

    #[test]
    fn filter_limit_is_bounded() {
        assert_eq!(ClipboardFilter::default().normalized_limit(), 100);

        assert_eq!(
            ClipboardFilter {
                limit: Some(1000),
                ..Default::default()
            }
            .normalized_limit(),
            MAX_LIST_LIMIT
        );

        assert_eq!(
            ClipboardFilter {
                limit: Some(0),
                ..Default::default()
            }
            .normalized_limit(),
            1
        );
    }
}
