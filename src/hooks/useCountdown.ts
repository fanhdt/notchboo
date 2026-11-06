import { useCallback, useEffect, useRef, useState } from "react";

export function useCountdown(durationMs: number, onFinish: () => void) {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);

  // Selalu panggil onFinish versi terbaru tanpa memulai ulang interval.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Durasi berganti (mis. fokus -> istirahat): berhenti dan isi ulang.
  useEffect(() => {
    setRunning(false);
    setRemainingMs(durationMs);
  }, [durationMs]);

  useEffect(() => {
    if (!running) return;

    const id = setInterval(() => {
      const left = endAt.current - Date.now();
      if (left <= 0) {
        clearInterval(id);
        setRunning(false);
        setRemainingMs(0);
        onFinishRef.current();
      } else {
        setRemainingMs(left);
      }
    }, 200);

    return () => clearInterval(id);
  }, [running]);

  const start = useCallback(() => {
    if (remainingMs <= 0) return;
    endAt.current = Date.now() + remainingMs;
    setRunning(true);
  }, [remainingMs]);

  const pause = useCallback(() => {
    setRemainingMs(Math.max(0, endAt.current - Date.now()));
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setRemainingMs(durationMs);
  }, [durationMs]);

  return { remainingMs, running, start, pause, reset };
}
