use std::{sync::OnceLock, time::Duration};

use reqwest::Client;
use serde::{Deserialize, Serialize};

const LRCLIB: &str = "https://lrclib.net/api";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricLine {
    time_ms: u64,
    text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibTrack {
    synced_lyrics: Option<String>,
}

fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(Duration::from_secs(8))
            .user_agent("dynamic-island-tauri/0.1")
            .build()
            .expect("gagal membuat HTTP client")
    })
}

/// Mengambil lirik berbintang waktu. Mengembalikan daftar kosong jika tidak ditemukan.
#[tauri::command]
pub async fn get_lyrics(
    title: String,
    artist: String,
    album: String,
    duration_ms: u64,
) -> Result<Vec<LyricLine>, String> {
    if title.trim().is_empty() {
        return Ok(Vec::new());
    }

    let synced = fetch_synced(&title, &artist, &album, duration_ms / 1000).await;
    Ok(synced.map(|s| parse_lrc(&s)).unwrap_or_default())
}

async fn fetch_synced(title: &str, artist: &str, album: &str, duration_s: u64) -> Option<String> {
    // 1. Pencarian tepat (butuh judul, artis, album, dan durasi).
    if duration_s > 0 && !album.is_empty() {
        let response = client()
            .get(format!("{LRCLIB}/get"))
            .query(&[
                ("track_name", title),
                ("artist_name", artist),
                ("album_name", album),
                ("duration", &duration_s.to_string()),
            ])
            .send()
            .await
            .ok()?;

        if response.status().is_success() {
            if let Ok(track) = response.json::<LrclibTrack>().await {
                if track.synced_lyrics.is_some() {
                    return track.synced_lyrics;
                }
            }
        }
    }

    // 2. Cadangan: pencarian longgar, ambil hasil pertama yang punya lirik berbintang waktu.
    let tracks: Vec<LrclibTrack> = client()
        .get(format!("{LRCLIB}/search"))
        .query(&[("track_name", title), ("artist_name", artist)])
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;

    tracks.into_iter().find_map(|t| t.synced_lyrics)
}

/// Mengurai format LRC: `[mm:ss.xx] teks`. Baris metadata seperti `[ar:...]` dilewati.
fn parse_lrc(source: &str) -> Vec<LyricLine> {
    let mut lines: Vec<LyricLine> = source
        .lines()
        .filter_map(|line| {
            let rest = line.trim().strip_prefix('[')?;
            let (stamp, text) = rest.split_once(']')?;
            let (minutes, seconds) = stamp.split_once(':')?;
            let minutes: u64 = minutes.parse().ok()?;
            let seconds: f64 = seconds.parse().ok()?;

            Some(LyricLine {
                time_ms: minutes * 60_000 + (seconds * 1000.0) as u64,
                text: text.trim().to_string(),
            })
        })
        .collect();

    lines.sort_by_key(|l| l.time_ms);
    lines
}