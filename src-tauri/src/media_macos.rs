//! Versi macOS dari `media.rs`: info lagu dan kontrol pemutar untuk Spotify dan Apple Music.
//!
//! macOS tidak punya API publik untuk "media yang sedang diputar" (MediaRemote bersifat privat dan
//! diblokir untuk aplikasi pihak ketiga sejak macOS 15.4). Sebagai gantinya, Notchboo bertanya langsung
//! ke Spotify dan Music lewat AppleScript (`osascript`). Pemutar lain, misalnya YouTube di browser,
//! belum didukung.
//!
//! Bentuk publiknya sama dengan versi Windows: command `get_media_info`, `get_playback_info`,
//! `media_control`, `media_seek`, dan event `media-changed` / `playback-changed`.

use std::process::Command;
use std::sync::Mutex;
use std::{thread, time::Duration};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// Event yang didengarkan React: lagu berganti (membawa artwork).
const MEDIA_EVENT: &str = "media-changed";
/// Event yang didengarkan React: status putar atau posisi berubah.
const PLAYBACK_EVENT: &str = "playback-changed";
const POLL_INTERVAL: Duration = Duration::from_millis(1500);
/// Batas ukuran artwork, melindungi dari alokasi memori yang tidak masuk akal.
const MAX_ARTWORK_BYTES: usize = 5_000_000;
/// Pemisah kolom di keluaran AppleScript (karakter ASCII 31, tidak muncul di judul lagu).
const SEP: char = '\u{1f}';

/// Informasi lagu yang dikirim ke React.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    title: String,
    artist: String,
    album: String,
    /// Gambar sampul sebagai data URL (`data:image/...;base64,...`), jika ada.
    artwork: Option<String>,
}

/// Status putar dan posisi, dikirim ke React.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackInfo {
    is_playing: bool,
    /// Posisi saat event ini dikirim, dalam milidetik.
    position_ms: u64,
    /// Durasi total. 0 berarti tidak diketahui.
    duration_ms: u64,
}

/// Perintah yang bisa dikirim React ke pemutar.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaAction {
    Previous,
    PlayPause,
    Next,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Player {
    Spotify,
    Music,
}

impl Player {
    const ALL: [Player; 2] = [Player::Spotify, Player::Music];

    /// Nama aplikasi sekaligus nama prosesnya.
    fn app(self) -> &'static str {
        match self {
            Player::Spotify => "Spotify",
            Player::Music => "Music",
        }
    }

    fn from_name(name: &str) -> Option<Player> {
        Player::ALL.into_iter().find(|player| player.app() == name)
    }
}

/// Hasil satu pembacaan dari sebuah pemutar.
struct Snapshot {
    player: Player,
    title: String,
    artist: String,
    album: String,
    playing: bool,
    position_ms: u64,
    duration_ms: u64,
    /// Hanya Spotify yang memberi URL artwork.
    artwork_url: Option<String>,
    /// Pengenal lagu, untuk mengetahui kapan lagunya berganti.
    track_id: String,
}

/// Pemutar yang terakhir terlihat aktif; menjadi sasaran perintah kontrol.
static ACTIVE: Mutex<Option<Player>> = Mutex::new(None);
/// Info lagu terakhir yang dikirim, untuk mengisi tampilan awal React.
static LAST_INFO: Mutex<Option<MediaInfo>> = Mutex::new(None);

// ---------- Command yang dipanggil React ----------

#[tauri::command]
pub async fn get_media_info() -> Result<Option<MediaInfo>, String> {
    Ok(LAST_INFO.lock().map_err(|error| error.to_string())?.clone())
}

#[tauri::command]
pub async fn get_playback_info() -> Result<Option<PlaybackInfo>, String> {
    run_blocking(|| read_snapshot().map(|snapshot| playback_of(&snapshot))).await
}

/// Mengirim perintah (previous / play-pause / next) ke pemutar aktif.
/// Mengembalikan `true` jika pemutar menerimanya.
#[tauri::command]
pub async fn media_control(action: MediaAction) -> Result<bool, String> {
    run_blocking(move || send_action(action)).await
}

#[tauri::command]
pub async fn media_seek(position_ms: u64) -> Result<bool, String> {
    run_blocking(move || seek_to(position_ms)).await
}

/// Menjalankan pekerjaan yang memblokir (menunggu `osascript`) di thread khusus.
async fn run_blocking<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work).await.map_err(|error| error.to_string())
}

// ---------- Pemantau ----------

pub fn start_media_watcher(app: &AppHandle) {
    let app = app.clone();

    thread::spawn(move || {
        let mut last_key: Option<String> = None;
        let mut announced_empty = false;

        loop {
            match read_snapshot() {
                Some(snapshot) => {
                    announced_empty = false;
                    set_active(Some(snapshot.player));

                    // Artwork hanya dimuat ulang jika lagunya memang berganti.
                    let key = format!("{}:{}", snapshot.player.app(), snapshot.track_id);
                    if last_key.as_deref() != Some(key.as_str()) {
                        last_key = Some(key);

                        let info = MediaInfo {
                            title: snapshot.title.clone(),
                            artist: snapshot.artist.clone(),
                            album: snapshot.album.clone(),
                            artwork: load_artwork(&snapshot),
                        };
                        if let Ok(mut last) = LAST_INFO.lock() {
                            *last = Some(info.clone());
                        }
                        // Gagal mengirim satu event bukan masalah fatal.
                        let _ = app.emit(MEDIA_EVENT, Some(info));
                    }

                    let _ = app.emit(PLAYBACK_EVENT, Some(playback_of(&snapshot)));
                }
                None => {
                    if !announced_empty {
                        announced_empty = true;
                        last_key = None;
                        set_active(None);
                        if let Ok(mut last) = LAST_INFO.lock() {
                            *last = None;
                        }
                        let _ = app.emit(MEDIA_EVENT, None::<MediaInfo>);
                        let _ = app.emit(PLAYBACK_EVENT, None::<PlaybackInfo>);
                    }
                }
            }

            thread::sleep(POLL_INTERVAL);
        }
    });
}

fn set_active(player: Option<Player>) {
    if let Ok(mut active) = ACTIVE.lock() {
        *active = player;
    }
}

fn playback_of(snapshot: &Snapshot) -> PlaybackInfo {
    PlaybackInfo {
        is_playing: snapshot.playing,
        position_ms: snapshot.position_ms,
        duration_ms: snapshot.duration_ms,
    }
}

// ---------- Akses ke pemutar ----------

/// Menjalankan AppleScript. `None` jika gagal (mis. izin otomasi ditolak atau pemutar tidak punya lagu).
fn osascript(script: &str) -> Option<String> {
    let output = Command::new("osascript").arg("-e").arg(script).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim_end_matches(['\n', '\r']).to_string())
}

/// Memeriksa lewat nama proses. Skrip AppleScript yang menyebut aplikasi bisa meluncurkannya
/// (atau menampilkan dialog "Where is ...?" jika tidak terpasang), jadi hanya pemutar yang
/// sudah berjalan yang ditanyai.
fn is_running(player: Player) -> bool {
    Command::new("pgrep")
        .args(["-x", player.app()])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn snapshot_script(player: Player) -> String {
    let fields = match player {
        // Spotify: durasi dalam milidetik, ada URL artwork.
        Player::Spotify => {
            r#"(name of current track) & sep & (artist of current track) & sep & (album of current track) & sep & (player state as text) & sep & (player position as text) & sep & (duration of current track as text) & sep & (artwork url of current track) & sep & (id of current track)"#
        }
        // Music: durasi dalam detik, tanpa URL artwork.
        Player::Music => {
            r#"(name of current track) & sep & (artist of current track) & sep & (album of current track) & sep & (player state as text) & sep & (player position as text) & sep & (duration of current track as text) & sep & "" & sep & (database ID of current track as text)"#
        }
    };

    format!(
        "set sep to ASCII character 31\n\
         tell application \"{app}\"\n\
         if player state is stopped then return \"\"\n\
         return \"{app}\" & sep & {fields}\n\
         end tell",
        app = player.app(),
    )
}

/// AppleScript memakai koma sebagai pemisah desimal di sebagian bahasa sistem.
fn parse_seconds(text: &str) -> Option<f64> {
    text.trim().replace(',', ".").parse::<f64>().ok()
}

fn parse_snapshot(line: &str) -> Option<Snapshot> {
    let fields: Vec<&str> = line.split(SEP).collect();
    if fields.len() < 9 {
        return None;
    }

    let player = Player::from_name(fields[0])?;
    let position_ms = (parse_seconds(fields[5])?.max(0.0) * 1000.0) as u64;
    let duration = parse_seconds(fields[6]).unwrap_or(0.0).max(0.0);
    let duration_ms = match player {
        Player::Spotify => duration as u64,
        Player::Music => (duration * 1000.0) as u64,
    };

    Some(Snapshot {
        player,
        title: fields[1].to_string(),
        artist: fields[2].to_string(),
        album: fields[3].to_string(),
        playing: fields[4] == "playing",
        position_ms,
        duration_ms,
        artwork_url: Some(fields[7].to_string()).filter(|url| !url.is_empty()),
        track_id: fields[8].to_string(),
    })
}

/// Pemutar yang sedang memutar lagu diutamakan; kalau tidak ada, pemutar yang terakhir aktif.
fn read_snapshot() -> Option<Snapshot> {
    let mut found: Vec<Snapshot> = Player::ALL
        .into_iter()
        .filter(|player| is_running(*player))
        .filter_map(|player| osascript(&snapshot_script(player)))
        .filter(|output| !output.is_empty())
        .filter_map(|output| parse_snapshot(&output))
        .collect();

    if let Some(index) = found.iter().position(|snapshot| snapshot.playing) {
        return Some(found.swap_remove(index));
    }

    let previous = ACTIVE.lock().ok().and_then(|active| *active);
    let index = previous.and_then(|player| found.iter().position(|snapshot| snapshot.player == player)).unwrap_or(0);
    (index < found.len()).then(|| found.swap_remove(index))
}

// ---------- Artwork ----------

fn load_artwork(snapshot: &Snapshot) -> Option<String> {
    match snapshot.player {
        Player::Spotify => fetch_artwork(snapshot.artwork_url.as_deref()?),
        Player::Music => export_music_artwork(),
    }
}

fn fetch_artwork(url: &str) -> Option<String> {
    tauri::async_runtime::block_on(async {
        let response = reqwest::get(url).await.ok()?;
        if !response.status().is_success() {
            return None;
        }

        let mime = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_string();
        let bytes = response.bytes().await.ok()?;
        if bytes.len() > MAX_ARTWORK_BYTES {
            return None;
        }

        Some(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
    })
}

/// Music tidak memberi URL; gambarnya ditulis ke berkas sementara lalu dibaca.
fn export_music_artwork() -> Option<String> {
    let path = std::env::temp_dir().join("notchboo-artwork");
    let script = format!(
        "tell application \"Music\"\n\
         try\n\
         tell artwork 1 of current track to set artData to raw data\n\
         set fileRef to open for access POSIX file \"{path}\" with write permission\n\
         set eof fileRef to 0\n\
         write artData to fileRef\n\
         close access fileRef\n\
         return \"ok\"\n\
         on error\n\
         try\n\
         close access POSIX file \"{path}\"\n\
         end try\n\
         return \"\"\n\
         end try\n\
         end tell",
        path = path.display(),
    );

    if osascript(&script)? != "ok" {
        return None;
    }

    let bytes = std::fs::read(&path).ok()?;
    let _ = std::fs::remove_file(&path);
    if bytes.is_empty() || bytes.len() > MAX_ARTWORK_BYTES {
        return None;
    }

    let mime = if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg"
    } else {
        "image/tiff"
    };

    Some(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
}

// ---------- Kontrol ----------

/// Pemutar sasaran perintah: yang terakhir aktif jika masih berjalan, kalau tidak yang pertama berjalan.
fn control_target() -> Option<Player> {
    let previous = ACTIVE.lock().ok().and_then(|active| *active);
    previous.filter(|player| is_running(*player)).or_else(|| Player::ALL.into_iter().find(|player| is_running(*player)))
}

fn tell(player: Player, command: &str) -> bool {
    osascript(&format!("tell application \"{}\" to {command}", player.app())).is_some()
}

fn send_action(action: MediaAction) -> bool {
    let Some(player) = control_target() else {
        return false;
    };

    let command = match action {
        MediaAction::Previous => "previous track",
        MediaAction::PlayPause => "playpause",
        MediaAction::Next => "next track",
    };
    tell(player, command)
}

fn seek_to(position_ms: u64) -> bool {
    let Some(player) = control_target() else {
        return false;
    };

    tell(player, &format!("set player position to {:.3}", position_ms as f64 / 1000.0))
}