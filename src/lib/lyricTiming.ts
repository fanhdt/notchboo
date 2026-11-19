import type { LyricLine } from "../hooks/useLyrics";
import type { PlaybackState } from "../components/island/ProgressBar";

// Pengisian warna selesai sedikit sebelum baris berikutnya mulai, dan dibatasi untuk jeda instrumental yang panjang.
const FILL_RATIO = 0.85;
const MAX_FILL_SPAN_MS = 6000;

/** Jarak antar pembaruan saat warna sebuah baris sedang terisi (transisi warna CSS 120 ms menghaluskannya). */
export const FILL_TICK_MS = 100;
/** Batas bawah jeda timeout, supaya tidak ada putaran rapat saat batas baris sangat dekat. */
const MIN_DELAY_MS = 4;

export type Tick = { index: number; progress: number };

/** Posisi lagu sekarang (ms), diekstrapolasi dari kiriman terakhir saat sedang diputar. */
export function lyricPosition(playback: PlaybackState | null): number {
  if (!playback) return 0;
  const elapsed = playback.isPlaying ? performance.now() - playback.receivedAt : 0;
  return playback.positionMs + elapsed;
}

/** Menghitung baris aktif dan progres isi warnanya dari posisi playback saat ini. */
export function computeTick(lines: LyricLine[], playback: PlaybackState | null): Tick {
  if (lines.length === 0) return { index: -1, progress: 0 };

  const position = lyricPosition(playback);

  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= position) found = i;
    else break;
  }

  let progress = 0;
  if (found >= 0) {
    const start = lines[found].timeMs;
    const next = lines[found + 1]?.timeMs ?? start + 4000;
    const span = Math.min(next - start, MAX_FILL_SPAN_MS) * FILL_RATIO;
    progress = Math.min(1, Math.max(0, (position - start) / Math.max(span, 1)));
  }

  return { index: found, progress };
}

/**
 * Berapa ms lagi pembaruan berikutnya diperlukan, atau null jika tidak perlu lagi.
 *
 * Saat warna baris sedang terisi: tiap `FILL_TICK_MS`, tetapi tidak melewati awal baris berikutnya.
 * Setelah terisi penuh (atau sebelum baris pertama): langsung ke awal baris berikutnya, tanpa tick di antaranya.
 * Setelah baris terakhir terisi penuh: null (tidak ada yang berubah sampai playback berubah).
 */
export function nextTickDelay(lines: LyricLine[], tick: Tick, position: number): number | null {
  const nextLine = lines[tick.index + 1];
  const untilNextLine = nextLine ? nextLine.timeMs - position : Infinity;
  const filling = tick.index >= 0 && tick.progress < 1;

  const delay = filling ? Math.min(FILL_TICK_MS, untilNextLine) : untilNextLine;
  if (!Number.isFinite(delay)) return null;

  return Math.max(MIN_DELAY_MS, Math.ceil(delay) + 1);
}
