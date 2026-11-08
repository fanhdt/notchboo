import { formatDate, type Expiry, type ShelfItem } from "../../lib/shelf";
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

export default function TextCard({ item, onEdit, onTogglePin, onSetExpiry, onDelete, onCopy }: Props) {
  const isSnippet = item.kind === "snippet";
  const preview = item.body?.trim() ?? "";

  return (
    <li className="rounded-xl border border-white/5 bg-white/3 p-3 transition-colors hover:border-white/10 hover:bg-white/5">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-white hover:text-[#c8e63c]" title="Buka untuk mengedit">
          {item.title}
        </button>
        {item.language && <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/60">{item.language}</span>}
      </div>

      {preview && (
        <p className={`mt-1.5 line-clamp-3 whitespace-pre-wrap wrap-break-word text-xs leading-relaxed text-white/55 ${isSnippet ? "font-mono" : ""}`}>{preview}</p>
      )}

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
