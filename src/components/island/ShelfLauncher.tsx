import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

/** Halaman island untuk membuka window Quick Shelf. */
export default function ShelfLauncher() {
  const [error, setError] = useState<string | null>(null);

  function openShelf() {
    setError(null);
    invoke("shelf_open_window").catch((reason) => setError(String(reason)));
  }

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-semibold">Quick Shelf</span>
        <span className="truncate text-[11px] text-white/60">{error ?? "File, catatan, dan snippet sementara"}</span>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openShelf();
        }}
        className="shrink-0 rounded-full bg-[#c8e63c] px-3 py-1.5 text-[11px] font-semibold text-black transition-opacity hover:opacity-90 active:opacity-75"
      >
        Buka
      </button>
    </div>
  );
}
