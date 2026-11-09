// Model tugas: tanggal, pengulangan, kategori, dan pengingat. Murni logika, tanpa React.

import { invoke } from "@tauri-apps/api/core";

export type Repeat = "none" | "daily" | "weekly";

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  title: string;
  categoryId: string | null;
  /** Tanggal mulai, "YYYY-MM-DD". Untuk tugas sekali jalan, inilah harinya. */
  date: string;
  /** Jam pengingat "HH:MM", atau null. */
  time: string | null;
  repeat: Repeat;
  /** Hari untuk pengulangan mingguan, 0 = Minggu ... 6 = Sabtu. */
  days: number[];
  /** Tanggal-tanggal yang sudah selesai. Tugas berulang selesai per hari. */
  doneDates: string[];
  /** Tanggal-tanggal yang pengingatnya sudah dijawab. */
  notifiedDates: string[];
  /** Pengingat ditunda sampai waktu ini (ms), atau null. */
  snoozeUntil: number | null;
  createdAt: number;
}

export interface TaskStore {
  version: 1;
  tasks: Task[];
  categories: Category[];
}

/** Satu kemunculan tugas pada satu tanggal. */
export interface Occurrence {
  task: Task;
  /** Tanggal kemunculannya. Untuk tugas tertunda, tanggal aslinya. */
  date: string;
  done: boolean;
  /** Tugas sekali jalan dari hari sebelumnya yang belum selesai. */
  overdue: boolean;
}

export const CATEGORY_COLORS = ["#60a5fa", "#fbbf24", "#c8e63c", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171"];

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-kerja", name: "Pekerjaan", color: CATEGORY_COLORS[0] },
  { id: "cat-sekolah", name: "Sekolah", color: CATEGORY_COLORS[1] },
  { id: "cat-rutinitas", name: "Rutinitas", color: CATEGORY_COLORS[2] },
  { id: "cat-pribadi", name: "Pribadi", color: CATEGORY_COLORS[3] },
];

export function emptyStore(): TaskStore {
  return { version: 1, tasks: [], categories: DEFAULT_CATEGORIES };
}

/** Pengingat yang sudah terlewat lebih dari ini tidak lagi dibunyikan saat aplikasi dibuka. */
const DUE_WINDOW_MS = 6 * 60 * 60_000;

export const REMINDER_SNOOZE_MS = 10 * 60_000;

// ---------- Tanggal ----------

const pad = (value: number) => String(value).padStart(2, "0");

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function fromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: string, amount: number): string {
  const date = fromKey(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

/** Hari Senin dari minggu yang memuat tanggal ini. */
export function weekStart(key: string): string {
  const date = fromKey(key);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dateKey(date);
}

export function dayOfWeek(key: string): number {
  return fromKey(key).getDay();
}

/** Urutan hari dalam seminggu yang ditampilkan: Senin sampai Minggu. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function formatLongDate(key: string): string {
  return fromKey(key).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
}

export function formatShortDate(key: string): string {
  return fromKey(key).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

// ---------- Kemunculan ----------

export function occursOn(task: Task, key: string): boolean {
  if (key < task.date) return false;

  switch (task.repeat) {
    case "none":
      return key === task.date;
    case "daily":
      return true;
    case "weekly":
      return task.days.includes(dayOfWeek(key));
  }
}

function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;

  const timeA = a.task.time ?? "99:99";
  const timeB = b.task.time ?? "99:99";
  if (timeA !== timeB) return timeA < timeB ? -1 : 1;
  return a.task.createdAt - b.task.createdAt;
}

/** Tugas pada satu tanggal. Untuk hari ini, tugas sekali jalan yang tertunda ikut tampil di atas. */
export function occurrencesOn(tasks: Task[], key: string, today: string): Occurrence[] {
  const list: Occurrence[] = [];

  for (const task of tasks) {
    if (occursOn(task, key)) {
      list.push({ task, date: key, done: task.doneDates.includes(key), overdue: false });
    } else if (key === today && task.repeat === "none" && task.date < today && !task.doneDates.includes(task.date)) {
      list.push({ task, date: task.date, done: false, overdue: true });
    }
  }

  return list.sort(compareOccurrences);
}

export function openCountOn(tasks: Task[], key: string, today: string): number {
  return occurrencesOn(tasks, key, today).filter((occurrence) => !occurrence.done).length;
}

export function describeRepeat(task: Task): string | null {
  if (task.repeat === "daily") return "Setiap hari";
  if (task.repeat === "weekly") {
    const names = WEEK_ORDER.filter((day) => task.days.includes(day)).map((day) => DAY_SHORT[day]);
    return names.length > 0 ? names.join(", ") : "Mingguan";
  }
  return null;
}

// ---------- Pengingat ----------

function remindAt(task: Task, key: string): number | null {
  if (!task.time) return null;

  const [hours, minutes] = task.time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  const date = fromKey(key);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

/** Tugas hari ini yang pengingatnya sedang berbunyi, atau null. */
export function findDue(tasks: Task[], today: string, now: number): Occurrence | null {
  const startOfToday = fromKey(today).getTime();

  for (const task of tasks) {
    if (!task.time || !occursOn(task, today) || task.doneDates.includes(today)) continue;

    const at = remindAt(task, today);
    if (at === null) continue;

    const due = task.snoozeUntil !== null && task.snoozeUntil >= startOfToday ? now >= task.snoozeUntil : !task.notifiedDates.includes(today) && now >= at && now - at < DUE_WINDOW_MS;

    if (due) return { task, date: today, done: false, overdue: false };
  }

  return null;
}

// ---------- Penyimpanan ----------

function isCategory(value: unknown): value is Category {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<Category>;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.color === "string";
}

function toStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toTask(value: unknown): Task | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Partial<Task>;
  if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.date !== "string") return null;

  return {
    id: item.id,
    title: item.title,
    categoryId: typeof item.categoryId === "string" ? item.categoryId : null,
    date: item.date,
    time: typeof item.time === "string" && item.time !== "" ? item.time : null,
    repeat: item.repeat === "daily" || item.repeat === "weekly" ? item.repeat : "none",
    days: Array.isArray(item.days) ? item.days.filter((day): day is number => typeof day === "number" && day >= 0 && day <= 6) : [],
    doneDates: toStrings(item.doneDates),
    notifiedDates: toStrings(item.notifiedDates),
    snoozeUntil: typeof item.snoozeUntil === "number" ? item.snoozeUntil : null,
    createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
  };
}

/** Membaca JSON tersimpan. Mengembalikan null jika tidak bisa dibaca. */
export function parseStore(text: string): TaskStore | null {
  try {
    const parsed = JSON.parse(text) as { tasks?: unknown; categories?: unknown };
    if (!parsed || typeof parsed !== "object") return null;

    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(toTask).filter((task): task is Task => task !== null) : [];
    const categories = Array.isArray(parsed.categories) ? parsed.categories.filter(isCategory) : DEFAULT_CATEGORIES;
    return { version: 1, tasks, categories };
  } catch {
    return null;
  }
}

const LEGACY_KEY = "notchboo.tasks";

/** Tugas dari versi lama (daftar sederhana di localStorage), diubah ke model baru. */
export function loadLegacyTasks(): Task[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item): Task[] => {
      if (typeof item !== "object" || item === null) return [];
      const old = item as { id?: unknown; title?: unknown; done?: unknown; createdAt?: unknown; remindAt?: unknown };
      if (typeof old.id !== "string" || typeof old.title !== "string") return [];

      const created = typeof old.createdAt === "number" ? old.createdAt : Date.now();
      const remind = typeof old.remindAt === "number" ? new Date(old.remindAt) : null;
      const date = dateKey(remind ?? new Date(created));

      return [
        {
          id: old.id,
          title: old.title,
          categoryId: null,
          date,
          time: remind ? `${pad(remind.getHours())}:${pad(remind.getMinutes())}` : null,
          repeat: "none",
          days: [],
          doneDates: old.done === true ? [date] : [],
          notifiedDates: [],
          snoozeUntil: null,
          createdAt: created,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- Command ----------

export const TASKS_CHANGED_EVENT = "tasks-changed";

export interface TasksChanged {
  source: string;
  data: string;
}

export const tasksIpc = {
  load: () => invoke<string>("tasks_load"),
  save: (data: string) => invoke<void>("tasks_save", { data }),
  openWindow: () => invoke<void>("tasks_open_window"),
};
