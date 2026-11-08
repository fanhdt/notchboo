import { formatDate, formatSize, type Expiry, type ShelfItem } from "../../lib/shelf";
import Icon from "./Icon";
import IconButton from "./IconButton";
import { DeleteButton, ExpiryMenu } from "./ItemControls";

type Props = {
  item: ShelfItem;
  onOpen: () => void;
  onReveal: () => void;
  onTogglePin: () => void;
  onSetExpiry: (expiry: Expiry) => void;
  onDelete: () => void;
};

export default function FileRow({ item, onOpen, onReveal, onTogglePin, onSetExpiry, onDelete }: Props) {
  const name = item.fileName ?? item.title;
  const meta = [item.extension ? item.extension.replace(/^\./, "").toUpperCase() : null, formatSize(item.sizeBytes) || null, formatDate(item.createdAt)].filter(Boolean);

  return (
    <li className="group rounded-xl border border-white/5 bg-white/3 p-3 transition-colors hover:border-white/10 hover:bg-white/5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/50">
          <Icon name="file" className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpen} title={item.sourcePath ? `Asal: ${item.sourcePath}` : name} className="block w-full truncate text-left text-sm font-medium text-white hover:text-[#c8e63c]">
            {name}
          </button>
          <p className="mt-0.5 truncate text-[11px] text-white/45">{meta.join(" · ")}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <ExpiryMenu item={item} onChange={onSetExpiry} />
        <div className="flex items-center">
          <IconButton label="Buka file" icon="open" onClick={onOpen} />
          <IconButton label="Tampilkan di File Explorer" icon="folder" onClick={onReveal} />
          <IconButton label={item.pinned ? "Lepas pin" : "Sematkan"} icon="pin" active={item.pinned} onClick={onTogglePin} />
          <DeleteButton onConfirm={onDelete} />
        </div>
      </div>
    </li>
  );
}
