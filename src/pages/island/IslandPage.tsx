import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import BangbooEyes from "../../components/island/BangbooEyes";
import ControlButton from "../../components/island/ControlButton";
import IslandShape from "../../components/island/IslandShape";
import { LyricsInline, LyricsScroll } from "../../components/island/LyricsScroll";
import ProgressBar, { type PlaybackState } from "../../components/island/ProgressBar";
import ShelfLauncher from "../../components/island/ShelfLauncher";
import SystemView, { type SystemStats } from "../../components/island/SystemView";
import { useLyrics } from "../../hooks/useLyrics";
import PomodoroView, { PHASE_MS, formatClock, type PomodoroPhase } from "../../components/island/PomodoroView";
import { useCountdown } from "../../hooks/useCountdown";

type IslandState = "compact" | "expanded";

const PAGES = ["media", "system", "pomodoro", "shelf"] as const;
type IslandView = (typeof PAGES)[number];

type LyricMode = "side" | "inline";
type Layout = "plain" | "side" | "inline";
type Presence = "over" | "away";

type MediaInfo = {
  title: string;
  artist: string;
  album: string;
  artwork: string | null;
};

type PlaybackInfo = { isPlaying: boolean; positionMs: number; durationMs: number };
type MediaAction = "previous" | "playPause" | "next";

const COMPACT_SIZE = { width: 150, height: 30 } as const;

const EXPANDED_SIZE = {
  plain: { width: 290, height: 106 },
  inline: { width: 290, height: 128 },
  side: { width: 380, height: 120 },
} as const;

const SHAPE = {
  compact: { radius: 11, ear: 8 },
  expanded: { radius: 22, ear: 12 },
} as const;

const SPRING = { type: "spring", stiffness: 400, damping: 32 } as const;

const HOVER_EXPAND_DELAY_MS = 100;
const AUTO_COLLAPSE_DELAY_MS = 100;

// Animasi geser antar halaman. direction: 1 = ke kanan, -1 = ke kiri.
const PAGE_VARIANTS = {
  enter: (direction: number) => ({ x: direction * 36, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -36, opacity: 0 }),
};

function stamp(info: PlaybackInfo | null): PlaybackState | null {
  return info ? { ...info, receivedAt: performance.now() } : null;
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => ctx.close();
  } catch {
    // Audio tidak tersedia: abaikan.
  }
}

function IslandPage() {
  const [state, setState] = useState<IslandState>("compact");
  const [pageIndex, setPageIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [lyricMode, setLyricMode] = useState<LyricMode>("side");
  const [presence, setPresence] = useState<Presence>("away");
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [phase, setPhase] = useState<PomodoroPhase>("focus");
  const [alerting, setAlerting] = useState(false);

  const view: IslandView = PAGES[pageIndex];
  const hasPrev = pageIndex > 0;
  const hasNext = pageIndex < PAGES.length - 1;

  const hoverExpandArmed = useRef(true);

  const lyrics = useLyrics(media, playback?.durationMs ?? 0, state === "expanded" && view === "media" && playback !== null);
  const hasLyrics = lyrics !== null && lyrics.length > 0;

  const layout: Layout = view === "media" && hasLyrics ? lyricMode : "plain";

  // Ukuran hanya diperbarui saat di halaman media, halaman lain memakai ukuran terakhir.
  // Kalau tidak, island menyusut saat pindah halaman dan kursor keluar dari hitbox.
  const sizeLayoutRef = useRef<Layout>("plain");
  if (view === "media") sizeLayoutRef.current = layout;

  const target = state === "compact" ? COMPACT_SIZE : EXPANDED_SIZE[sizeLayoutRef.current];

  const timer = useCountdown(PHASE_MS[phase], () => {
    setAlerting(true);
    setPhase((p) => (p === "focus" ? "break" : "focus"));
  });

  const targetW = target.width;
  const targetH = target.height;

  const w = useMotionValue<number>(COMPACT_SIZE.width);
  const h = useMotionValue<number>(COMPACT_SIZE.height);
  const radius = useMotionValue<number>(SHAPE.compact.radius);
  const ear = useMotionValue<number>(SHAPE.compact.ear);

  // 1. Sinkronisasi ukuran hitbox dengan Rust.
  useEffect(() => {
    invoke("set_island_hitbox", { width: targetW, height: targetH }).catch(console.error);
  }, [targetW, targetH]);

  // 2. Animasi ukuran dan bentuk.
  useEffect(() => {
    const shape = SHAPE[state];
    const controls = [animate(w, targetW, SPRING), animate(h, targetH, SPRING), animate(radius, shape.radius, SPRING), animate(ear, shape.ear, SPRING)];
    return () => controls.forEach((c) => c.stop());
  }, [state, targetW, targetH, w, h, radius, ear]);

  // 3. Posisi kursor dari Rust.
  useEffect(() => {
    const unlisten = listen<Presence>("cursor-presence", (event) => setPresence(event.payload));
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  // 4. Hover-expand dan auto-collapse.
  useEffect(() => {
    if (presence === "away") hoverExpandArmed.current = true;

    let next: IslandState | null = null;
    let delay = 0;

    if (presence === "over" && state === "compact" && hoverExpandArmed.current) {
      next = "expanded";
      delay = HOVER_EXPAND_DELAY_MS;
    } else if (presence === "away" && state === "expanded" && !alerting) {
      next = "compact";
      delay = AUTO_COLLAPSE_DELAY_MS;
    }

    if (next === null) return;

    const nextState = next;
    const timer = setTimeout(() => setState(nextState), delay);
    return () => clearTimeout(timer);
  }, [presence, state, alerting]);

  // 5. Info lagu dan status putar.
  useEffect(() => {
    invoke<MediaInfo | null>("get_media_info").then(setMedia).catch(console.error);
    invoke<PlaybackInfo | null>("get_playback_info")
      .then((info) => setPlayback(stamp(info)))
      .catch(console.error);

    const unlistenMedia = listen<MediaInfo | null>("media-changed", (event) => setMedia(event.payload));
    const unlistenPlayback = listen<PlaybackInfo | null>("playback-changed", (event) => setPlayback(stamp(event.payload)));

    return () => {
      unlistenMedia.then((stop) => stop());
      unlistenPlayback.then((stop) => stop());
    };
  }, []);

  // 6. Sampel sistem dari Rust.
  useEffect(() => {
    const unlisten = listen<SystemStats>("system-stats", (event) => setStats(event.payload));
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  // 7. Monitoring hanya menyala saat halaman Sistem terlihat.
  useEffect(() => {
    const enabled = state === "expanded" && view === "system";
    invoke("set_monitoring", { enabled }).catch(console.error);
    if (!enabled) setStats(null);
  }, [state, view]);

  // 8. Island yang menutup selalu kembali ke halaman pertama.
  useEffect(() => {
    if (state === "compact") {
      setPageIndex(0);
      setDirection(1);
    }
  }, [state]);

  // 9. Timer selesai: expand, tampilkan halaman Pomodoro, bunyi.
  useEffect(() => {
    if (!alerting) return;
    setState("expanded");
    setDirection(1);
    setPageIndex(PAGES.indexOf("pomodoro"));
    beep();
  }, [alerting]);

  function handleClick() {
    if (alerting) {
      setAlerting(false); // setelah ini, island collapse sendiri kalau kursor sudah jauh
      return;
    }
    if (state === "compact") {
      setState("expanded");
    } else {
      hoverExpandArmed.current = false;
      setState("compact");
    }
  }

  function togglePomodoro() {
    setAlerting(false);
    if (timer.running) timer.pause();
    else timer.start();
  }

  function skipPhase() {
    setAlerting(false);
    setPhase((p) => (p === "focus" ? "break" : "focus"));
  }

  function goPage(step: -1 | 1) {
    const next = pageIndex + step;
    if (next < 0 || next >= PAGES.length) return;
    setDirection(step);
    setPageIndex(next);
  }

  function sendMediaAction(action: MediaAction) {
    invoke("media_control", { action }).catch(console.error);
  }

  function seekTo(positionMs: number) {
    setPlayback((prev) => (prev ? { ...prev, positionMs, receivedAt: performance.now() } : prev));
    invoke("media_seek", { positionMs: Math.round(positionMs) }).catch(console.error);
  }

  const artwork = media?.artwork ? <img src={media.artwork} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : <div className="h-9 w-9 shrink-0 rounded-lg bg-white/10" />;

  const progress = playback && playback.durationMs > 0 ? <ProgressBar playback={playback} onSeek={seekTo} compact={layout === "side"} /> : <div className="h-1" />;

  const controls = (
    <div className="flex items-center justify-center gap-4">
      <ControlButton label="Sebelumnya" onPress={() => sendMediaAction("previous")}>
        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
      </ControlButton>

      <ControlButton label={playback?.isPlaying ? "Jeda" : "Putar"} onPress={() => sendMediaAction("playPause")}>
        {playback?.isPlaying ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <path d="M8 5v14l11-7z" />}
      </ControlButton>

      <ControlButton label="Berikutnya" onPress={() => sendMediaAction("next")}>
        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
      </ControlButton>
    </div>
  );

  // ---------- Halaman ----------

  const mediaPage = media ? (
    layout === "side" ? (
      <div className="flex h-full w-full gap-3">
        <div className="flex w-37.5 shrink-0 flex-col justify-center gap-1 py-1.5">
          <div className="flex items-center gap-2.5">
            {artwork}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{media.title}</span>
              <span className="truncate text-xs text-white/60">{media.artist}</span>
            </div>
          </div>
          {progress}
          {controls}
        </div>

        <div className="min-w-0 flex-1 py-2">
          <LyricsScroll lines={lyrics ?? []} playback={playback} />
        </div>
      </div>
    ) : (
      <div className="flex w-full flex-col gap-1 py-1">
        <div className="flex items-center gap-3">
          {artwork}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold">{media.title}</span>
            <span className="truncate text-[11px] text-white/60">{media.artist}</span>
          </div>
        </div>

        {/* Lirik di atas progress bar */}
        {layout === "inline" && <LyricsInline lines={lyrics ?? []} playback={playback} />}

        {progress}

        {controls}
      </div>
    )
  ) : (
    <span className="text-sm text-white/60">Tidak ada media</span>
  );

  const pages: Record<IslandView, React.ReactNode> = {
    media: mediaPage,
    system: <SystemView stats={stats} />,
    pomodoro: <PomodoroView phase={phase} remainingMs={timer.remainingMs} running={timer.running} alerting={alerting} onToggle={togglePomodoro} onReset={timer.reset} onSkip={skipPhase} />,
    shelf: <ShelfLauncher />,
  };

  return (
    <main className="flex h-full w-full items-start justify-center">
      <motion.div onClick={handleClick} style={{ width: w, height: h }} className="relative flex cursor-pointer select-none items-center justify-center text-white">
        <IslandShape width={w} height={h} radius={radius} ear={ear} />

        <div className="relative z-10 h-full w-full overflow-hidden" style={{ clipPath: "inset(0 12px 0 12px)" }}>
          {state === "compact" ? (
            <div className="flex h-full w-full items-center justify-center gap-2">
              <BangbooEyes />
              {timer.running && <span className="text-[11px] font-medium tabular-nums text-[#c8e63c]">{formatClock(timer.remainingMs)}</span>}
            </div>
          ) : (
            <>
              {/* Tombol geser kiri/kanan di tepi island */}
              <div className="absolute left-4 top-1/2 z-20 -translate-y-1/2">
                <ControlButton label="Halaman sebelumnya" disabled={!hasPrev} onPress={() => goPage(-1)}>
                  <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </ControlButton>
              </div>
              <div className="absolute right-4 top-1/2 z-20 -translate-y-1/2">
                <ControlButton label="Halaman berikutnya" disabled={!hasNext} onPress={() => goPage(1)}>
                  <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </ControlButton>
              </div>

              {/* Tombol mode lirik: pojok kanan bawah */}
              {view === "media" && hasLyrics && (
                <div className="absolute bottom-2 right-8 z-20">
                  {lyricMode === "side" ? (
                    <ControlButton label="Lirik di atas kontrol" onPress={() => setLyricMode("inline")}>
                      <path d="M4 4h16v2H4zm3 4h10v2H7zm-3 6h16v6H4z" />
                    </ControlButton>
                  ) : (
                    <ControlButton label="Lirik di samping" onPress={() => setLyricMode("side")}>
                      <path d="M3 4h8v16H3zm10 2h8v2h-8zm0 4h8v2h-8zm0 4h8v2h-8z" />
                    </ControlButton>
                  )}
                </div>
              )}

              {/* Area halaman dengan animasi geser */}
              <div className="relative h-full w-full px-11">
                <AnimatePresence initial={false} custom={direction}>
                  <motion.div
                    key={view}
                    custom={direction}
                    variants={PAGE_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute inset-y-0 left-11 right-11 flex items-center justify-center"
                  >
                    {pages[view]}
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </main>
  );
}

export default IslandPage;
