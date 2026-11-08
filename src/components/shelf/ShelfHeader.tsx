import { getCurrentWindow } from "@tauri-apps/api/window";

import type { ItemKind } from "../../lib/shelf";
import Icon, { type IconName } from "./Icon";
import IconButton from "./IconButton";

export type ShelfView = ItemKind | "settings";

const TABS: { view: ItemKind; label: string; icon: IconName }[] = [
  { view: "file", label: "File", icon: "folder" },
  { view: "note", label: "Catatan", icon: "note" },
  { view: "snippet", label: "Snippet", icon: "code" },
];

/** Bilah judul buatan sendiri (window tanpa dekorasi): area seret, minimize, dan tutup (menyembunyikan window). */
export function TitleBar({ settingsOpen, onToggleSettings }: { settingsOpen: boolean; onToggleSettings: () => void }) {
  const appWindow = getCurrentWindow();

  return (
    <header data-tauri-drag-region className="flex h-11 shrink-0 select-none items-center gap-2 border-b border-white/5 pl-4 pr-2">
      <span className="pointer-events-none text-[#c8e63c]">
        <Icon name="folder" className="h-4 w-4" />
      </span>
      <h1 className="pointer-events-none flex-1 text-sm font-semibold tracking-tight text-white">Quick Shelf</h1>

      <IconButton label={settingsOpen ? "Kembali" : "Pengaturan"} icon="settings" active={settingsOpen} onClick={onToggleSettings} />
      <IconButton label="Perkecil" icon="minimize" onClick={() => void appWindow.minimize()} />
      <IconButton label="Tutup" icon="close" danger onClick={() => void appWindow.hide()} />
    </header>
  );
}

export function SearchBar({
  value,
  onChange,
  pinnedOnly,
  onTogglePinned,
}: {
  value: string;
  onChange: (value: string) => void;
  pinnedOnly: boolean;
  onTogglePinned: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 pt-3">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 focus-within:border-[#c8e63c]/50">
        <Icon name="search" className="h-4 w-4 text-white/40" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Cari judul, isi, atau nama file"
          aria-label="Cari di Quick Shelf"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
        />
        {value && (
          <button type="button" onClick={() => onChange("")} aria-label="Hapus pencarian" className="text-white/40 hover:text-white">
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      <button
        type="button"
        onClick={onTogglePinned}
        aria-pressed={pinnedOnly}
        title="Hanya yang disematkan"
        className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
          pinnedOnly ? "border-[#c8e63c]/40 bg-[#c8e63c]/15 text-[#c8e63c]" : "border-white/10 text-white/50 hover:text-white"
        }`}
      >
        <Icon name="pin" className="h-3.5 w-3.5" />
        Pin
      </button>
    </div>
  );
}

export function CategoryTabs({ view, onChange }: { view: ShelfView; onChange: (view: ItemKind) => void }) {
  return (
    <nav className="flex gap-1 px-3 pt-3" aria-label="Kategori">
      {TABS.map((tab) => {
        const active = view === tab.view;
        return (
          <button
            key={tab.view}
            type="button"
            onClick={() => onChange(tab.view)}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
              active ? "bg-white/10 text-white" : "text-white/45 hover:bg-white/5 hover:text-white/80"
            }`}
          >
            <Icon name={tab.icon} className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
