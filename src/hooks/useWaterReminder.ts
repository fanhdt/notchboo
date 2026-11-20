import { useCallback, useEffect, useRef, useState } from "react";

import { useSettings } from "./useSettings";
import type { WaterMode } from "../lib/settings";
import type { AppSettings } from "../lib/settings";

export type { WaterMode } from "../lib/settings";

/** @deprecated Target kini dalam ml (`goalMl`). */
export const WATER_GOAL = 8;

export const WATER_INTERVALS_MIN = [30, 45, 60, 90] as const;
export const WATER_GOALS_ML = [1500, 2000, 2500] as const;
export const WATER_GLASS_SIZES_ML = [150, 250, 350, 500] as const;
export const WATER_SNOOZE_MIN = 15;

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

/**
 * Hanya data operasional yang disimpan secara lokal.
 * Preferensi aplikasi dimiliki centralized settings.
 */
type Stored = {
  day: string;
  hot: boolean;
  log: Entry[];
};

type AppSettingsWater = AppSettings["features"]["waterReminder"];
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
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Entry;

  return typeof entry.t === "number" && Number.isFinite(entry.t) && typeof entry.ml === "number" && Number.isFinite(entry.ml) && entry.ml > 0;
}

function defaults(): Stored {
  return {
    day: todayKey(),
    hot: false,
    log: [],
  };
}

function load(): Stored {
  const base = defaults();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return base;
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return base;
    }

    const value = parsed as Record<string, unknown>;

    let log = Array.isArray(value.log) ? value.log.filter(isEntry) : [];

    // Migrasi riwayat dari versi lama yang hanya menyimpan jumlah gelas.
    if (!Array.isArray(value.log) && typeof value.count === "number" && Number.isFinite(value.count) && value.count > 0) {
      const timestamp = hourMs(Date.now(), 0);

      log = Array.from({ length: Math.min(Math.floor(value.count), 40) }, () => ({ t: timestamp, ml: DEFAULT_GLASS_ML }));
    }

    return {
      day: typeof value.day === "string" ? value.day : base.day,
      hot: value.hot === true,
      log: log.slice(-MAX_LOG),
    };
  } catch (error) {
    console.warn("[WaterReminder] Failed to load operational data:", error);

    return base;
  }
}

function save(stored: Stored): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    console.warn("[WaterReminder] Failed to save operational data:", error);
  }
}

/** Reset data harian tanpa mengubah preferensi pengguna. */
function fresh(stored: Stored, day = todayKey()): Stored {
  if (stored.day === day) {
    return stored;
  }

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

export function useWaterReminder(): WaterReminder {
  const { settings: appSettings, loaded, updateSettings } = useSettings();

  const water = appSettings?.features.waterReminder;

  const enabled = water?.enabled ?? true;
  const mode = water?.mode ?? "smart";
  const intervalMin = water?.intervalMin ?? DEFAULT_INTERVAL_MIN;
  const baseGoalMl = water?.goalMl ?? DEFAULT_GOAL_ML;
  const glassMl = water?.glassMl ?? DEFAULT_GLASS_ML;
  const startHour = water?.startHour ?? DEFAULT_START_HOUR;
  const endHour = water?.endHour ?? DEFAULT_END_HOUR;

  const [stored, setStored] = useState<Stored>(() => fresh(load()));
  const [now, setNow] = useState(() => Date.now());
  const [lastEventAt, setLastEventAt] = useState(() => Date.now());
  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(null);
  const [due, setDue] = useState(false);

  const update = useCallback(
    (change: (stored: Stored) => Stored) => {
      setStored((previous) => {
        const next = change(fresh(previous));

        // Hindari menimpa data legacy sebelum migrasi selesai.
        if (loaded) {
          save(next);
        }

        return next;
      });
    },
    [loaded],
  );

  const updateWaterSettings = useCallback(
    (change: (current: NonNullable<AppSettingsWater>) => NonNullable<AppSettingsWater>) => {
      if (!loaded) {
        return;
      }

      updateSettings((current) => ({
        ...current,
        features: {
          ...current.features,
          waterReminder: change(current.features.waterReminder),
        },
      }));
    },
    [loaded, updateSettings],
  );

  const dayRef = useRef(stored.day);

  // Deteksi pergantian tanggal menggunakan jam lokal.
  useEffect(() => {
    const checkDay = () => {
      const timestamp = Date.now();
      const day = todayKey();

      setNow(timestamp);

      setStored((previous) => {
        const next = fresh(previous, day);

        if (next !== previous && loaded) {
          save(next);
        }

        return next;
      });

      if (day !== dayRef.current) {
        dayRef.current = day;

        setLastEventAt(timestamp);
        setSnoozeUntil(null);
        setDue(false);
      }
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
  }, [loaded]);

  // Jadwal dimulai ulang saat pengaturan jadwal berubah.
  useEffect(() => {
    const timestamp = Date.now();

    setNow(timestamp);
    setLastEventAt(timestamp);
    setSnoozeUntil(null);
    setDue(false);
  }, [enabled, mode, intervalMin]);

  // Detak ringan untuk memperbarui jadwal.
  useEffect(() => {
    if (!enabled) return;

    const interval = window.setInterval(() => setNow(Date.now()), TICK_MS);

    return () => window.clearInterval(interval);
  }, [enabled]);

  const current = fresh(stored);
  const goalMl = baseGoalMl + (current.hot ? HOT_BONUS_ML : 0);
  const totalMl = sumMl(current.log);

  const start = hourMs(now, startHour);
  const end = hourMs(now, endHour);

  const expectedMl = expectedMlAt(goalMl, now, start, end);
  const behindMl = Math.max(0, expectedMl - totalMl);

  const status: WaterStatus = totalMl >= goalMl ? "done" : behindMl >= glassMl ? "behind" : "onTrack";

  const slowDown = sumMl(current.log.filter((entry) => now >= entry.t && now - entry.t < SLOW_DOWN_WINDOW_MS)) >= SLOW_DOWN_ML;

  const nextAt = due
    ? null
    : nextReminderAt({
        enabled,
        mode,
        intervalMin,
        goalMl,
        glassMl,
        totalMl,
        now,
        start,
        end,
        lastEventAt,
        snoozeUntil,
      });

  // Waktunya berbunyi.
  useEffect(() => {
    if (due || nextAt === null || now < nextAt) {
      return;
    }

    setDue(true);
    setLastEventAt(now);
    setSnoozeUntil(null);
  }, [due, nextAt, now]);

  const setEnabled = useCallback(
    (value: boolean) => {
      updateWaterSettings((current) => ({
        ...current,
        enabled: value,
      }));
    },
    [updateWaterSettings],
  );

  const setMode = useCallback(
    (value: WaterMode) => {
      updateWaterSettings((current) => ({
        ...current,
        mode: value,
      }));
    },
    [updateWaterSettings],
  );

  const setIntervalMin = useCallback(
    (minutes: number) => {
      updateWaterSettings((current) => ({
        ...current,
        intervalMin: clampInt(minutes, 1, 1440),
      }));
    },
    [updateWaterSettings],
  );

  const setGoalMl = useCallback(
    (ml: number) => {
      updateWaterSettings((current) => ({
        ...current,
        goalMl: clampInt(ml, 1000, 4000),
      }));
    },
    [updateWaterSettings],
  );

  const setGlassMl = useCallback(
    (ml: number) => {
      updateWaterSettings((current) => ({
        ...current,
        glassMl: clampInt(ml, 50, 1000),
      }));
    },
    [updateWaterSettings],
  );

  const setActiveHours = useCallback(
    (start: number, end: number) => {
      updateWaterSettings((current) => {
        const startValue = clampInt(start, 0, 24 - MIN_ACTIVE_HOURS);

        return {
          ...current,
          startHour: startValue,
          endHour: clampInt(end, startValue + MIN_ACTIVE_HOURS, 24),
        };
      });
    },
    [updateWaterSettings],
  );

  const setHot = useCallback(
    (hot: boolean) => {
      update((previous) => ({
        ...previous,
        hot,
      }));
    },
    [update],
  );

  const drink = useCallback(
    (ml?: number) => {
      const timestamp = Date.now();

      update((previous) => ({
        ...previous,
        log: [
          ...previous.log,
          {
            t: timestamp,
            ml: typeof ml === "number" && Number.isFinite(ml) && ml > 0 ? clampInt(ml, 1, 2000) : glassMl,
          },
        ].slice(-MAX_LOG),
      }));

      setNow(timestamp);
      setLastEventAt(timestamp);
      setSnoozeUntil(null);
      setDue(false);
    },
    [glassMl, update],
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
    enabled,
    mode,
    intervalMin,
    count: current.log.length,
    totalMl,
    goalMl,
    baseGoalMl,
    hot: current.hot,
    glassMl,
    startHour,
    endHour,
    expectedMl,
    behindMl,
    status,
    slowDown,
    nextAt,
    remainingMs: nextAt === null ? null : Math.max(0, nextAt - now),
    due,
    setEnabled,
    setMode,
    setIntervalMin,
    setGoalMl,
    setGlassMl,
    setHot,
    setActiveHours,
    drink,
    snooze,
    undo,
  };
}
