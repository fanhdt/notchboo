import { useCallback, useEffect, useState } from "react";

/** @deprecated Target kini dalam ml (`goalMl`). Dipertahankan agar import lama tidak rusak. */
export const WATER_GOAL = 8;
/** Pilihan jeda untuk mode "Tetap" (menit). */
export const WATER_INTERVALS_MIN = [30, 45, 60, 90] as const;
/** Pilihan target harian (ml). Kisaran total minuman orang dewasa menurut EFSA ≈ 1,6–2,0 L. */
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
/** Tambahan target untuk hari panas atau olahraga. */
const HOT_BONUS_ML = 500;
const SNOOZE_MS = WATER_SNOOZE_MIN * 60_000;
/** Mode cerdas: jarak minimal antar pengingat atau dari catatan minum terakhir. */
const SMART_MIN_GAP_MS = 60 * 60_000;
/** Margin konservatif di bawah batas ginjal (~0,8–1,0 L/jam). Pilihan desain, bukan angka penelitian. */
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
  /** Hari (YYYY-MM-DD, waktu lokal) untuk `log` dan `hot`. Keduanya kosong lagi saat hari berganti. */
  day: string;
  hot: boolean;
  log: Entry[];
};

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function hourMs(now: number, hour: number): number {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sumMl(log: Entry[]): number {
  return log.reduce((total, entry) => total + entry.ml, 0);
}

function isEntry(value: unknown): value is Entry {
  const e = value as Entry;
  return typeof value === "object" && value !== null && typeof e.t === "number" && typeof e.ml === "number" && e.ml > 0;
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

    const p = JSON.parse(raw) as Partial<Stored> & { count?: number };

    const startHour = typeof p.startHour === "number" ? clampInt(p.startHour, 0, 24 - MIN_ACTIVE_HOURS) : base.startHour;
    const endHour = typeof p.endHour === "number" ? clampInt(p.endHour, startHour + MIN_ACTIVE_HOURS, 24) : Math.max(base.endHour, startHour + MIN_ACTIVE_HOURS);

    let log = Array.isArray(p.log) ? p.log.filter(isEntry) : [];

    // Migrasi dari versi lama yang hanya menyimpan jumlah gelas.
    if (!Array.isArray(p.log) && typeof p.count === "number" && p.count > 0) {
      const t = hourMs(Date.now(), 0);
      log = Array.from({ length: Math.min(p.count, 40) }, () => ({ t, ml: DEFAULT_GLASS_ML }));
    }

    return {
      enabled: p.enabled !== false,
      mode: p.mode === "fixed" ? "fixed" : "smart",
      intervalMin: typeof p.intervalMin === "number" && p.intervalMin > 0 ? p.intervalMin : base.intervalMin,
      goalMl: typeof p.goalMl === "number" ? clampInt(p.goalMl, 1000, 4000) : base.goalMl,
      glassMl: WATER_GLASS_SIZES_ML.find((ml) => ml === p.glassMl) ?? base.glassMl,
      startHour,
      endHour,
      day: typeof p.day === "string" ? p.day : base.day,
      hot: p.hot === true,
      log,
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

/** Hari berganti: catatan dan "hari panas" kembali kosong. */
function fresh(stored: Stored): Stored {
  const day = todayKey();
  return stored.day === day ? stored : { ...stored, day, hot: false, log: [] };
}

/** Target kumulatif yang "seharusnya" tercapai sekarang: naik merata sepanjang jam aktif. */
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

/** Kapan pengingat berikutnya berbunyi; null = tidak ada lagi hari ini (atau mati). */
function nextReminderAt(p: ScheduleInput): number | null {
  if (!p.enabled || p.totalMl >= p.goalMl || p.now >= p.end) return null;

  let at: number;
  if (p.snoozeUntil !== null) {
    at = p.snoozeUntil;
  } else if (p.mode === "fixed") {
    at = p.lastEventAt + p.intervalMin * 60_000;
  } else {
    // Cerdas: tunggu sampai asupan tertinggal sebesar satu gelas dari kurva target,
    // tapi jangan lebih sering dari jarak minimal.
    const reach = p.start + ((p.totalMl + p.glassMl) / p.goalMl) * (p.end - p.start);
    at = Math.max(p.lastEventAt + SMART_MIN_GAP_MS, reach);
  }

  at = Math.max(at, p.start);
  return at < p.end ? at : null;
}

export interface WaterReminder {
  enabled: boolean;
  /** "smart": hanya mengingatkan saat tertinggal dari target. "fixed": jeda tetap. */
  mode: WaterMode;
  /** Jeda untuk mode "fixed" (menit). */
  intervalMin: number;
  /** Jumlah catatan minum hari ini (versi lama: jumlah gelas). */
  count: number;
  /** Total yang sudah diminum hari ini (ml). */
  totalMl: number;
  /** Target efektif hari ini, sudah termasuk bonus hari panas. */
  goalMl: number;
  /** Target dasar tanpa bonus. */
  baseGoalMl: number;
  /** Hari panas atau olahraga: target hari ini +500 ml. */
  hot: boolean;
  /** Ukuran satu kali minum (ml). */
  glassMl: number;
  startHour: number;
  endHour: number;
  /** Target kumulatif untuk jam sekarang (ml). */
  expectedMl: number;
  /** Selisih dari target kumulatif; 0 jika tidak tertinggal (ml). */
  behindMl: number;
  status: WaterStatus;
  /** Sudah banyak minum dalam sejam terakhir: tahan dulu. */
  slowDown: boolean;
  /** Waktu pengingat berikutnya (ms epoch); null jika mati, sedang berbunyi, atau tidak ada lagi hari ini. */
  nextAt: number | null;
  /** Sisa waktu ke pengingat berikutnya; null jika `nextAt` null. */
  remainingMs: number | null;
  /** Pengingat sedang berbunyi dan menunggu dijawab. */
  due: boolean;
  setEnabled: (enabled: boolean) => void;
  setMode: (mode: WaterMode) => void;
  setIntervalMin: (minutes: number) => void;
  setGoalMl: (ml: number) => void;
  setGlassMl: (ml: number) => void;
  setHot: (hot: boolean) => void;
  setActiveHours: (startHour: number, endHour: number) => void;
  /** Catat satu kali minum (default: ukuran gelas) dan atur ulang jadwal. */
  drink: (ml?: number) => void;
  /** Tunda pengingat. */
  snooze: () => void;
  /** Batalkan catatan terakhir (mis. salah tekan). Tidak mengubah jadwal. */
  undo: () => void;
}

/**
 * Pengingat minum berbasis target harian (ml). Mode cerdas hanya mengingatkan saat asupan tertinggal
 * dari kurva target di jam aktif; mode tetap mengingatkan tiap N menit. Disimpan di localStorage.
 */
export function useWaterReminder(): WaterReminder {
  const [stored, setStored] = useState<Stored>(() => fresh(load()));
  const [now, setNow] = useState(() => Date.now());
  const [lastEventAt, setLastEventAt] = useState(() => Date.now());
  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(null);
  const [due, setDue] = useState(false);

  const update = useCallback((change: (s: Stored) => Stored) => {
    setStored((previous) => {
      const next = change(fresh(previous));
      save(next);
      return next;
    });
  }, []);

  // Jadwal dimulai ulang saat pengingat dinyalakan/dimatikan atau mode/jedanya diganti.
  useEffect(() => {
    const t = Date.now();
    setNow(t);
    setLastEventAt(t);
    setSnoozeUntil(null);
    setDue(false);
  }, [stored.enabled, stored.mode, stored.intervalMin]);

  // Detak ringan, hanya saat pengingat aktif.
  useEffect(() => {
    if (!stored.enabled) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [stored.enabled]);

  const s = fresh(stored);
  const goalMl = s.goalMl + (s.hot ? HOT_BONUS_ML : 0);
  const totalMl = sumMl(s.log);
  const start = hourMs(now, s.startHour);
  const end = hourMs(now, s.endHour);

  const expectedMl = expectedMlAt(goalMl, now, start, end);
  const behindMl = Math.max(0, expectedMl - totalMl);
  const status: WaterStatus = totalMl >= goalMl ? "done" : behindMl >= s.glassMl ? "behind" : "onTrack";
  const slowDown = sumMl(s.log.filter((entry) => now - entry.t < SLOW_DOWN_WINDOW_MS)) >= SLOW_DOWN_ML;

  const nextAt = due
    ? null
    : nextReminderAt({
        enabled: s.enabled,
        mode: s.mode,
        intervalMin: s.intervalMin,
        goalMl,
        glassMl: s.glassMl,
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
      const t = Date.now();
      update((previous) => ({
        ...previous,
        log: [...previous.log, { t, ml: typeof ml === "number" && ml > 0 ? ml : previous.glassMl }].slice(-MAX_LOG),
      }));
      setNow(t);
      setLastEventAt(t);
      setSnoozeUntil(null);
      setDue(false);
    },
    [update],
  );

  const undo = useCallback(() => {
    update((previous) => ({ ...previous, log: previous.log.slice(0, -1) }));
  }, [update]);

  const snooze = useCallback(() => {
    const t = Date.now();
    setNow(t);
    setLastEventAt(t);
    setSnoozeUntil(t + SNOOZE_MS);
    setDue(false);
  }, []);

  return {
    enabled: s.enabled,
    mode: s.mode,
    intervalMin: s.intervalMin,
    count: s.log.length,
    totalMl,
    goalMl,
    baseGoalMl: s.goalMl,
    hot: s.hot,
    glassMl: s.glassMl,
    startHour: s.startHour,
    endHour: s.endHour,
    expectedMl,
    behindMl,
    status,
    slowDown,
    nextAt,
    remainingMs: nextAt === null ? null : Math.max(0, nextAt - now),
    due,
    setEnabled: (enabled) => update((previous) => ({ ...previous, enabled })),
    setMode: (mode) => update((previous) => ({ ...previous, mode })),
    setIntervalMin: (intervalMin) => update((previous) => ({ ...previous, intervalMin })),
    setGoalMl: (ml) => update((previous) => ({ ...previous, goalMl: clampInt(ml, 1000, 4000) })),
    setGlassMl: (ml) => update((previous) => ({ ...previous, glassMl: clampInt(ml, 50, 1000) })),
    setHot: (hot) => update((previous) => ({ ...previous, hot })),
    setActiveHours: (startHour, endHour) =>
      update((previous) => {
        const startValue = clampInt(startHour, 0, 24 - MIN_ACTIVE_HOURS);
        return { ...previous, startHour: startValue, endHour: clampInt(endHour, startValue + MIN_ACTIVE_HOURS, 24) };
      }),
    drink,
    snooze,
    undo,
  };
}
