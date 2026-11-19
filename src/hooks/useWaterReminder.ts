import { useCallback, useEffect, useState } from "react";

/** @deprecated Target kini dalam ml (`goalMl`). Dipertahankan agar import lama tidak rusak. */
export const WATER_GOAL = 8;
/** Pilihan jeda untuk mode "Tetap" (menit). */
export const WATER_INTERVALS_MIN = [30, 45, 60, 90] as const;
/** Pilihan target harian (ml). */
export const WATER_GOALS_ML = [1500, 2000, 2500] as const;
/** Pilihan ukuran satu kali minum (ml). */
export const WATER_GLASS_SIZES_ML = [150, 250, 350, 500] as const;
export const WATER_SNOOZE_MIN = 15;

export type WaterMode = "smart" | "fixed";
export type WaterStatus = "done" | "behind" | "onTrack";

const DEFAULT_INTERVAL_MIN = 60;
const DEFAULT_GOAL_ML = 2000;
const DEFAULT_GLASS_ML = 250;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 21;
const MIN_ACTIVE_HOURS = 4;
const HOT_BONUS_ML = 500;
const SNOOZE_MS = WATER_SNOOZE_MIN * 60_000;
const SMART_MIN_GAP_MS = 60 * 60_000;
const SLOW_DOWN_ML = 750;
const SLOW_DOWN_WINDOW_MS = 60 * 60_000;
const TICK_MS = 10_000;
const MAX_LOG = 200;
const STORAGE_KEY = "notchboo.water";

type Entry = { t: number; ml: number };

type Stored = {
  enabled: boolean;
  mode: WaterMode;
  intervalMin: number;
  goalMl: number;
  glassMl: number;
  startHour: number;
  endHour: number;
  day: string;
  hot: boolean;
  log: Entry[];
};

function todayKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hourMs(now: number, hour: number): number {
  const date = new Date(now);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sumMl(log: Entry[]): number {
  return log.reduce((total, entry) => total + entry.ml, 0);
}

function isEntry(value: unknown): value is Entry {
  if (typeof value !== "object" || value === null) return false;

  const entry = value as Entry;
  return typeof entry.t === "number" && Number.isFinite(entry.t) && typeof entry.ml === "number" && Number.isFinite(entry.ml) && entry.ml > 0;
}

function defaults(): Stored {
  return {
    enabled: true,
    mode: "smart",
    intervalMin: DEFAULT_INTERVAL_MIN,
    goalMl: DEFAULT_GOAL_ML,
    glassMl: DEFAULT_GLASS_ML,
    startHour: DEFAULT_START_HOUR,
    endHour: DEFAULT_END_HOUR,
    day: todayKey(),
    hot: false,
    log: [],
  };
}

function load(): Stored {
  const base = defaults();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;

    const parsed = JSON.parse(raw) as Partial<Stored> & { count?: number };

    const startHour = typeof parsed.startHour === "number" && Number.isFinite(parsed.startHour) ? clampInt(parsed.startHour, 0, 24 - MIN_ACTIVE_HOURS) : base.startHour;

    const endHour = typeof parsed.endHour === "number" && Number.isFinite(parsed.endHour) ? clampInt(parsed.endHour, startHour + MIN_ACTIVE_HOURS, 24) : Math.max(base.endHour, startHour + MIN_ACTIVE_HOURS);

    let log = Array.isArray(parsed.log) ? parsed.log.filter(isEntry) : [];

    // Migrasi dari versi lama yang hanya menyimpan jumlah gelas.
    if (!Array.isArray(parsed.log) && typeof parsed.count === "number" && parsed.count > 0) {
      const timestamp = hourMs(Date.now(), 0);
      log = Array.from({ length: Math.min(Math.floor(parsed.count), 40) }, () => ({ t: timestamp, ml: DEFAULT_GLASS_ML }));
    }

    return {
      enabled: parsed.enabled !== false,
      mode: parsed.mode === "fixed" ? "fixed" : "smart",
      intervalMin: typeof parsed.intervalMin === "number" && Number.isFinite(parsed.intervalMin) && parsed.intervalMin > 0 ? clampInt(parsed.intervalMin, 1, 1440) : base.intervalMin,
      goalMl: typeof parsed.goalMl === "number" && Number.isFinite(parsed.goalMl) ? clampInt(parsed.goalMl, 1000, 4000) : base.goalMl,
      glassMl: WATER_GLASS_SIZES_ML.find((ml) => ml === parsed.glassMl) ?? base.glassMl,
      startHour,
      endHour,
      day: typeof parsed.day === "string" ? parsed.day : base.day,
      hot: parsed.hot === true,
      log: log.slice(-MAX_LOG),
    };
  } catch {
    return base;
  }
}

function save(stored: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Penyimpanan tidak tersedia: pengaturan hanya berlaku selama aplikasi berjalan.
  }
}

/** Reset data harian tanpa mengubah preferensi pengguna. */
function fresh(stored: Stored, day = todayKey()): Stored {
  if (stored.day === day) return stored;

  return {
    ...stored,
    day,
    hot: false,
    log: [],
  };
}

function expectedMlAt(goal: number, now: number, start: number, end: number): number {
  if (now <= start) return 0;
  if (now >= end) return goal;
  return (goal * (now - start)) / (end - start);
}

type ScheduleInput = {
  enabled: boolean;
  mode: WaterMode;
  intervalMin: number;
  goalMl: number;
  glassMl: number;
  totalMl: number;
  now: number;
  start: number;
  end: number;
  lastEventAt: number;
  snoozeUntil: number | null;
};

function nextReminderAt(params: ScheduleInput): number | null {
  if (!params.enabled || params.totalMl >= params.goalMl || params.now >= params.end) {
    return null;
  }

  let at: number;

  if (params.snoozeUntil !== null) {
    at = params.snoozeUntil;
  } else if (params.mode === "fixed") {
    at = params.lastEventAt + params.intervalMin * 60_000;
  } else {
    const reach = params.start + ((params.totalMl + params.glassMl) / params.goalMl) * (params.end - params.start);

    at = Math.max(params.lastEventAt + SMART_MIN_GAP_MS, reach);
  }

  at = Math.max(at, params.start);
  return at < params.end ? at : null;
}

export interface WaterReminder {
  enabled: boolean;
  mode: WaterMode;
  intervalMin: number;
  count: number;
  totalMl: number;
  goalMl: number;
  baseGoalMl: number;
  hot: boolean;
  glassMl: number;
  startHour: number;
  endHour: number;
  expectedMl: number;
  behindMl: number;
  status: WaterStatus;
  slowDown: boolean;
  nextAt: number | null;
  remainingMs: number | null;
  due: boolean;
  setEnabled: (enabled: boolean) => void;
  setMode: (mode: WaterMode) => void;
  setIntervalMin: (minutes: number) => void;
  setGoalMl: (ml: number) => void;
  setGlassMl: (ml: number) => void;
  setHot: (hot: boolean) => void;
  setActiveHours: (startHour: number, endHour: number) => void;
  drink: (ml?: number) => void;
  snooze: () => void;
  undo: () => void;
}

/**
 * Pengingat minum berbasis target harian.
 * Mode cerdas mengingatkan saat asupan tertinggal dari kurva target.
 * Mode tetap mengingatkan setiap N menit.
 */
export function useWaterReminder(): WaterReminder {
  const [stored, setStored] = useState<Stored>(() => fresh(load()));
  const [now, setNow] = useState(() => Date.now());
  const [lastEventAt, setLastEventAt] = useState(() => Date.now());
  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(null);
  const [due, setDue] = useState(false);

  const update = useCallback((change: (stored: Stored) => Stored) => {
    setStored((previous) => {
      const next = change(fresh(previous));
      save(next);
      return next;
    });
  }, []);

  // Deteksi pergantian tanggal menggunakan jam lokal.
  useEffect(() => {
    const checkDay = () => {
      const timestamp = Date.now();
      const day = todayKey();

      setNow(timestamp);

      setStored((previous) => {
        const next = fresh(previous, day);

        if (next !== previous) {
          save(next);
        }

        return next;
      });

      setLastEventAt(timestamp);
      setSnoozeUntil(null);
      setDue(false);
    };

    const interval = window.setInterval(checkDay, TICK_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkDay();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Jadwal dimulai ulang saat pengaturan jadwal berubah.
  useEffect(() => {
    const timestamp = Date.now();

    setNow(timestamp);
    setLastEventAt(timestamp);
    setSnoozeUntil(null);
    setDue(false);
  }, [stored.enabled, stored.mode, stored.intervalMin]);

  // Detak ringan untuk memperbarui jadwal.
  useEffect(() => {
    if (!stored.enabled) return;

    const interval = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(interval);
  }, [stored.enabled]);

  const current = fresh(stored);
  const goalMl = current.goalMl + (current.hot ? HOT_BONUS_ML : 0);
  const totalMl = sumMl(current.log);

  const start = hourMs(now, current.startHour);
  const end = hourMs(now, current.endHour);

  const expectedMl = expectedMlAt(goalMl, now, start, end);
  const behindMl = Math.max(0, expectedMl - totalMl);

  const status: WaterStatus = totalMl >= goalMl ? "done" : behindMl >= current.glassMl ? "behind" : "onTrack";

  const slowDown = sumMl(current.log.filter((entry) => now >= entry.t && now - entry.t < SLOW_DOWN_WINDOW_MS)) >= SLOW_DOWN_ML;

  const nextAt = due
    ? null
    : nextReminderAt({
        enabled: current.enabled,
        mode: current.mode,
        intervalMin: current.intervalMin,
        goalMl,
        glassMl: current.glassMl,
        totalMl,
        now,
        start,
        end,
        lastEventAt,
        snoozeUntil,
      });

  // Waktunya berbunyi.
  useEffect(() => {
    if (due || nextAt === null || now < nextAt) return;

    setDue(true);
    setLastEventAt(now);
    setSnoozeUntil(null);
  }, [due, nextAt, now]);

  const drink = useCallback(
    (ml?: number) => {
      const timestamp = Date.now();

      update((previous) => ({
        ...previous,
        log: [
          ...previous.log,
          {
            t: timestamp,
            ml: typeof ml === "number" && Number.isFinite(ml) && ml > 0 ? clampInt(ml, 1, 2000) : previous.glassMl,
          },
        ].slice(-MAX_LOG),
      }));

      setNow(timestamp);
      setLastEventAt(timestamp);
      setSnoozeUntil(null);
      setDue(false);
    },
    [update],
  );

  const undo = useCallback(() => {
    update((previous) => ({
      ...previous,
      log: previous.log.slice(0, -1),
    }));
  }, [update]);

  const snooze = useCallback(() => {
    const timestamp = Date.now();

    setNow(timestamp);
    setLastEventAt(timestamp);
    setSnoozeUntil(timestamp + SNOOZE_MS);
    setDue(false);
  }, []);

  return {
    enabled: current.enabled,
    mode: current.mode,
    intervalMin: current.intervalMin,
    count: current.log.length,
    totalMl,
    goalMl,
    baseGoalMl: current.goalMl,
    hot: current.hot,
    glassMl: current.glassMl,
    startHour: current.startHour,
    endHour: current.endHour,
    expectedMl,
    behindMl,
    status,
    slowDown,
    nextAt,
    remainingMs: nextAt === null ? null : Math.max(0, nextAt - now),
    due,
    setEnabled: (enabled) => update((previous) => ({ ...previous, enabled })),
    setMode: (mode) => update((previous) => ({ ...previous, mode })),
    setIntervalMin: (minutes) =>
      update((previous) => ({
        ...previous,
        intervalMin: clampInt(minutes, 1, 1440),
      })),
    setGoalMl: (ml) =>
      update((previous) => ({
        ...previous,
        goalMl: clampInt(ml, 1000, 4000),
      })),
    setGlassMl: (ml) =>
      update((previous) => ({
        ...previous,
        glassMl: clampInt(ml, 50, 1000),
      })),
    setHot: (hot) => update((previous) => ({ ...previous, hot })),
    setActiveHours: (startHour, endHour) =>
      update((previous) => {
        const startValue = clampInt(startHour, 0, 24 - MIN_ACTIVE_HOURS);

        return {
          ...previous,
          startHour: startValue,
          endHour: clampInt(endHour, startValue + MIN_ACTIVE_HOURS, 24),
        };
      }),
    drink,
    snooze,
    undo,
  };
}
