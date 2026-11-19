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
  toggleDone: (id: string, date: string) => void;
  addCategory: (name: string, color: string) => void;
  removeCategory: (id: string) => void;
  complete: (id: string, date: string) => void;
  snooze: (id: string) => void;
  dismiss: (id: string, date: string) => void;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Menggabungkan perubahan array berbasis tanggal.
 *
 * Perubahan pada tanggal berbeda dari dua window tetap dipertahankan.
 */
function mergeDateArray(base: string[], local: string[], remote: string[]): string[] {
  const baseSet = new Set(base);
  const localSet = new Set(local);
  const remoteSet = new Set(remote);

  const removed = new Set([...base.filter((date) => !localSet.has(date)), ...base.filter((date) => !remoteSet.has(date))]);

  const added = new Set([...local.filter((date) => !baseSet.has(date)), ...remote.filter((date) => !baseSet.has(date))]);

  return [...new Set([...base, ...added])].filter((date) => !removed.has(date) || added.has(date));
}

/**
 * Menggabungkan satu entitas berdasarkan perubahan tiga arah:
 * data awal, perubahan lokal, dan perubahan remote.
 *
 * Jika kedua sisi mengubah field yang sama, perubahan lokal menang.
 */
function mergeEntity<T extends { id: string }>(base: T, local: T, remote: T): T {
  const result: Record<string, unknown> = { ...remote };

  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);

  for (const key of keys) {
    const baseValue = base[key as keyof T];
    const localValue = local[key as keyof T];
    const remoteValue = remote[key as keyof T];

    if ((key === "doneDates" || key === "notifiedDates") && Array.isArray(baseValue) && Array.isArray(localValue) && Array.isArray(remoteValue)) {
      result[key] = mergeDateArray(baseValue as string[], localValue as string[], remoteValue as string[]);
      continue;
    }

    const localChanged = !sameValue(localValue, baseValue);
    const remoteChanged = !sameValue(remoteValue, baseValue);

    if (localChanged) {
      result[key] = localValue;
    } else if (remoteChanged) {
      result[key] = remoteValue;
    }
  }

  return result as T;
}

/** Menggabungkan daftar entitas berdasarkan ID. */
function mergeEntityList<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const baseMap = new Map(base.map((item) => [item.id, item]));
  const localMap = new Map(local.map((item) => [item.id, item]));
  const remoteMap = new Map(remote.map((item) => [item.id, item]));

  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);

  const result: T[] = [];

  for (const id of ids) {
    const baseItem = baseMap.get(id);
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);

    // Entitas baru yang dibuat oleh salah satu window.
    if (!baseItem) {
      const item = localItem ?? remoteItem;

      if (item) {
        result.push(item);
      }

      continue;
    }

    // Kedua sisi menghapus entitas.
    if (!localItem && !remoteItem) {
      continue;
    }

    // Penghapusan lokal diprioritaskan.
    if (!localItem) {
      continue;
    }

    // Jika remote menghapus entitas:
    // pertahankan perubahan lokal jika memang ada.
    if (!remoteItem) {
      if (!sameValue(localItem, baseItem)) {
        result.push(localItem);
      }

      continue;
    }

    result.push(mergeEntity(baseItem, localItem, remoteItem));
  }

  return result;
}

/** Menggabungkan dua TaskStore berdasarkan data awal. */
function mergeStores(base: TaskStore, local: TaskStore, remote: TaskStore): TaskStore {
  const categories = mergeEntityList<Category>(base.categories, local.categories, remote.categories);

  const categoryIds = new Set(categories.map((category) => category.id));

  const tasks = mergeEntityList<Task>(base.tasks, local.tasks, remote.tasks).map((task) => (task.categoryId !== null && !categoryIds.has(task.categoryId) ? { ...task, categoryId: null } : task));

  return {
    ...remote,
    ...local,
    version: remote.version,
    categories,
    tasks,
  };
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
 * Penyimpanan dilakukan oleh Rust dengan optimistic concurrency control.
 */
export function useTaskStore(): TaskStoreApi {
  const [store, setStore] = useState<TaskStore>(emptyStore);
  const [loaded, setLoaded] = useState(false);

  const latest = useRef(store);
  const base = useRef<TaskStore>(emptyStore());
  const revision = useRef("");
  const ready = useRef(false);

  // Antrean penyimpanan per WebView.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const apply = useCallback((next: TaskStore) => {
    latest.current = next;
    setStore(next);
  }, []);

  /**
   * Menyimpan state terbaru.
   *
   * Jika revision sudah berubah, gabungkan data lokal dan remote
   * kemudian coba simpan kembali menggunakan revision terbaru.
   */
  const persistLatest = useCallback(async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const desired = latest.current;
      const serialized = JSON.stringify(desired);

      const result = await tasksIpc.save(serialized, revision.current);

      if (result.saved) {
        revision.current = result.revision;
        base.current = desired;

        // Ada perubahan baru ketika request sebelumnya berlangsung.
        if (!sameValue(latest.current, desired)) {
          continue;
        }

        return;
      }

      if (!result.currentData) {
        throw new Error("Task save conflict occurred without current backend data.");
      }

      const remote = parseStore(result.currentData);

      if (!remote) {
        throw new Error("Backend returned invalid task data.");
      }

      const merged = mergeStores(base.current, desired, remote);

      revision.current = result.revision;
      base.current = remote;

      apply(merged);

      if (sameValue(merged, remote)) {
        return;
      }
    }

    throw new Error("Task save could not settle after repeated conflicts.");
  }, [apply]);

  /** Menambahkan operasi penyimpanan ke antrean. */
  const scheduleSave = useCallback(() => {
    saveQueue.current = saveQueue.current
      .catch(() => {
        // Kegagalan sebelumnya tidak boleh menghentikan antrean.
      })
      .then(() => persistLatest());

    saveQueue.current.catch((error) => {
      console.error("[Tasks] Failed to save task store:", error);
    });
  }, [persistLatest]);

  /** Membaca data terbaru dari backend dan menyelaraskan state lokal. */
  const refreshFromBackend = useCallback(async () => {
    const result = await tasksIpc.load();
    const remote = parseStore(result.data);

    if (!remote) {
      return;
    }

    const merged = mergeStores(base.current, latest.current, remote);

    revision.current = result.revision;
    base.current = remote;

    apply(merged);

    if (!sameValue(merged, remote)) {
      await persistLatest();
    }
  }, [apply, persistLatest]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    let pendingRemote = false;

    const self = getCurrentWindow().label;

    async function initialize() {
      try {
        // Listener dipasang sebelum membaca data awal.
        unlisten = await listen<TasksChanged>(TASKS_CHANGED_EVENT, (event) => {
          if (!active || event.payload.source === self) {
            return;
          }

          if (!ready.current) {
            pendingRemote = true;
            return;
          }

          // Jangan langsung mempercayai payload event.
          // Baca ulang backend agar event yang terlambat tidak
          // membuat state lokal kembali ke revision sebelumnya.
          saveQueue.current = saveQueue.current.catch(() => {}).then(() => refreshFromBackend());

          saveQueue.current.catch((error) => {
            console.error("[Tasks] Failed to synchronize remote data:", error);
          });
        });

        if (!active) {
          unlisten();
          return;
        }

        let result = await tasksIpc.load();

        if (!active) {
          return;
        }

        // Jika ada event selama pemuatan, baca ulang data backend.
        if (pendingRemote) {
          pendingRemote = false;
          result = await tasksIpc.load();
        }

        if (!active) {
          return;
        }

        let initial = result.data ? parseStore(result.data) : null;

        revision.current = result.revision;

        if (initial === null) {
          initial = {
            ...emptyStore(),
            tasks: loadLegacyTasks(),
          };

          base.current = emptyStore();
        } else {
          base.current = initial;
        }

        apply(initial);

        ready.current = true;
        setLoaded(true);

        // Migrasi data lama dari localStorage.
        if (initial.tasks.length > 0 && !result.data) {
          await persistLatest();
        }
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
  }, [apply, persistLatest]);

  const commit = useCallback(
    (change: (previous: TaskStore) => TaskStore) => {
      if (!ready.current) {
        return;
      }

      const next = change(latest.current);

      apply(next);
      scheduleSave();
    },
    [apply, scheduleSave],
  );

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
        notifiedDates: task.notifiedDates.includes(date) ? task.notifiedDates : [...task.notifiedDates, date],
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
        notifiedDates: task.notifiedDates.includes(date) ? task.notifiedDates : [...task.notifiedDates, date],
        snoozeUntil: null,
      })),
  };
}

// ---------- Untuk island ----------

export interface TasksApi {
  categories: Category[];
  today: Occurrence[];
  openCount: number;
  due: Occurrence | null;
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
