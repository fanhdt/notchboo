import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import {
  onImportProgress,
  shelf,
  type Expiry,
  type ImportOutcome,
  type ImportProgress,
  type ItemKind,
  type NewText,
  type Settings,
  type ShelfItem,
  type SkippedFile,
  type TextInput,
} from "../lib/shelf";

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// ---------- Daftar item ----------

export interface UseShelfItems {
  items: ShelfItem[];
  loading: boolean;
  /** Gagal memuat daftar. */
  error: string | null;
  /** Gagal menjalankan aksi (hapus, pin, simpan, ...). */
  actionError: string | null;
  dismissActionError: () => void;
  refresh: () => Promise<void>;
  togglePin: (item: ShelfItem) => Promise<void>;
  setExpiry: (item: ShelfItem, expiry: Expiry) => Promise<void>;
  remove: (item: ShelfItem) => Promise<void>;
  /** Membuat item baru (`editing` = null) atau memperbarui item yang ada. Mengembalikan true jika berhasil. */
  saveText: (editing: ShelfItem | null, kind: Exclude<ItemKind, "file">, input: TextInput) => Promise<boolean>;
}

/**
 * Daftar item satu jenis, dengan pencarian lewat command `shelf_list`.
 * `reloadToken` yang berubah memaksa muat ulang (mis. setelah impor file).
 */
export function useShelfItems(kind: ItemKind, query: string, pinnedOnly: boolean, reloadToken = 0): UseShelfItems {
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const debouncedQuery = useDebounced(query, 200);
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const result = await shelf.list({ kind, query: debouncedQuery, pinnedOnly });
      if (request !== latestRequest.current) return; // ada permintaan yang lebih baru
      setItems(result);
      setError(null);
    } catch (reason) {
      if (request === latestRequest.current) setError(messageOf(reason));
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [kind, debouncedQuery, pinnedOnly]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh, reloadToken]);

  // Window Shelf disembunyikan, bukan ditutup: muat ulang saat kembali difokuskan
  // supaya perubahan dan item kedaluwarsa tercermin.
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const act = useCallback(
    async (work: () => Promise<unknown>): Promise<boolean> => {
      try {
        await work();
        setActionError(null);
        await refresh();
        return true;
      } catch (reason) {
        setActionError(messageOf(reason));
        return false;
      }
    },
    [refresh],
  );

  return {
    items,
    loading,
    error,
    actionError,
    dismissActionError: () => setActionError(null),
    refresh,
    togglePin: async (item) => void (await act(() => shelf.setPinned(item.id, !item.pinned))),
    setExpiry: async (item, expiry) => void (await act(() => shelf.setExpiry(item.id, expiry))),
    remove: async (item) => void (await act(() => shelf.remove(item.id))),
    saveText: (editing, textKind, input) =>
      act(() => {
        if (editing) return shelf.updateText(editing.id, input);
        const created: NewText = { kind: textKind, ...input };
        return shelf.addText(created);
      }),
  };
}

// ---------- Aksi pada satu item ----------

export interface UseItemActions {
  /** Pesan sesaat setelah aksi berhasil (mis. "Disalin"). */
  notice: string | null;
  error: string | null;
  /** File berisiko yang menunggu persetujuan pengguna. */
  pendingRisky: ShelfItem | null;
  openFile: (item: ShelfItem) => Promise<void>;
  confirmRisky: () => Promise<void>;
  cancelRisky: () => void;
  reveal: (item: ShelfItem) => Promise<void>;
  /** Isi lengkap lewat `shelf_get`, karena daftar hanya membawa potongan awal. */
  copyBody: (item: ShelfItem) => Promise<void>;
  loadFull: (item: ShelfItem) => Promise<ShelfItem | null>;
  clearFeedback: () => void;
}

export function useItemActions(): UseItemActions {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRisky, setPendingRisky] = useState<ShelfItem | null>(null);

  // Pesan sukses hilang sendiri.
  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), 1800);
    return () => clearTimeout(timer);
  }, [notice]);

  const guard = useCallback(async (work: () => Promise<void>) => {
    try {
      setError(null);
      await work();
    } catch (reason) {
      setError(messageOf(reason));
    }
  }, []);

  return {
    notice,
    error,
    pendingRisky,
    openFile: (item) =>
      guard(async () => {
        const outcome = await shelf.open(item.id);
        if (outcome === "needsConfirmation") setPendingRisky(item);
      }),
    confirmRisky: async () => {
      const item = pendingRisky;
      setPendingRisky(null);
      if (item) await guard(async () => void (await shelf.open(item.id, true)));
    },
    cancelRisky: () => setPendingRisky(null),
    reveal: (item) => guard(() => shelf.reveal(item.id)),
    copyBody: (item) =>
      guard(async () => {
        const full = await shelf.get(item.id);
        await navigator.clipboard.writeText(full.body ?? "");
        setNotice("Disalin ke clipboard");
      }),
    loadFull: async (item) => {
      try {
        setError(null);
        return await shelf.get(item.id);
      } catch (reason) {
        setError(messageOf(reason));
        return null;
      }
    },
    clearFeedback: () => {
      setError(null);
      setNotice(null);
    },
  };
}

// ---------- Impor file ----------

export interface UseShelfImport {
  importing: boolean;
  progress: ImportProgress | null;
  skipped: SkippedFile[];
  error: string | null;
  dismiss: () => void;
  pick: () => Promise<void>;
  importPaths: (paths: string[]) => Promise<void>;
}

/** Impor file lewat dialog atau drag and drop. `onImported` dipanggil jika ada file yang berhasil masuk. */
export function useShelfImport(onImported: () => void): UseShelfImport {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onImportedRef = useRef(onImported);
  onImportedRef.current = onImported;

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    onImportProgress(setProgress)
      .then((unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      })
      .catch(console.error);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const run = useCallback(async (work: () => Promise<ImportOutcome>) => {
    setImporting(true);
    setError(null);
    setSkipped([]);
    try {
      const outcome = await work();
      setSkipped(outcome.skipped);
      if (outcome.imported.length > 0) onImportedRef.current();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }, []);

  return {
    importing,
    progress,
    skipped,
    error,
    dismiss: () => {
      setError(null);
      setSkipped([]);
    },
    pick: () => run(() => shelf.pickAndImport()),
    importPaths: (paths) => run(() => shelf.importPaths(paths)),
  };
}

/** Mendeteksi file yang diseret ke window. Mengembalikan true selama file berada di atas window. */
export function useFileDrop(onDrop: (paths: string[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setDragging(true);
        } else if (payload.type === "leave") {
          setDragging(false);
        } else if (payload.type === "drop") {
          setDragging(false);
          if (payload.paths.length > 0) onDropRef.current(payload.paths);
        }
      })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return dragging;
}

// ---------- Pengaturan ----------

export interface UseShelfSettings {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  saved: boolean;
  setDefaultExpiry: (expiry: Expiry) => Promise<void>;
}

export function useShelfSettings(): UseShelfSettings {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    shelf
      .getSettings()
      .then((value) => active && setSettings(value))
      .catch((reason) => active && setError(messageOf(reason)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [saved]);

  return {
    settings,
    loading,
    error,
    saved,
    setDefaultExpiry: async (expiry) => {
      try {
        setError(null);
        await shelf.setDefaultExpiry(expiry);
        setSettings({ defaultExpiry: expiry });
        setSaved(true);
      } catch (reason) {
        setError(messageOf(reason));
      }
    },
  };
}
