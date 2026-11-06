import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type LyricLine = { timeMs: number; text: string };

type TrackKey = { title: string; artist: string; album: string };

const cache = new Map<string, LyricLine[]>();

/**
 * Mengambil lirik berbintang waktu.
 * null = belum ada / sedang memuat, [] = tidak ditemukan.
 */
export function useLyrics(media: TrackKey | null, durationMs: number, enabled: boolean): LyricLine[] | null {
  const [lines, setLines] = useState<LyricLine[] | null>(null);

  const key = media ? `${media.title}|${media.artist}|${media.album}|${Math.round(durationMs / 1000)}` : "";

  useEffect(() => {
    if (!enabled || !media) return;

    const cached = cache.get(key);
    if (cached) {
      setLines(cached);
      return;
    }

    let cancelled = false;
    setLines(null);

    invoke<LyricLine[]>("get_lyrics", { title: media.title, artist: media.artist, album: media.album, durationMs })
      .then((result) => {
        cache.set(key, result);
        if (!cancelled) setLines(result);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLines([]);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  return lines;
}
