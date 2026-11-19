import { useEffect, useRef, useState } from "react";

import { msUntilCountUpChange, msUntilCountdownChange } from "../lib/clock";

export type TimerMode = "pomodoro" | "flow";
export type FlowPhase = "focus" | "break";
export type FlowRatio = 3 | 4 | 5;

export const TIMER_MODES: readonly TimerMode[] = ["pomodoro", "flow"];
/** Istirahat = waktu fokus ÷ rasio. 5 = 1/5 (default riset), 3 = 1/3 (lebih longgar). */
export const FLOW_RATIOS: readonly FlowRatio[] = [5, 4, 3];

const MIN_BREAK_MS = 60_000;
/** Setelah ini, island mengingatkan (tanpa suara) bahwa sesi sudah panjang. */
export const LONG_SESSION_MS = 90 * 60_000;

export function breakMsFor(focusMs: number, ratio: FlowRatio) {
  return Math.max(MIN_BREAK_MS, Math.round(focusMs / ratio / 1000) * 1000);
}

/** State kecil yang diingat di localStorage. Nilai tak valid kembali ke `fallback`. */
export function usePersistedChoice<T extends string | number>(key: string, allowed: readonly T[], fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return allowed.find((item) => String(item) === stored) ?? fallback;
    } catch {
      return fallback;
    }
  });

  function update(next: T) {
    setValue(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // abaikan: pilihan tetap berlaku selama aplikasi terbuka
    }
  }

  return [value, update] as const;
}

/**
 * Flowmodoro: fokus = stopwatch hitung naik tanpa batas, tanpa alarm.
 * Saat pengguna menekan "Selesai", istirahat mulai otomatis dengan durasi = waktu fokus ÷ rasio.
 * Habisnya istirahat memanggil `onBreakEnd`; fokus berikutnya dimulai manual.
 */
export function useFlowmodoro(onBreakEnd: () => void) {
  const [phase, setPhase] = useState<FlowPhase>("focus");
  const [running, setRunning] = useState(false);
  const [baseMs, setBaseMs] = useState(0); // waktu terkumpul sebelum jalan sekarang
  const [startedAt, setStartedAt] = useState(0);
  const [breakTotalMs, setBreakTotalMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const onBreakEndRef = useRef(onBreakEnd);
  useEffect(() => {
    onBreakEndRef.current = onBreakEnd;
  });

  // Tampilan berresolusi detik, jadi `now` hanya diperbarui saat detik yang ditampilkan berganti.
  // Waktu yang berlalu selalu dihitung dari `startedAt` (waktu absolut), sehingga tidak ada drift.
  useEffect(() => {
    if (!running) return;

    let id = 0;

    const delayFor = (t: number) => {
      const spent = baseMs + Math.max(0, t - startedAt);
      return phase === "focus" ? msUntilCountUpChange(spent) : msUntilCountdownChange(breakTotalMs - spent);
    };

    const tick = () => {
      const t = Date.now();
      setNow(t);
      id = window.setTimeout(tick, delayFor(t));
    };

    id = window.setTimeout(tick, delayFor(Date.now()));

    return () => window.clearTimeout(id);
  }, [running, phase, baseMs, startedAt, breakTotalMs]);

  const spentMs = baseMs + (running ? Math.max(0, now - startedAt) : 0);

  // Istirahat habis: kembali ke fokus (belum jalan) dan beri tahu controller.
  const breakDone = phase === "break" && running && spentMs >= breakTotalMs;
  useEffect(() => {
    if (!breakDone) return;
    setRunning(false);
    setPhase("focus");
    setBaseMs(0);
    setBreakTotalMs(0);
    onBreakEndRef.current();
  }, [breakDone]);

  function start() {
    if (running) return;
    const t = Date.now();
    setNow(t);
    setStartedAt(t);
    setRunning(true);
  }

  function pause() {
    if (!running) return;
    setBaseMs(baseMs + Math.max(0, Date.now() - startedAt));
    setRunning(false);
  }

  function reset() {
    setRunning(false);
    setPhase("focus");
    setBaseMs(0);
    setBreakTotalMs(0);
  }

  function finishFocus(ratio: FlowRatio) {
    if (phase !== "focus") return;
    const t = Date.now();
    const focusMs = baseMs + (running ? Math.max(0, t - startedAt) : 0);
    if (focusMs < 1000) return; // belum ada yang perlu diistirahatkan

    setNow(t);
    setStartedAt(t);
    setBaseMs(0);
    setBreakTotalMs(breakMsFor(focusMs, ratio));
    setPhase("break");
    setRunning(true);
  }

  function skipBreak() {
    if (phase === "break") reset();
  }

  return {
    phase,
    running,
    /** Fokus: waktu berjalan (hitung naik). Istirahat: sisa waktu. */
    displayMs: phase === "focus" ? Math.floor(spentMs / 1000) * 1000 : Math.max(0, breakTotalMs - spentMs),
    breakTotalMs,
    start,
    pause,
    reset,
    finishFocus,
    skipBreak,
  };
}
