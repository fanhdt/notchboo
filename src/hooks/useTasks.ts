import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  REMINDER_SNOOZE_MS,
  TASKS_CHANGED_EVENT,
  emptyStore,
  findDue,
  loadLegacyTasks,
  newId,
  occurrencesOn,
  parseStore,
  tasksIpc,
  todayKey,
  type Category,
  type Occurrence,
  type Repeat,
  type Task,
  type TaskStore,
  type TasksChanged,
} from "../lib/tasks";

/**
 * Antrean penyimpanan bersama dalam satu WebView.
 *
 * Memastikan beberapa pemanggilan save dari hook yang berbeda
 * tidak mengeksekusi penulisan secara bersamaan.
 */
let saveQueue: Promise<void> = Promise.resolve();

function enqueueTaskSave(data: string): Promise<void> {
  const operation = saveQueue
    .catch(() => {
      // Kegagalan sebelumnya tidak boleh menghentikan antrean berikutnya.
    })
    .then(() => tasksIpc.save(data));

  saveQueue = operation;

  return operation;
}

/** Isi yang bisa diubah user saat membuat atau mengedit tugas. */
export interface TaskInput {
  title: string;
  categoryId: string | null;
  date: string;
  time: string | null;
  repeat: Repeat;
  days: number[];
}

export interface TaskStoreApi {
  store: TaskStore;
  loaded: boolean;
  addTask: (input: TaskInput) => void;
  updateTask: (id: string, input: TaskInput) => void;
  removeTask: (id: string) => void;
  /** Membalik status selesai tugas pada satu tanggal. */
  toggleDone: (id: string, date: string) => void;
  addCategory: (name: string, color: string) => void;
  removeCategory: (id: string) => void;
  /** Aksi untuk kartu pengingat. */
  complete: (id: string, date: string) => void;
  snooze: (id: string) => void;
  dismiss: (id: string, date: string) => void;
}

function withDone(task: Task, date: string): Task {
  const done = task.doneDates.includes(date);

  return {
    ...task,
    doneDates: done ? task.doneDates.filter((item) => item !== date) : [...task.doneDates, date],
  };
}

/**
 * Seluruh data tugas, dibagi antara island dan window Tugas.
 * Disimpan oleh Rust; perubahan dari window lain masuk lewat event `tasks-changed`.
 */
export function useTaskStore(): TaskStoreApi {
  const [store, setStore] = useState<TaskStore>(emptyStore);
  const [loaded, setLoaded] = useState(false);

  const latest = useRef(store);
  const ready = useRef(false);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    // Menampung event yang datang ketika inisialisasi belum selesai.
    let pendingRemote: TaskStore | null = null;

    const self = getCurrentWindow().label;

    function apply(next: TaskStore) {
      latest.current = next;
      setStore(next);
    }

    async function initialize() {
      try {
        /**
         * Pasang listener terlebih dahulu.
         * Dengan begitu, perubahan dari window lain tidak terlewat
         * selama proses pemuatan data berlangsung.
         */
        unlisten = await listen<TasksChanged>(TASKS_CHANGED_EVENT, (event) => {
          if (!active || event.payload.source === self) return;

          const next = parseStore(event.payload.data);

          if (!next) return;

          if (!ready.current) {
            pendingRemote = next;
            return;
          }

          apply(next);
        });

        if (!active) {
          unlisten();
          return;
        }

        const text = await tasksIpc.load();

        if (!active) return;

        let initial = text ? parseStore(text) : null;

        /**
         * Jika ada perubahan dari window lain selama inisialisasi,
         * gunakan data event tersebut sebagai kandidat state awal.
         */
        if (pendingRemote !== null) {
          initial = pendingRemote;
        }

        // Pertama kali: migrasikan data lama dari localStorage.
        if (initial === null) {
          initial = {
            ...emptyStore(),
            tasks: loadLegacyTasks(),
          };

          if (initial.tasks.length > 0) {
            await enqueueTaskSave(JSON.stringify(initial));
          }
        }

        if (!active) return;

        apply(initial);
        ready.current = true;
        setLoaded(true);
      } catch (error) {
        if (active) {
          console.error("[Tasks] Failed to initialize task store:", error);
        }
      }
    }

    initialize();

    return () => {
      active = false;
      ready.current = false;
      unlisten?.();
    };
  }, []);

  const commit = useCallback((change: (previous: TaskStore) => TaskStore) => {
    // Jangan menimpa data asli sebelum proses inisialisasi selesai.
    if (!ready.current) return;

    const next = change(latest.current);

    // Perbarui state secara optimistis.
    latest.current = next;
    setStore(next);

    // Penyimpanan dilakukan secara berurutan.
    enqueueTaskSave(JSON.stringify(next)).catch((error) => {
      console.error("[Tasks] Failed to save task store:", error);
    });
  }, []);

  const patch = useCallback(
    (id: string, change: (task: Task) => Task) =>
      commit((previous) => ({
        ...previous,
        tasks: previous.tasks.map((task) => (task.id === id ? change(task) : task)),
      })),
    [commit],
  );

  return {
    store,
    loaded,

    addTask: (input) =>
      commit((previous) => ({
        ...previous,
        tasks: [
          ...previous.tasks,
          {
            ...input,
            title: input.title.trim(),
            id: newId(),
            doneDates: [],
            notifiedDates: [],
            snoozeUntil: null,
            createdAt: Date.now(),
          },
        ],
      })),

    // Mengubah jam atau tanggal membuat pengingat berlaku lagi.
    updateTask: (id, input) =>
      patch(id, (task) => ({
        ...task,
        ...input,
        title: input.title.trim(),
        notifiedDates: [],
        snoozeUntil: null,
      })),

    removeTask: (id) =>
      commit((previous) => ({
        ...previous,
        tasks: previous.tasks.filter((task) => task.id !== id),
      })),

    toggleDone: (id, date) => patch(id, (task) => withDone(task, date)),

    addCategory: (name, color) =>
      commit((previous) => ({
        ...previous,
        categories: [
          ...previous.categories,
          {
            id: newId(),
            name: name.trim(),
            color,
          },
        ],
      })),

    removeCategory: (id) =>
      commit((previous) => ({
        ...previous,
        categories: previous.categories.filter((category) => category.id !== id),
        tasks: previous.tasks.map((task) => (task.categoryId === id ? { ...task, categoryId: null } : task)),
      })),

    complete: (id, date) =>
      patch(id, (task) => ({
        ...task,
        doneDates: task.doneDates.includes(date) ? task.doneDates : [...task.doneDates, date],
        notifiedDates: [...task.notifiedDates, date],
        snoozeUntil: null,
      })),

    snooze: (id) =>
      patch(id, (task) => ({
        ...task,
        snoozeUntil: Date.now() + REMINDER_SNOOZE_MS,
      })),

    dismiss: (id, date) =>
      patch(id, (task) => ({
        ...task,
        notifiedDates: [...task.notifiedDates, date],
        snoozeUntil: null,
      })),
  };
}

// ---------- Untuk island ----------

export interface TasksApi {
  categories: Category[];
  /** Tugas hari ini: yang belum selesai dulu. */
  today: Occurrence[];
  openCount: number;
  /** Tugas yang pengingatnya sedang berbunyi. */
  due: Occurrence | null;
  /** Menambah tugas untuk hari ini (sekali jalan). */
  add: (title: string, time: string | null) => void;
  toggle: (id: string, date: string) => void;
  complete: (occurrence: Occurrence) => void;
  snooze: (occurrence: Occurrence) => void;
  dismiss: (occurrence: Occurrence) => void;
  openWindow: () => void;
}

/** Tugas hari ini dan pengingatnya, untuk halaman Tugas di island. */
export function useTasks(): TasksApi {
  const api = useTaskStore();
  const { tasks, categories } = api.store;

  const [today, setToday] = useState(todayKey);
  const [dueId, setDueId] = useState<string | null>(null);

  // Memeriksa pengingat dan pergantian hari tiap 2 detik.
  useEffect(() => {
    const check = () => {
      const day = todayKey();

      setToday((previous) => (previous === day ? previous : day));

      const id = findDue(tasks, day, Date.now())?.task.id ?? null;

      setDueId((previous) => (previous === id ? previous : id));
    };

    check();

    const timer = setInterval(check, 2000);

    return () => clearInterval(timer);
  }, [tasks]);

  const list = useMemo(() => occurrencesOn(tasks, today, today), [tasks, today]);

  const due = useMemo(() => (dueId === null ? null : (list.find((occurrence) => occurrence.task.id === dueId && !occurrence.overdue) ?? null)), [dueId, list]);

  return {
    categories,
    today: list,
    openCount: list.filter((occurrence) => !occurrence.done).length,
    due,

    add: (title, time) =>
      api.addTask({
        title,
        categoryId: null,
        date: today,
        time,
        repeat: "none",
        days: [],
      }),

    toggle: api.toggleDone,

    complete: (occurrence) => api.complete(occurrence.task.id, occurrence.date),

    snooze: (occurrence) => api.snooze(occurrence.task.id),

    dismiss: (occurrence) => api.dismiss(occurrence.task.id, occurrence.date),

    openWindow: () => {
      tasksIpc.openWindow().catch((error) => {
        console.error("[Tasks] Failed to open tasks window:", error);
      });
    },
  };
}
