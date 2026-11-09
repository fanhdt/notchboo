import { useEffect, useState } from "react";

import { formatDate, shelf, type Expiry, type ShelfItem } from "../../lib/shelf";
import IconButton from "./IconButton";
import { DeleteButton, ExpiryMenu } from "./ItemControls";

type Props = {
  item: ShelfItem;
  onEdit: () => void;
  onTogglePin: () => void;
  onSetExpiry: (expiry: Expiry) => void;
  onDelete: () => void;
  /** Hanya diberikan untuk snippet. */
  onCopy?: () => void;
};

/** Daftar hanya membawa 240 karakter pertama (LIST_PREVIEW_CHARS di Rust); lebih dari itu berarti mungkin terpotong. */
const LIST_PREVIEW_CHARS = 240;
const PREVIEW_LINES = 3;

export default function TextCard({ item, onEdit, onTogglePin, onSetExpiry, onDelete, onCopy }: Props) {
  const isSnippet = item.kind === "snippet";
  const preview = item.body?.trim() ?? "";

  const [expanded, setExpanded] = useState(false);
  const [fullBody, setFullBody] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Isi lengkap yang sudah dimuat tidak berlaku lagi setelah catatan diedit.
  useEffect(() => {
    setFullBody(null);
  }, [item.updatedAt]);

  const mayBeCut = preview.length >= LIST_PREVIEW_CHARS || preview.split("\n").length > PREVIEW_LINES;

  async function toggleExpanded() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (fullBody !== null) return;

    try {
      const full = await shelf.get(item.id);
      setFullBody((full.body ?? "").trim());
      setLoadError(null);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const shown = expanded && fullBody !== null ? fullBody : preview;

  return (
    <li className="rounded-xl border border-white/5 bg-white/3 p-3 transition-colors hover:border-white/10 hover:bg-white/5">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-white hover:text-[#c8e63c]" title="Buka untuk mengedit">
          {item.title}
        </button>
        {item.language && <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/60">{item.language}</span>}
      </div>

      {preview &&
        (mayBeCut ? (
          <button type="button" onClick={() => void toggleExpanded()} aria-expanded={expanded} title={expanded ? "Ciutkan" : "Tampilkan semua"} className="mt-1.5 block w-full text-left">
            <span className={`block whitespace-pre-wrap wrap-break-word text-xs leading-relaxed text-white/55 ${expanded ? "" : "line-clamp-3"} ${isSnippet ? "font-mono" : ""}`}>{shown}</span>
            <span className="mt-1 block text-[11px] text-[#c8e63c]/80">{loadError ?? (expanded ? "Ciutkan" : "Tampilkan semua")}</span>
          </button>
        ) : (
          <p className={`mt-1.5 whitespace-pre-wrap wrap-break-word text-xs leading-relaxed text-white/55 ${isSnippet ? "font-mono" : ""}`}>{preview}</p>
        ))}

      <p className="mt-2 text-[11px] text-white/35">Diperbarui {formatDate(item.updatedAt)}</p>

      <div className="mt-1 flex items-center justify-between gap-2">
        <ExpiryMenu item={item} onChange={onSetExpiry} />
        <div className="flex items-center">
          {onCopy && <IconButton label="Salin ke clipboard" icon="copy" onClick={onCopy} />}
          <IconButton label="Edit" icon="edit" onClick={onEdit} />
          <IconButton label={item.pinned ? "Lepas pin" : "Sematkan"} icon="pin" active={item.pinned} onClick={onTogglePin} />
          <DeleteButton onConfirm={onDelete} />
        </div>
      </div>
    </li>
  );
}
