import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { clipboard, formatClipboardDate, onClipboardUpdated, type ClipboardItem } from "../../lib/clipboard";
import { shelf } from "../../lib/shelf";

const LONG_TEXT_THRESHOLD = 500;

export default function ClipboardPage() {
  const appWindow = getCurrentWindow();

  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [query, setQuery] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [count, setCount] = useState(0);
  const [selectedItem, setSelectedItem] = useState<ClipboardItem | null>(null);

  const loadItems = useCallback(async () => {
    try {
      setError("");

      const [result, total] = await Promise.all([
        clipboard.list({
          query: query.trim() || null,
          pinnedOnly,
          limit: 200,
        }),
        clipboard.getCount(),
      ]);

      setItems(result);
      setCount(total);

      // Sinkronkan detail jika item yang sedang dibuka berubah.
      setSelectedItem((current) => {
        if (!current) return null;
        return result.find((item) => item.id === current.id) ?? null;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat clipboard history.");
    } finally {
      setLoading(false);
    }
  }, [query, pinnedOnly]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void onClipboardUpdated(() => {
      void loadItems();
    })
      .then((stopListening) => {
        if (cancelled) {
          stopListening();
        } else {
          unlisten = stopListening;
        }
      })
      .catch((reason) => {
        console.error("[Clipboard] Gagal memasang event listener:", reason);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [loadItems]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    void clipboard
      .getCapturePaused()
      .then(setPaused)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Gagal membaca status capture.");
      });
  }, []);

  const showFeedback = (message: string) => {
    setFeedback(message);
  };

  const handleCopy = async (item: ClipboardItem) => {
    try {
      await navigator.clipboard.writeText(item.content);
      showFeedback("Teks berhasil disalin.");
    } catch {
      setError("Tidak bisa menyalin teks ke clipboard.");
    }
  };

  const handlePin = async (item: ClipboardItem) => {
    setBusyId(item.id);

    try {
      await clipboard.setPinned(item.id, !item.pinned);
      await loadItems();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal mengubah pin.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setBusyId(id);

    try {
      await clipboard.remove(id);
      await loadItems();
      showFeedback("Item dihapus.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menghapus item.");
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveToShelf = async (item: ClipboardItem) => {
    setBusyId(item.id);

    try {
      const firstLine = item.content
        .split(/\r?\n/)
        .find((line) => line.trim())
        ?.trim();

      const title = (firstLine || "Clipboard").slice(0, 80);

      await shelf.addText({
        kind: "snippet",
        title,
        body: item.content,
      });

      showFeedback("Disimpan ke Quick Shelf.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal menyimpan ke Quick Shelf.");
    } finally {
      setBusyId(null);
    }
  };

  const handlePause = async () => {
    try {
      const next = await clipboard.setCapturePaused(!paused);
      setPaused(next);
      showFeedback(next ? "Capture dijeda." : "Capture dilanjutkan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal mengubah status capture.");
    }
  };

  const handleClear = async () => {
    try {
      await clipboard.clear();
      setConfirmClear(false);
      setSelectedItem(null);
      await loadItems();
      showFeedback("Clipboard history dibersihkan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal membersihkan history.");
    }
  };

  const handleOpenDetail = (item: ClipboardItem) => {
    setSelectedItem(item);
  };

  const handleCloseDetail = () => {
    setSelectedItem(null);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-surface text-white/90" style={{ colorScheme: "dark" }}>
      <header data-tauri-drag-region className="flex h-11 shrink-0 select-none items-center gap-2 border-b border-white/5 pl-4 pr-2">
        <span className="pointer-events-none text-accent text-base">▤</span>

        <h1 className="pointer-events-none flex-1 text-sm font-semibold tracking-tight text-white">Clipboard Manager</h1>

        <button
          type="button"
          title={paused ? "Lanjutkan capture" : "Jeda capture"}
          onClick={() => void handlePause()}
          className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${paused ? "bg-amber-400/10 text-amber-300" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"}`}
        >
          {paused ? "Capture dijeda" : "Capture aktif"}
        </button>

        <button type="button" title="Perkecil" onClick={() => void appWindow.minimize()} className="rounded-md px-2 py-1 text-white/45 hover:bg-white/10 hover:text-white">
          −
        </button>

        <button type="button" title="Tutup" onClick={() => void appWindow.hide()} className="rounded-md px-2 py-1 text-white/45 hover:bg-red-500/20 hover:text-red-300">
          ×
        </button>
      </header>

      <div className="flex items-center gap-2 px-3 pt-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 focus-within:border-accent/50">
          <span className="text-sm text-white/40">⌕</span>

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari clipboard history..."
            aria-label="Cari clipboard history"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
          />

          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Hapus pencarian" className="text-white/40 hover:text-white">
              ×
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setPinnedOnly((value) => !value)}
          aria-pressed={pinnedOnly}
          className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${pinnedOnly ? "border-accent/40 bg-accent/15 text-accent" : "border-white/10 text-white/50 hover:text-white"}`}
        >
          <span>⌖</span>
          Pin
        </button>
      </div>

      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <span className="text-xs text-white/40">
          {count} item tersimpan
          {pinnedOnly ? " · Disematkan" : ""}
        </span>

        {confirmClear ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-300">Hapus semua history?</span>

            <button type="button" onClick={() => void handleClear()} className="text-xs font-medium text-red-300 hover:text-red-200">
              Ya, hapus
            </button>

            <button type="button" onClick={() => setConfirmClear(false)} className="text-xs text-white/50 hover:text-white">
              Batal
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmClear(true)} disabled={count === 0} className="text-xs text-white/40 transition-colors hover:text-red-300 disabled:opacity-30">
            Bersihkan history
          </button>
        )}
      </div>

      {feedback && (
        <div className="mx-3 mb-2 rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent">
          {feedback}

          <button type="button" onClick={() => setFeedback("")} className="float-right">
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="mx-3 mb-2 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">
          {error}

          <button type="button" onClick={() => setError("")} className="float-right">
            ×
          </button>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-white/40">Memuat clipboard history...</div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="text-3xl text-white/20">▤</span>

            <p className="text-sm font-medium text-white/60">{query ? "Tidak ada hasil pencarian" : pinnedOnly ? "Belum ada item yang disematkan" : "Clipboard masih kosong"}</p>

            <p className="max-w-xs text-xs text-white/35">{paused ? "Capture sedang dijeda." : "Teks yang kamu salin akan muncul di sini ketika capture diaktifkan."}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const isLongText = item.content.length > LONG_TEXT_THRESHOLD;

              return (
                <article key={item.id} className="group rounded-xl border border-white/8 bg-white/[0.035] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.055]">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-white/35">
                      {item.sourceApp || "Aplikasi tidak diketahui"}
                      {" · "}
                      {formatClipboardDate(item.createdAt)}
                    </span>

                    {item.pinned && <span className="text-[10px] font-medium text-accent">PINNED</span>}
                  </div>

                  <p className="max-h-36 overflow-hidden whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">{item.content}</p>

                  {isLongText && (
                    <button type="button" onClick={() => handleOpenDetail(item)} className="mt-2 text-xs font-medium text-accent transition-colors hover:text-accent/75">
                      Lihat semua
                      <span className="ml-1 text-[10px] text-white/35">({item.content.length.toLocaleString("id-ID")} karakter)</span>
                    </button>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
                    <button type="button" onClick={() => void handleCopy(item)} className="rounded-md bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/20">
                      Copy
                    </button>

                    <button type="button" disabled={busyId === item.id} onClick={() => void handleSaveToShelf(item)} className="rounded-md px-2.5 py-1.5 text-xs text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-40">
                      Simpan ke Shelf
                    </button>

                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handlePin(item)}
                      className={`rounded-md px-2.5 py-1.5 text-xs disabled:opacity-40 ${item.pinned ? "text-accent hover:bg-accent/10" : "text-white/50 hover:bg-white/10 hover:text-white"}`}
                    >
                      {item.pinned ? "Lepas pin" : "Sematkan"}
                    </button>

                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleDelete(item.id)}
                      className="ml-auto rounded-md px-2.5 py-1.5 text-xs text-white/35 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-40"
                    >
                      Hapus
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-white/5 px-4 text-[10px] text-white/30">
        <span>Mochi Clipboard</span>
        <span>{paused ? "Capture paused" : "Local history"}</span>
      </footer>

      {/* Clipboard detail */}
      {selectedItem && (
        <div className="absolute inset-0 z-20 flex flex-col bg-surface">
          <header data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-2 border-b border-white/5 px-4">
            <button type="button" onClick={handleCloseDetail} className="rounded-md px-2 py-1 text-sm text-white/50 transition-colors hover:bg-white/10 hover:text-white" aria-label="Kembali">
              ←
            </button>

            <div className="pointer-events-none min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-white">Detail Clipboard</h2>
              <p className="text-[10px] text-white/35">{selectedItem.content.length.toLocaleString("id-ID")} karakter</p>
            </div>

            <button type="button" onClick={handleCloseDetail} className="rounded-md px-2 py-1 text-white/45 hover:bg-red-500/20 hover:text-red-300" title="Tutup detail">
              ×
            </button>
          </header>

          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white/70">{selectedItem.sourceApp || "Aplikasi tidak diketahui"}</p>
              <p className="text-[10px] text-white/35">{formatClipboardDate(selectedItem.createdAt)}</p>
            </div>

            <button type="button" onClick={() => void handleCopy(selectedItem)} className="shrink-0 rounded-lg bg-accent/15 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/25">
              Copy teks
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-white/85">{selectedItem.content}</pre>
          </div>

          <footer className="flex h-10 shrink-0 items-center justify-between border-t border-white/5 px-4">
            <span className="text-[10px] text-white/30">Konten lengkap · Tersimpan lokal</span>

            <button type="button" onClick={handleCloseDetail} className="rounded-md px-3 py-1.5 text-xs text-white/55 transition-colors hover:bg-white/10 hover:text-white">
              Tutup
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
