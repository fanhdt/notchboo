import { useCallback, useEffect, useState } from "react";

/** Target gelas per hari yang ditampilkan di island. */
export const WATER_GOAL = 8;
/** Pilihan jeda antar pengingat (menit). */
export const WATER_INTERVALS_MIN = [30, 45, 60, 90] as const;

const DEFAULT_INTERVAL_MIN = 60;
const SNOOZE_MS = 5 * 60_000;
const STORAGE_KEY = "notchboo.water";

type Stored = {
  enabled: boolean;
  intervalMin: number;
  /** Hari (YYYY-MM-DD, waktu lokal) untuk `count`. Hitungan kembali ke 0 saat hari berganti. */
  day: string;
  count: number;
};

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function load(): Stored {
  const fallback: Stored = { enabled: true, intervalMin: DEFAULT_INTERVAL_MIN, day: todayKey(), count: 0 };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      enabled: parsed.enabled !== false,
      intervalMin: typeof parsed.intervalMin === "number" && parsed.intervalMin > 0 ? parsed.intervalMin : DEFAULT_INTERVAL_MIN,
      day: typeof parsed.day === "string" ? parsed.day : todayKey(),
      count: typeof parsed.count === "number" && parsed.count >= 0 ? parsed.count : 0,
    };
  } catch {
    return fallback;
  }
}

function save(stored: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Penyimpanan tidak tersedia: pengaturan hanya berlaku selama aplikasi berjalan.
  }
}

export interface WaterReminder {
  enabled: boolean;
  intervalMin: number;
  /** Gelas yang sudah diminum hari ini. */
  count: number;
  /** Sisa waktu ke pengingat berikutnya; null jika pengingat mati atau sedang berbunyi. */
  remainingMs: number | null;
  /** Pengingat sedang berbunyi dan menunggu dijawab. */
  due: boolean;
  setEnabled: (enabled: boolean) => void;
  setIntervalMin: (minutes: number) => void;
  /** Catat satu gelas dan mulai hitung mundur dari awal. */
  drink: () => void;
  /** Tunda pengingat 5 menit. */
  snooze: () => void;
  /** Kurangi satu gelas (mis. salah tekan). Tidak bisa di bawah 0 dan tidak mengubah hitung mundur. */
  undo: () => void;
}

/** Pengingat minum: hitung mundur berulang, hitungan gelas harian, disimpan di penyimpanan lokal webview. */
export function useWaterReminder(): WaterReminder {
  const [stored, setStored] = useState<Stored>(load);
  const [dueAt, setDueAt] = useState<number | null>(null);
  const [due, setDue] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const update = useCallback((patch: Partial<Stored>) => {
    setStored((previous) => {
      const next = { ...previous, ...patch };
      save(next);
      return next;
    });
  }, []);

  // Jadwal dibuat ulang saat pengingat dinyalakan/dimatikan atau jedanya diganti.
  useEffect(() => {
    const t = Date.now();
    setNow(t);
    setDue(false);
    setDueAt(stored.enabled ? t + stored.intervalMin * 60_000 : null);
  }, [stored.enabled, stored.intervalMin]);

  // Detak tiap detik, hanya selama ada jadwal.
  useEffect(() => {
    if (dueAt === null) return;

    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= dueAt) {
        setDue(true);
        setDueAt(null);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [dueAt]);

  const drink = useCallback(() => {
    const day = todayKey();
    setStored((previous) => {
      const next = { ...previous, day, count: (previous.day === day ? previous.count : 0) + 1 };
      save(next);
      return next;
    });

    const t = Date.now();
    setNow(t);
    setDue(false);
    setDueAt(stored.enabled ? t + stored.intervalMin * 60_000 : null);
  }, [stored.enabled, stored.intervalMin]);

  const undo = useCallback(() => {
    const day = todayKey();
    setStored((previous) => {
      const current = previous.day === day ? previous.count : 0;
      const next = { ...previous, day, count: Math.max(0, current - 1) };
      save(next);
      return next;
    });
  }, []);

  const snooze = useCallback(() => {
    const t = Date.now();
    setNow(t);
    setDue(false);
    setDueAt(t + SNOOZE_MS);
  }, []);

  return {
    enabled: stored.enabled,
    intervalMin: stored.intervalMin,
    count: stored.day === todayKey() ? stored.count : 0,
    remainingMs: dueAt === null ? null : Math.max(0, dueAt - now),
    due,
    setEnabled: (enabled) => update({ enabled }),
    setIntervalMin: (intervalMin) => update({ intervalMin }),
    drink,
    snooze,
    undo,
  };
}
