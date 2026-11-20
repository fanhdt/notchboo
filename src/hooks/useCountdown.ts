import { useCallback, useEffect, useRef, useState } from "react";

import { msUntilCountdownChange } from "../lib/clock";

export function useCountdown(durationMs: number, onFinish: () => void) {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);

  // Selalu panggil onFinish versi terbaru tanpa memulai ulang timer.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Durasi berganti (mis. fokus -> istirahat): berhenti dan isi ulang.
  useEffect(() => {
    setRunning(false);
    setRemainingMs(durationMs);
  }, [durationMs]);

  // Tampilan berresolusi detik, jadi state hanya diperbarui saat detik yang ditampilkan berganti.
  // Sisa waktu selalu dihitung dari `endAt` (waktu absolut), sehingga tidak ada drift.
  useEffect(() => {
    if (!running) return;

    let id = 0;

    const tick = () => {
      const left = endAt.current - Date.now();
      if (left <= 0) {
        setRunning(false);
        setRemainingMs(0);
        onFinishRef.current();
        return;
      }

      setRemainingMs(left);
      id = window.setTimeout(tick, msUntilCountdownChange(left));
    };

    id = window.setTimeout(tick, msUntilCountdownChange(endAt.current - Date.now()));

    return () => window.clearTimeout(id);
  }, [running]);

  const start = useCallback(() => {
    if (remainingMs <= 0) return;
    endAt.current = Date.now() + remainingMs;
    setRunning(true);
  }, [remainingMs]);

  const pause = useCallback(() => {
    const left = endAt.current - Date.now();

    setRunning(false);

    if (left <= 0) {
      setRemainingMs(0);
      onFinishRef.current();
      return;
    }

    setRemainingMs(left);
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setRemainingMs(durationMs);
  }, [durationMs]);

  return { remainingMs, running, start, pause, reset };
}
