// Lapisan IPC Quick Shelf. Nama command, argumen, dan bentuk data mengikuti
// src-tauri/src/shelf/{commands,model}.rs (serde camelCase). Tidak ada logika bisnis di sini.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ---------- Tipe (cermin model.rs) ----------

export type ItemKind = "file" | "note" | "snippet";
export type Expiry = "1d" | "7d" | "never";

export interface ShelfItem {
  id: number;
  kind: ItemKind;
  title: string;
  /** Pada hasil `list` hanya potongan awal (maks. 240 karakter). Pakai `getItem` untuk isi lengkap. */
  body: string | null;
  language: string | null;
  fileName: string | null;
  sourcePath: string | null;
  extension: string | null;
  sizeBytes: number | null;
  pinned: boolean;
  /** Milidetik sejak epoch Unix. */
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
}

export interface ListFilter {
  query?: string | null;
  kind?: ItemKind | null;
  pinnedOnly?: boolean;
}

export interface TextInput {
  title: string;
  body: string;
  language?: string | null;
}

export interface NewText extends TextInput {
  kind: Exclude<ItemKind, "file">;
}

export interface Settings {
  defaultExpiry: Expiry;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface ImportOutcome {
  imported: ShelfItem[];
  skipped: SkippedFile[];
}

export interface ImportProgress {
  /** Dimulai dari 1. */
  index: number;
  count: number;
  fileName: string;
}

export type OpenOutcome = "opened" | "needsConfirmation";

export const IMPORT_PROGRESS_EVENT = "shelf-import-progress";

// ---------- Command ----------

/** Command Rust menolak dengan string; kembalikan sebagai Error supaya mudah ditampilkan. */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (reason) {
    throw new Error(typeof reason === "string" ? reason : reason instanceof Error ? reason.message : "Terjadi kesalahan tak dikenal.");
  }
}

export const shelf = {
  list: (filter: ListFilter = {}) =>
    call<ShelfItem[]>("shelf_list", {
      filter: { query: filter.query ?? null, kind: filter.kind ?? null, pinnedOnly: filter.pinnedOnly ?? false },
    }),
  get: (id: number) => call<ShelfItem>("shelf_get", { id }),
  addText: (input: NewText) =>
    call<ShelfItem>("shelf_add_text", {
      input: { kind: input.kind, title: input.title, body: input.body, language: input.language ?? null },
    }),
  updateText: (id: number, input: TextInput) =>
    call<ShelfItem>("shelf_update_text", {
      id,
      input: { title: input.title, body: input.body, language: input.language ?? null },
    }),
  setPinned: (id: number, pinned: boolean) => call<ShelfItem>("shelf_set_pinned", { id, pinned }),
  setExpiry: (id: number, expiry: Expiry) => call<ShelfItem>("shelf_set_expiry", { id, expiry }),
  remove: (id: number) => call<void>("shelf_delete", { id }),
  importPaths: (paths: string[]) => call<ImportOutcome>("shelf_import_paths", { paths }),
  pickAndImport: () => call<ImportOutcome>("shelf_pick_and_import"),
  open: (id: number, allowRisky = false) => call<OpenOutcome>("shelf_open", { id, allowRisky }),
  reveal: (id: number) => call<void>("shelf_reveal", { id }),
  getSettings: () => call<Settings>("shelf_get_settings"),
  setDefaultExpiry: (expiry: Expiry) => call<void>("shelf_set_default_expiry", { expiry }),
  openWindow: () => call<void>("shelf_open_window"),
};

/** Mendengarkan kemajuan impor. Mengembalikan fungsi untuk berhenti mendengarkan. */
export function onImportProgress(handler: (progress: ImportProgress) => void): Promise<UnlistenFn> {
  return listen<ImportProgress>(IMPORT_PROGRESS_EVENT, (event) => handler(event.payload));
}

// ---------- Format tampilan ----------

export const EXPIRY_LABEL: Record<Expiry, string> = {
  "1d": "1 hari",
  "7d": "7 hari",
  never: "Tanpa batas",
};

export const EXPIRY_OPTIONS: Expiry[] = ["1d", "7d", "never"];

export function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

/** Teks masa berlaku untuk satu item, mis. "Sisa 6 hari" atau "Disematkan". */
export function describeExpiry(item: ShelfItem, now = Date.now()): string {
  if (item.pinned) return "Disematkan";
  if (item.expiresAt === null) return "Tanpa batas waktu";

  const remaining = item.expiresAt - now;
  if (remaining <= 0) return "Segera dihapus";

  const hours = Math.ceil(remaining / 3_600_000);
  if (hours < 24) return `Sisa ${hours} jam`;
  return `Sisa ${Math.ceil(hours / 24)} hari`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
