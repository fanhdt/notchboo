//! Notifikasi pesan WhatsApp untuk island.
//!
//! Windows tidak menyediakan cara resmi bagi aplikasi biasa untuk membaca notifikasi aplikasi lain
//! (API resminya mensyaratkan aplikasi berpaket MSIX). Sebagai gantinya, Notchboo membaca database
//! notifikasi milik Windows sendiri (`wpndatabase.db`): setiap toast yang muncul tersimpan di sana,
//! lengkap dengan teksnya. Hanya notifikasi WhatsApp dan Instagram (aplikasi desktop, atau versi web di
//! browser) yang diteruskan ke island, lewat event `message-notification`.
//!
//! Format database itu internal Windows, tidak didokumentasikan, dan bisa berubah antar versi.
//! Kalau berubah, watcher berhenti dan mencatat pesannya; bagian lain aplikasi tidak terpengaruh.
//!
//! Di platform selain Windows, watcher tidak melakukan apa pun.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

const MESSAGE_EVENT: &str = "message-notification";

/// Pesan yang dikirim ke React.
#[derive(Clone, Serialize)]
pub struct MessageNotice {
    app: String,
    sender: String,
    body: String,
}

/// Mengirim notifikasi contoh, untuk mencoba tampilannya dari menu tray tanpa menunggu pesan asli.
pub fn emit_sample(app: &AppHandle) {
    let _ = app.emit(
        MESSAGE_EVENT,
        MessageNotice {
            app: "whatsapp".into(),
            sender: "Bangboo".into(),
            body: "Wise-sama, ini contoh pesan masuk. Tampilannya sudah pas?".into(),
        },
    );
}

pub fn start_notification_watcher(app: &AppHandle) {
    #[cfg(windows)]
    windows_source::start(app);

    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod windows_source {
    use std::{
        fs,
        path::{Path, PathBuf},
        thread,
        time::{Duration, SystemTime},
    };

    use rusqlite::{params, types::ValueRef, Connection};
    use tauri::{AppHandle, Emitter};

    use super::{MessageNotice, MESSAGE_EVENT};

    const POLL_INTERVAL: Duration = Duration::from_millis(1500);
    const MAX_BODY_CHARS: usize = 200;
    const MAX_SENDER_CHARS: usize = 60;
    /// Aplikasi yang dikenali. Notifikasi aplikasi desktop dikenali dari nama aplikasinya; notifikasi
    /// versi web milik browser, jadi dikenali dari asal situs yang tercantum di toast.
    struct Source {
        id: &'static str,
        name: &'static str,
        app_ids: &'static [&'static str],
        origins: &'static [&'static str],
    }

    const SOURCES: [Source; 2] = [
        Source { id: "whatsapp", name: "WhatsApp", app_ids: &["whatsapp"], origins: &["web.whatsapp.com"] },
        Source { id: "instagram", name: "Instagram", app_ids: &["instagram"], origins: &["instagram.com"] },
    ];

    fn find_source(app_id: &str, xml: &str) -> Option<&'static Source> {
        let app_id = app_id.to_lowercase();
        let xml = xml.to_lowercase();

        SOURCES
            .iter()
            .find(|source| source.app_ids.iter().any(|id| app_id.contains(id)))
            .or_else(|| SOURCES.iter().find(|source| source.origins.iter().any(|origin| xml.contains(origin))))
    }

    const DB_FILES: [&str; 3] = ["wpndatabase.db", "wpndatabase.db-wal", "wpndatabase.db-shm"];

    pub fn start(app: &AppHandle) {
        let app = app.clone();

        thread::spawn(move || {
            if let Err(error) = run(&app) {
                eprintln!("pembaca notifikasi berhenti: {error}");
            }
        });
    }

    fn source_dir() -> Option<PathBuf> {
        let base = std::env::var_os("LOCALAPPDATA")?;
        Some(PathBuf::from(base).join("Microsoft").join("Windows").join("Notifications"))
    }

    /// Waktu ubah dan ukuran berkas database. Berubah berarti ada notifikasi baru (atau dihapus).
    fn fingerprint(dir: &Path) -> Vec<Option<(SystemTime, u64)>> {
        DB_FILES
            .iter()
            .map(|name| {
                let meta = fs::metadata(dir.join(name)).ok()?;
                Some((meta.modified().ok()?, meta.len()))
            })
            .collect()
    }

    /// Database dipakai terus oleh Windows dalam mode WAL. Menyalin ketiga berkasnya lalu membuka
    /// salinannya membuat kita melihat data terbaru tanpa mengganggu (atau mengunci) yang asli.
    fn copy_database(from: &Path, to: &Path) -> std::io::Result<()> {
        fs::create_dir_all(to)?;

        for name in DB_FILES {
            let target = to.join(name);
            match fs::copy(from.join(name), &target) {
                Ok(_) => {}
                // -wal dan -shm tidak selalu ada.
                Err(error) if error.kind() == std::io::ErrorKind::NotFound && name != DB_FILES[0] => {
                    let _ = fs::remove_file(&target);
                }
                Err(error) => return Err(error),
            }
        }
        Ok(())
    }

    fn run(app: &AppHandle) -> Result<(), String> {
        let source = source_dir().ok_or("LOCALAPPDATA tidak ditemukan")?;
        if !source.join(DB_FILES[0]).exists() {
            return Err(format!("database notifikasi tidak ada di {}", source.display()));
        }

        let copy_dir = std::env::temp_dir().join("notchboo-notifications");

        // `None` = belum mengambil titik awal. Notifikasi yang sudah ada sebelum Notchboo menyala tidak ditampilkan.
        let mut last_id: Option<i64> = None;
        let mut last_seen: Option<Vec<Option<(SystemTime, u64)>>> = None;

        loop {
            thread::sleep(POLL_INTERVAL);

            let current = fingerprint(&source);
            if last_seen.as_ref() == Some(&current) {
                continue;
            }

            // Salinan gagal (mis. sedang ditulis): coba lagi di putaran berikutnya.
            if copy_database(&source, &copy_dir).is_err() {
                continue;
            }
            let Ok(connection) = Connection::open(copy_dir.join(DB_FILES[0])) else {
                continue;
            };

            match last_id {
                None => {
                    let max: Option<i64> = connection
                        .query_row("SELECT MAX(Id) FROM Notification", [], |row| row.get(0))
                        .map_err(|error| format!("skema database tidak dikenali: {error}"))?;
                    last_id = Some(max.unwrap_or(0));
                    eprintln!("notifikasi: pembaca aktif, titik awal id {}", max.unwrap_or(0));
                }
                Some(after) => {
                    let (notices, newest) = read_new(&connection, after).map_err(|error| format!("skema database tidak dikenali: {error}"))?;
                    last_id = Some(newest.max(after));

                    for notice in notices {
                        // Gagal mengirim satu event bukan masalah fatal.
                        let _ = app.emit(MESSAGE_EVENT, notice);
                    }
                }
            }

            last_seen = Some(current);
        }
    }

    /// Notifikasi WhatsApp dengan Id di atas `after`, beserta Id terbesar yang terbaca.
    fn read_new(connection: &Connection, after: i64) -> rusqlite::Result<(Vec<MessageNotice>, i64)> {
        let mut statement = connection.prepare(
            "SELECT n.Id, h.PrimaryId, n.Payload \
             FROM Notification n JOIN NotificationHandler h ON h.RecordId = n.HandlerId \
             WHERE n.Id > ?1 ORDER BY n.Id",
        )?;

        let mut rows = statement.query(params![after])?;
        let mut notices = Vec::new();
        let mut newest = after;

        while let Some(row) = rows.next()? {
            let id: i64 = row.get(0)?;
            newest = newest.max(id);

            let app_id: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();

            let payload = match row.get_ref(2)? {
                ValueRef::Blob(bytes) | ValueRef::Text(bytes) => bytes.to_vec(),
                _ => continue,
            };
            let xml = decode(&payload);

            // WhatsApp Web: toast-nya milik browser (Chrome, Edge, ...), tetapi mencantumkan asal situsnya.
            let source = find_source(&app_id, &xml);
            eprintln!("notifikasi: id {id} dari \"{app_id}\" (dikenali: {})", source.map_or("tidak", |source| source.name));
            let Some(source) = source else {
                continue;
            };

            match parse_toast(&xml, source) {
                Some(notice) => notices.push(notice),
                None => eprintln!("notifikasi: id {id} cocok tetapi teksnya tidak terbaca, isi: {xml}"),
            }
        }

        Ok((notices, newest))
    }

    /// Payload toast biasanya UTF-8, tetapi sebagian versi Windows menyimpannya sebagai UTF-16.
    fn decode(bytes: &[u8]) -> String {
        let utf16 = bytes.starts_with(&[0xFF, 0xFE]) || (bytes.len() >= 4 && bytes[1] == 0 && bytes[3] == 0);
        if !utf16 {
            return String::from_utf8_lossy(bytes).into_owned();
        }

        let body = bytes.strip_prefix(&[0xFF, 0xFE]).unwrap_or(bytes);
        let units: Vec<u16> = body.chunks_exact(2).map(|pair| u16::from_le_bytes([pair[0], pair[1]])).collect();
        String::from_utf16_lossy(&units)
    }

    /// Mengambil teks dari toast. Baris pertama adalah pengirim, sisanya isi pesan.
    fn parse_toast(xml: &str, source: &Source) -> Option<MessageNotice> {
        let texts = extract_texts(xml);
        let (sender, body) = match texts.as_slice() {
            [] => return None,
            [only] => (source.name.to_string(), only.clone()),
            [first, rest @ ..] => (first.clone(), rest.join(" ")),
        };

        if body.trim().is_empty() {
            return None;
        }

        Some(MessageNotice {
            app: source.id.into(),
            sender: sender.chars().take(MAX_SENDER_CHARS).collect(),
            body: body.chars().take(MAX_BODY_CHARS).collect(),
        })
    }

    /// Isi setiap elemen `<text>` (selain atribusi), tanpa pustaka XML: bentuk toast cukup sederhana.
    fn extract_texts(xml: &str) -> Vec<String> {
        let mut texts = Vec::new();
        let mut rest = xml;

        while let Some(start) = rest.find("<text") {
            rest = &rest[start + "<text".len()..];

            // Bukan elemen <text> (mis. <textStyle>), lewati.
            if !rest.starts_with(['>', ' ', '/', '\t', '\r', '\n']) {
                continue;
            }

            let Some(tag_end) = rest.find('>') else { break };
            let attributes = &rest[..tag_end];
            rest = &rest[tag_end + 1..];

            if attributes.ends_with('/') {
                continue; // <text ... />
            }

            let Some(close) = rest.find("</text>") else { break };
            let content = &rest[..close];
            rest = &rest[close + "</text>".len()..];

            if attributes.contains("attribution") {
                continue;
            }

            let value = unescape(content).trim().to_string();
            if !value.is_empty() {
                texts.push(value);
            }
        }

        texts
    }

    fn unescape(text: &str) -> String {
        let mut out = String::with_capacity(text.len());
        let mut rest = text;

        while let Some(amp) = rest.find('&') {
            out.push_str(&rest[..amp]);
            rest = &rest[amp..];

            let Some(semi) = rest.find(';').filter(|index| *index <= 10) else {
                out.push('&');
                rest = &rest[1..];
                continue;
            };

            let entity = &rest[1..semi];
            let decoded = match entity {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                _ => entity
                    .strip_prefix("#x")
                    .and_then(|hex| u32::from_str_radix(hex, 16).ok())
                    .or_else(|| entity.strip_prefix('#').and_then(|number| number.parse().ok()))
                    .and_then(char::from_u32),
            };

            match decoded {
                Some(character) => {
                    out.push(character);
                    rest = &rest[semi + 1..];
                }
                None => {
                    out.push('&');
                    rest = &rest[1..];
                }
            }
        }

        out.push_str(rest);
        out
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn reads_sender_and_message_from_a_toast() {
            let xml = r#"<toast><visual><binding template="ToastGeneric"><text>Budi</text><text>Halo &amp; selamat pagi</text><text placement="attribution">WhatsApp</text></binding></visual></toast>"#;
            let notice = parse_toast(xml, &SOURCES[0]).expect("toast terbaca");
            assert_eq!(notice.sender, "Budi");
            assert_eq!(notice.body, "Halo & selamat pagi");
        }

        #[test]
        fn recognises_apps_by_name_or_by_website() {
            assert_eq!(find_source("5319275A.WhatsAppDesktop_x!App", "").map(|s| s.id), Some("whatsapp"));
            assert_eq!(find_source("Chrome", "<text>www.instagram.com</text>").map(|s| s.id), Some("instagram"));
            assert_eq!(find_source("Chrome", "<text>web.whatsapp.com</text>").map(|s| s.id), Some("whatsapp"));
            assert!(find_source("Chrome", "<text>example.com</text>").is_none());
        }

        #[test]
        fn decodes_numeric_entities_and_keeps_stray_ampersands() {
            assert_eq!(unescape("a &#65; &#x42; & c"), "a A B & c");
        }

        #[test]
        fn decodes_utf16_payloads() {
            let bytes: Vec<u8> = "<text>Hi</text>".encode_utf16().flat_map(u16::to_le_bytes).collect();
            assert_eq!(decode(&bytes), "<text>Hi</text>");
        }
    }
}