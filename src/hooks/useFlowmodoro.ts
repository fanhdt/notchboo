import { useEffect, useRef, useState } from "react";

import { msUntilCountUpChange, msUntilCountdownChange } from "../lib/clock";

export type TimerMode = "pomodoro" | "flow";
export type FlowPhase = "focus" | "break";
export type FlowRatio = 3 | 4 | 5;

const MIN_BREAK_MS = 60_000;

/** Setelah ini, island mengingatkan (tanpa suara) bahwa sesi sudah panjang. */
export const LONG_SESSION_MS = 90 * 60_000;

export function breakMsFor(focusMs: number, ratio: FlowRatio) {
  return Math.max(MIN_BREAK_MS, Math.round(focusMs / ratio / 1000) * 1000);
}

/**
 * Flowmodoro: fokus = stopwatch hitung naik tanpa batas, tanpa alarm.
 * Saat pengguna menekan "Selesai", istirahat mulai otomatis dengan durasi = waktu fokus ÷ rasio.
 * Habisnya istirahat memanggil `onBreakEnd`; fokus berikutnya dimulai manual.
 */
export function useFlowmodoro(onBreakEnd: () => void) {
  const [phase, setPhase] = useState<FlowPhase>("focus");
  const [running, setRunning] = useState(false);
  const [baseMs, setBaseMs] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [breakTotalMs, setBreakTotalMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const onBreakEndRef = useRef(onBreakEnd);

  useEffect(() => {
    onBreakEndRef.current = onBreakEnd;
  });

  // Waktu dihitung dari startedAt agar tidak mengalami drift.
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

    if (focusMs < 1000) return;

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
    displayMs: phase === "focus" ? Math.floor(spentMs / 1000) * 1000 : Math.max(0, breakTotalMs - spentMs),
    breakTotalMs,
    start,
    pause,
    reset,
    finishFocus,
    skipBreak,
  };
}
