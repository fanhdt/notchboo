import { useState } from "react";

import { EXPIRY_LABEL, EXPIRY_OPTIONS, describeExpiry, type Expiry, type ShelfItem } from "../../lib/shelf";
import Icon from "./Icon";
import IconButton from "./IconButton";

/** Tombol hapus dua langkah: klik pertama meminta konfirmasi di tempat, tanpa dialog. */
export function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return <IconButton label="Hapus" icon="delete" danger onClick={() => setConfirming(true)} />;
  }

  return (
    <span className="flex items-center gap-1 text-[11px]" onMouseLeave={() => setConfirming(false)}>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
        className="rounded-md bg-red-500/20 px-2 py-1 font-medium text-red-200 hover:bg-red-500/30"
      >
        Hapus?
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-1.5 py-1 text-white/50 hover:text-white">
        Batal
      </button>
    </span>
  );
}

/** Label masa berlaku yang bisa diklik untuk mengubah masa berlaku item. */
export function ExpiryMenu({ item, onChange }: { item: ShelfItem; onChange: (expiry: Expiry) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Ubah masa berlaku"
        className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors hover:bg-white/10 ${item.pinned ? "text-[#c8e63c]" : "text-white/45 hover:text-white/80"}`}
      >
        <Icon name={item.pinned ? "pin" : "clock"} className="h-3 w-3" />
        {describeExpiry(item)}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 top-full z-40 mt-1 w-40 overflow-hidden rounded-lg border border-white/10 bg-[#1c1c20] py-1 shadow-xl">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-white/35">Hapus otomatis setelah</p>
            {EXPIRY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onChange(option);
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/10"
              >
                {EXPIRY_LABEL[option]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-xs rounded-xl border border-white/10 bg-[#1c1c20] p-4 shadow-2xl">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-white/60">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">
            Batal
          </button>
          <button type="button" onClick={onConfirm} className="rounded-md bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
