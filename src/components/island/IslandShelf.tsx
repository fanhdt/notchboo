import { useEffect, useRef, useState } from "react";

import { useIslandShelf } from "../../hooks/useIslandShelf";
import type { UseShelfImport } from "../../hooks/useShelf";
import { describeExpiry, formatSize, shelf, type ShelfItem } from "../../lib/shelf";
import Icon from "../shelf/Icon";

type Props = {
  /** Island sedang terbuka di halaman ini. */
  active: boolean;
  /** Berubah setiap kali ada file baru masuk, supaya daftar dimuat ulang. */
  version: number;
  /** File sedang diseret di atas island. */
  dragging: boolean;
  importer: UseShelfImport;
};

const KIND_ICON = { file: "file", note: "note", snippet: "code" } as const;

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function rowMeta(item: ShelfItem): string {
  if (item.kind === "file") return formatSize(item.sizeBytes);
  return describeExpiry(item);
}

/** Halaman Quick Shelf di island: item teratas, tombol buka window, dan area lepas file. */
export default function IslandShelf({ active, version, dragging, importer }: Props) {
  const { items, total, loading, error } = useIslandShelf(active, version);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(timer);
  }, [notice]);

  // Pesan hasil impor (gagal / dilewati) hilang sendiri.
  const dismissRef = useRef(importer.dismiss);
  dismissRef.current = importer.dismiss;
  const hasImportMessage = importer.error !== null || importer.skipped.length > 0;
  useEffect(() => {
    if (!hasImportMessage) return;
    const timer = setTimeout(() => dismissRef.current(), 4000);
    return () => clearTimeout(timer);
  }, [hasImportMessage]);

  async function activate(item: ShelfItem) {
    try {
      if (item.kind === "file") {
        const outcome = await shelf.open(item.id);
        if (outcome === "needsConfirmation") {
          await shelf.openWindow();
          setNotice("File berisiko: buka dari Quick Shelf");
        }
      } else if (item.kind === "snippet") {
        const full = await shelf.get(item.id);
        await navigator.clipboard.writeText(full.body ?? "");
        setNotice("Snippet disalin");
      } else {
        await shelf.openWindow();
      }
    } catch (reason) {
      setNotice(messageOf(reason));
    }
  }

  if (dragging) {
    return (
      <div className="flex h-full max-h-30 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[#c8e63c]/70 text-[#c8e63c]">
        <Icon name="upload" className="h-6 w-6" />
        <span className="text-xs font-medium">Lepas untuk menyimpan ke File</span>
      </div>
    );
  }

  if (importer.importing) {
    const { progress } = importer;
    return (
      <div role="status" className="flex w-full flex-col items-center gap-2 text-xs text-white/80">
        <span className="max-w-full truncate">{progress ? `Menyimpan ${progress.fileName}` : "Menyimpan file…"}</span>
        {progress && (
          <>
            <span className="tabular-nums text-white/50">
              {progress.index}/{progress.count}
            </span>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-[#c8e63c] transition-[width] duration-200" style={{ width: `${((progress.index - 1) / progress.count) * 100}%` }} />
            </div>
          </>
        )}
      </div>
    );
  }

  const subtitle = importer.error ?? (importer.skipped.length > 0 ? `${importer.skipped.length} file dilewati: ${importer.skipped[0].reason}` : null) ?? notice ?? error ?? `${total} item`;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[13px] font-semibold leading-tight">Quick Shelf</span>
          <span className="truncate text-[10px] leading-tight text-white/50">{subtitle}</span>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            shelf.openWindow().catch((reason) => setNotice(messageOf(reason)));
          }}
          className="shrink-0 rounded-full bg-[#c8e63c] px-3 py-1 text-[11px] font-semibold text-black transition-opacity hover:opacity-90 active:opacity-75"
        >
          Buka
        </button>
      </div>

      {items.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-white/45">{loading ? "Memuat…" : "Seret file ke sini untuk menyimpannya"}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void activate(item);
                }}
                title={item.kind === "snippet" ? "Salin snippet" : item.kind === "file" ? "Buka file" : "Buka di Quick Shelf"}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-1.5 text-left transition-colors hover:bg-white/10 active:bg-white/15"
              >
                <span className={item.pinned ? "text-[#c8e63c]" : "text-white/50"}>
                  <Icon name={item.pinned ? "pin" : KIND_ICON[item.kind]} className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">{item.fileName ?? item.title}</span>
                <span className="shrink-0 text-[10px] text-white/40">{rowMeta(item)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
