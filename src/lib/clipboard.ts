import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface ClipboardItem {
  id: number;
  content: string;
  pinned: boolean;
  sourceApp: string | null;
  createdAt: number;
}

export interface ClipboardFilter {
  query?: string | null;
  pinnedOnly?: boolean;
  limit?: number;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (reason) {
    throw new Error(typeof reason === "string" ? reason : reason instanceof Error ? reason.message : "Terjadi kesalahan tak dikenal.");
  }
}

export const clipboard = {
  list: (filter: ClipboardFilter = {}) =>
    call<ClipboardItem[]>("clipboard_list", {
      filter: {
        query: filter.query ?? null,
        pinnedOnly: filter.pinnedOnly ?? false,
        limit: filter.limit ?? 200,
      },
    }),

  get: (id: number) => call<ClipboardItem>("clipboard_get", { id }),

  setPinned: (id: number, pinned: boolean) => call<ClipboardItem>("clipboard_set_pinned", { id, pinned }),

  remove: (id: number) => call<void>("clipboard_delete", { id }),

  clear: () => call<void>("clipboard_clear"),

  getCount: () => call<number>("clipboard_get_count"),

  setCapturePaused: (paused: boolean) => call<boolean>("clipboard_set_capture_paused", { paused }),

  getCapturePaused: () => call<boolean>("clipboard_get_capture_paused"),

  openWindow: () => call<void>("clipboard_open_window"),
};

export function formatClipboardDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function onClipboardUpdated(handler: () => void): Promise<UnlistenFn> {
  return listen("clipboard-updated", () => handler());
}
