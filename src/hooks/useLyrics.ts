import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type LyricLine = { timeMs: number; text: string };

type TrackKey = { title: string; artist: string; album: string };
type LyricResult = { key: string; lines: LyricLine[] };

const MAX_CACHE_ENTRIES = 50;
const cache = new Map<string, LyricLine[]>();

/**
 * Mengambil entri cache sekaligus memperbarui posisinya sebagai entri terbaru.
 * Map mempertahankan urutan penyisipan, sehingga entri pertama adalah yang paling lama.
 */
function getCachedLyrics(key: string): LyricLine[] | undefined {
  const cached = cache.get(key);

  if (cached === undefined) return undefined;

  cache.delete(key);
  cache.set(key, cached);

  return cached;
}

/** Menyimpan lirik dan membuang entri terlama jika cache melewati batas. */
function setCachedLyrics(key: string, lines: LyricLine[]) {
  cache.delete(key);
  cache.set(key, lines);

  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;

    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
}

/**
 * Mengambil lirik berbintang waktu.
 * null = belum ada / sedang memuat / hook tidak aktif.
 * [] = lirik tidak ditemukan.
 */
export function useLyrics(media: TrackKey | null, durationMs: number, enabled: boolean): LyricLine[] | null {
  const [result, setResult] = useState<LyricResult | null>(null);

  // JSON.stringify menghindari tabrakan key jika metadata mengandung karakter pemisah.
  const key = media ? JSON.stringify([media.title, media.artist, media.album, Math.round(durationMs / 1000)]) : "";

  useEffect(() => {
    if (!enabled || !media) {
      setResult(null);
      return;
    }

    let cancelled = false;

    const cached = getCachedLyrics(key);

    if (cached !== undefined) {
      setResult({ key, lines: cached });
      return;
    }

    setResult(null);

    invoke<LyricLine[]>("get_lyrics", {
      title: media.title,
      artist: media.artist,
      album: media.album,
      durationMs,
    })
      .then((lines) => {
        // Hasil tetap boleh masuk cache meskipun permintaan sudah tidak aktif.
        setCachedLyrics(key, lines);

        if (!cancelled) {
          setResult({ key, lines });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Gagal mengambil lirik:", error);
          setResult({ key, lines: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  // Jangan tampilkan hasil lagu sebelumnya selama lagu baru sedang dimuat.
  if (!enabled || !media || result?.key !== key) {
    return null;
  }

  return result.lines;
}
