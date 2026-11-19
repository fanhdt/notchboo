import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

import { ISLAND_PAGES, type IslandView } from "../components/island/IslandNav";
import { PHASE_MS, type PomodoroPhase } from "../components/island/PomodoroView";
import type { PlaybackState } from "../components/island/ProgressBar";
import { useCountdown } from "./useCountdown";
import { FLOW_RATIOS, TIMER_MODES, useFlowmodoro, usePersistedChoice, type FlowRatio, type TimerMode } from "./useFlowmodoro";
import { useForegroundBusy } from "./useForegroundBusy";
import { useIslandAlarms } from "./useIslandAlarms";
import { useLyrics } from "./useLyrics";
import { useMessageNotice } from "./useMessageNotice";
import { usePeekMode } from "./usePeekMode";
import { useFileDrop, useShelfImport } from "./useShelf";

export type IslandState = "compact" | "expanded";
export type LyricMode = "side" | "inline";
export type Layout = "plain" | "side" | "inline";
type Presence = "over" | "away";

export type MediaInfo = {
  title: string;
  artist: string;
  album: string;
  artwork: string | null;
};

type PlaybackInfo = { isPlaying: boolean; positionMs: number; durationMs: number };
type MediaAction = "previous" | "playPause" | "next";

const HOVER_EXPAND_DELAY_MS = 100;
const AUTO_COLLAPSE_DELAY_MS = 100;

function stamp(info: PlaybackInfo | null): PlaybackState | null {
  return info ? { ...info, receivedAt: performance.now() } : null;
}

/**
 * "Otak" island: semua status dan perilakunya (buka/tutup, halaman, alarm, pesan masuk, peek, standby,
 * media, timer, Shelf). Tidak tahu apa pun soal bentuk atau ukuran, jadi tampilan mana pun
 * (notch, pill, ...) bisa memakainya. Bentuk dan ukuran diurus `useIslandGeometry`.
 */
export function useIslandController() {
  const [state, setState] = useState<IslandState>("compact");
  const [pageIndex, setPageIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [lyricMode, setLyricMode] = useState<LyricMode>("side");
  const [presence, setPresence] = useState<Presence>("away");
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [phase, setPhase] = useState<PomodoroPhase>("focus");
  const [alerting, setAlerting] = useState(false);

  // Mode timer (Pomodoro / Flowmodoro) dan rasio istirahat Flow, diingat antar sesi.
  const [mode, setModeState] = usePersistedChoice<TimerMode>(".timerMode", TIMER_MODES, "pomodoro");
  const [flowRatio, setFlowRatio] = usePersistedChoice<FlowRatio>("mochi.flowRatio", FLOW_RATIOS, 5);

  // Pesan masuk (WhatsApp, Instagram): island membesar sebentar dan menampilkannya.
  const { notice, dismiss: dismissNotice } = useMessageNotice();
  const noticeOn = notice !== null;

  const view: IslandView = ISLAND_PAGES[pageIndex];

  const alarms = useIslandAlarms((page) => {
    setState("expanded");
    setDirection(1);
    setPageIndex(ISLAND_PAGES.indexOf(page));
  }, alerting);

  // Pesan masuk: bunyikan suara pesan sekali.
  const noticeKey = notice?.key ?? null;
  const playSound = alarms.sound.play;
  useEffect(() => {
    if (noticeKey !== null) playSound("message");
  }, [noticeKey, playSound]);

  // Quick Shelf: file yang diseret ke island dibuka otomatis ke halaman Shelf lalu disimpan.
  const [shelfVersion, setShelfVersion] = useState(0);
  const importer = useShelfImport(() => setShelfVersion((version) => version + 1));
  const { importPaths } = importer;
  const draggingFile = useFileDrop((paths) => void importPaths(paths));

  // Mode peek: saat aplikasi lain aktif, island yang sedang compact bersembunyi ke atas.
  // Mendekatkan kursor memunculkannya lagi, lalu alur hover-expand berjalan seperti biasa.
  const foregroundBusy = useForegroundBusy();
  const peekMode = usePeekMode();
  const peeking = peekMode !== "standby" && (peekMode === "always" || foregroundBusy) && state === "compact" && presence === "away" && !alerting && !draggingFile && !noticeOn;

  const hoverExpandArmed = useRef(true);

  const lyrics = useLyrics(media, playback?.durationMs ?? 0, state === "expanded" && view === "media" && playback !== null);
  const hasLyrics = lyrics !== null && lyrics.length > 0;
  const layout: Layout = view === "media" && hasLyrics ? lyricMode : "plain";

  // Pomodoro: hitung mundur, alarm saat habis.
  const pomodoro = useCountdown(PHASE_MS[phase], () => {
    setAlerting(true);
    setPhase((current) => (current === "focus" ? "break" : "focus"));
  });

  // Flowmodoro: fokus hitung naik tanpa alarm; alarm hanya saat istirahat habis.
  const flow = useFlowmodoro(() => setAlerting(true));

  // Timer yang sedang aktif, dengan bentuk yang sama untuk kedua mode
  // (compact mode dan halaman Pomodoro cukup membaca `timer`).
  const timer = mode === "flow" ? { running: flow.running, remainingMs: flow.displayMs, start: flow.start, pause: flow.pause, reset: flow.reset } : pomodoro;
  const timerPhase: PomodoroPhase = mode === "flow" ? flow.phase : phase;

  // 1. Posisi kursor dari Rust.
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    const initialize = async () => {
      try {
        const stopListening = await listen<Presence>("cursor-presence", (event) => {
          if (active) {
            setPresence(event.payload);
          }
        });

        if (!active) {
          stopListening();
          return;
        }

        unlisten = stopListening;
      } catch (error) {
        if (active) {
          console.error("Gagal memasang listener posisi kursor:", error);
        }
      }
    };

    void initialize();

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  // 2. Hover-expand dan auto-collapse.
  useEffect(() => {
    // Standby: island dipaksa terbuka oleh efek standby, jadi tidak ada hover-expand atau auto-collapse.
    if (peekMode === "standby") return;

    if (presence === "away") hoverExpandArmed.current = true;

    let next: IslandState | null = null;
    let delay = 0;

    if (presence === "over" && state === "compact" && hoverExpandArmed.current) {
      next = "expanded";
      delay = HOVER_EXPAND_DELAY_MS;
    } else if (presence === "away" && state === "expanded" && !alerting && !alarms.anyDue && !draggingFile && !importer.importing) {
      next = "compact";
      delay = AUTO_COLLAPSE_DELAY_MS;
    }

    if (next === null) return;

    const nextState = next;
    const timeout = setTimeout(() => setState(nextState), delay);
    return () => clearTimeout(timeout);
  }, [presence, state, alerting, alarms.anyDue, draggingFile, importer.importing, peekMode]);

  // 3. Info lagu dan status putar.
  useEffect(() => {
    let active = true;
    let mediaEventReceived = false;
    let playbackEventReceived = false;

    let unlistenMedia: (() => void) | undefined;
    let unlistenPlayback: (() => void) | undefined;

    const initialize = async () => {
      // Registrasi listener media dilakukan secara independen.
      try {
        const stopListeningMedia = await listen<MediaInfo | null>("media-changed", (event) => {
          mediaEventReceived = true;

          if (active) {
            setMedia(event.payload);
          }
        });

        if (!active) {
          stopListeningMedia();
          return;
        }

        unlistenMedia = stopListeningMedia;
      } catch (error) {
        if (active) {
          console.error("Gagal memasang listener media:", error);
        }
      }

      if (!active) return;

      // Kegagalan listener media tidak menghalangi registrasi playback.
      try {
        const stopListeningPlayback = await listen<PlaybackInfo | null>("playback-changed", (event) => {
          playbackEventReceived = true;

          if (active) {
            setPlayback(stamp(event.payload));
          }
        });

        if (!active) {
          stopListeningPlayback();
          return;
        }

        unlistenPlayback = stopListeningPlayback;
      } catch (error) {
        if (active) {
          console.error("Gagal memasang listener playback:", error);
        }
      }

      if (!active) return;

      // Ambil kedua snapshot secara independen agar kegagalan salah satunya
      // tidak menghalangi data awal yang lain.
      const [mediaResult, playbackResult] = await Promise.allSettled([invoke<MediaInfo | null>("get_media_info"), invoke<PlaybackInfo | null>("get_playback_info")]);

      if (!active) return;

      if (!mediaEventReceived) {
        if (mediaResult.status === "fulfilled") {
          setMedia(mediaResult.value);
        } else {
          console.error("Gagal mengambil informasi media awal:", mediaResult.reason);
        }
      }

      if (!playbackEventReceived) {
        if (playbackResult.status === "fulfilled") {
          setPlayback(stamp(playbackResult.value));
        } else {
          console.error("Gagal mengambil informasi playback awal:", playbackResult.reason);
        }
      }
    };

    void initialize();

    return () => {
      active = false;
      unlistenMedia?.();
      unlistenPlayback?.();
    };
  }, []);

  // Sampel sistem dan saklar monitoring diurus `useSystemStats`, di dalam halaman Sistem sendiri,
  // supaya sampel tiap detik tidak me-render ulang seluruh island.

  // 4. Island yang menutup selalu kembali ke halaman pertama.
  useEffect(() => {
    if (state === "compact") {
      setPageIndex(0);
      setDirection(1);
    }
  }, [state]);

  // 5. Timer selesai: expand dan tampilkan halaman Pomodoro (suaranya diurus useIslandAlarms).
  useEffect(() => {
    if (!alerting) return;
    setState("expanded");
    setDirection(1);
    setPageIndex(ISLAND_PAGES.indexOf("pomodoro"));
  }, [alerting]);

  // 6. Mode standby: island selalu terbuka.
  useEffect(() => {
    if (peekMode === "standby" && state !== "expanded") setState("expanded");
  }, [peekMode, state]);

  // 7. File diseret ke island: buka, tampilkan halaman Shelf.
  useEffect(() => {
    if (!draggingFile) return;
    setState("expanded");
    setDirection(1);
    setPageIndex(ISLAND_PAGES.indexOf("shelf"));
  }, [draggingFile]);

  function handleClick() {
    if (alarms.anyDue) return; // alarm harus dijawab lewat tombolnya
    if (noticeOn) {
      dismissNotice(); // klik menutup pesan lebih cepat
      return;
    }
    if (alerting) {
      setAlerting(false); // setelah ini, island collapse sendiri kalau kursor sudah jauh
      return;
    }
    if (peekMode === "standby") return; // standby: island tidak menutup karena klik
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

  /** Pomodoro: lewati fase. Flow: selesai fokus (mulai istirahat) atau lewati istirahat. */
  function skipPhase() {
    setAlerting(false);

    if (mode === "flow") {
      if (flow.phase === "focus") flow.finishFocus(flowRatio);
      else flow.skipBreak();
      return;
    }

    setPhase((current) => (current === "focus" ? "break" : "focus"));
  }

  /** Mode hanya bisa diganti saat timer berhenti, supaya sesi yang sedang berjalan tidak hilang. */
  function setMode(next: TimerMode) {
    if (next === mode || timer.running) return;
    setAlerting(false);
    setModeState(next);
  }

  function selectPage(target: IslandView) {
    const next = ISLAND_PAGES.indexOf(target);
    if (next === pageIndex) return;
    setDirection(next > pageIndex ? 1 : -1);
    setPageIndex(next);
  }

  function sendMediaAction(action: MediaAction) {
    invoke("media_control", { action }).catch(console.error);
  }

  function seekTo(positionMs: number) {
    setPlayback((previous) => (previous ? { ...previous, positionMs, receivedAt: performance.now() } : previous));
    invoke("media_seek", { positionMs: Math.round(positionMs) }).catch(console.error);
  }

  return {
    // status tampilan
    state,
    view,
    direction,
    layout,
    notice,
    noticeOn,
    peeking,
    // media
    media,
    playback,
    lyrics,
    hasLyrics,
    lyricMode,
    setLyricMode,
    sendMediaAction,
    seekTo,
    // halaman lain
    phase,
    timer,
    timerPhase,
    mode,
    setMode,
    flowRatio,
    setFlowRatio,
    flow,
    alerting,
    alarms,
    shelf: { version: shelfVersion, importer, draggingFile },
    // aksi
    handleClick,
    togglePomodoro,
    skipPhase,
    selectPage,
  };
}

export type IslandController = ReturnType<typeof useIslandController>;
