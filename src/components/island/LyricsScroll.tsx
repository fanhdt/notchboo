import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { LyricLine } from "../../hooks/useLyrics";
import type { PlaybackState } from "./ProgressBar";

// Posisi baris aktif dari tepi atas area lirik (px).
const ANCHOR = 20;
// Pengisian warna selesai sedikit sebelum baris berikutnya mulai, dan dibatasi untuk jeda instrumental yang panjang.
const FILL_RATIO = 0.85;
const MAX_FILL_SPAN_MS = 6000;

function currentPosition(playback: PlaybackState | null): number {
  if (!playback) return 0;
  const elapsed = playback.isPlaying ? performance.now() - playback.receivedAt : 0;
  return playback.positionMs + elapsed;
}

type Tick = { index: number; progress: number };

// Menghitung baris aktif dan progres isi warnanya dari posisi playback saat ini.
function computeTick(lines: LyricLine[], playback: PlaybackState | null): Tick {
  if (lines.length === 0) return { index: -1, progress: 0 };

  const position = currentPosition(playback);

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

function useLyricTick(lines: LyricLine[], playback: PlaybackState | null) {
  // State awal langsung dihitung, jadi saat mount ulang (hover lagi) tidak mulai dari -1.
  const [tick, setTick] = useState<Tick>(() => computeTick(lines, playback));

  useEffect(() => {
    const update = () => {
      const next = computeTick(lines, playback);
      setTick((prev) => (prev.index === next.index && Math.abs(prev.progress - next.progress) < 0.01 ? prev : next));
    };

    update();
    if (!playback?.isPlaying) return;

    const id = setInterval(update, 60);
    return () => clearInterval(id);
  }, [lines, playback]);

  return tick;
}

// Pecah teks jadi segmen: per kata, atau per huruf untuk teks tanpa spasi (mis. Jepang).
function toSegments(text: string): string[] {
  if (/\s/.test(text)) return text.match(/\S+\s*/g) ?? [text];
  return Array.from(text);
}

function ActiveText({ text, progress }: { text: string; progress: number }) {
  const segments = toSegments(text);
  const total = segments.reduce((sum, s) => sum + s.length, 0) || 1;
  let start = 0;

  return (
    <>
      {segments.map((segment, i) => {
        const wordProgress = Math.min(1, Math.max(0, (progress * total - start) / segment.length));
        start += segment.length;

        return (
          <span key={i} style={{ color: `rgba(255,255,255,${0.35 + 0.65 * wordProgress})`, transition: "color 120ms linear", whiteSpace: "pre-wrap" }}>
            {segment}
          </span>
        );
      })}
    </>
  );
}

type Props = {
  lines: LyricLine[];
  playback: PlaybackState | null;
};

/** Mode samping: lirik scroll ke atas seperti Spotify. */
export function LyricsScroll({ lines, playback }: Props) {
  const tick = useLyricTick(lines, playback);
  const [offset, setOffset] = useState(0);
  // Penempatan pertama harus instan; spring baru dipakai setelah itu.
  const [settled, setSettled] = useState(false);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const indexRef = useRef(tick.index);
  indexRef.current = tick.index;

  const measure = useCallback(() => {
    const i = indexRef.current;
    const el = i >= 0 ? itemRefs.current[i] : null;
    setOffset(el ? Math.max(0, el.offsetTop - ANCHOR) : 0);
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [tick.index, lines, measure]);

  // Ukur ulang kalau lebar berubah (mis. island masih animasi melebar), supaya wrap teks dan offset tetap benar.
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="h-full overflow-hidden"
      style={{
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 80%, transparent 100%)",
        maskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 80%, transparent 100%)",
      }}
    >
      <motion.div ref={listRef} className="relative" initial={false} animate={{ y: -offset }} transition={settled ? { type: "spring", stiffness: 140, damping: 22 } : { duration: 0 }}>
        {lines.map((line, i) => {
          const text = line.text || "♪";
          const active = i === tick.index;

          return (
            <div
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className="py-0.5 text-left text-[13px] font-bold leading-snug"
              style={{ color: active ? undefined : "rgba(255,255,255,0.35)", transition: "color 200ms" }}
            >
              {active ? <ActiveText text={text} progress={tick.progress} /> : text}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

/** Mode atas: hanya baris yang sedang dinyanyikan, satu baris. */
export function LyricsInline({ lines, playback }: Props) {
  const tick = useLyricTick(lines, playback);
  const text = tick.index >= 0 ? lines[tick.index].text || "♪" : "♪";

  return (
    <div className="relative h-4 overflow-hidden text-center">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={tick.index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="truncate text-[12px] font-semibold leading-4">
          <ActiveText text={text} progress={tick.progress} />
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
