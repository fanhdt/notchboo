import { useEffect, useRef, useState } from "react";
import { clipboard } from "../../lib/clipboard";

/** Halaman island, berurutan seperti di rel ikon (atas ke bawah). */
export const ISLAND_PAGES = ["media", "system", "pomodoro", "water", "tasks", "shelf", "sound"] as const;

export type IslandView = (typeof ISLAND_PAGES)[number];

const NAV: Record<IslandView, { label: string; path: string }> = {
  media: {
    label: "Media",
    path: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3z",
  },
  system: {
    label: "Sistem",
    path: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
  },
  pomodoro: {
    label: "Pomodoro",
    path: "M15 1H9v2h6zm-4 13h2V8h-2zm8.03-6.61 1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.96 8.96 0 0 0 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9a8.994 8.994 0 0 0 7.03-14.61M12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7",
  },
  water: {
    label: "Minum",
    path: "M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8",
  },
  tasks: {
    label: "Tugas",
    path: "M16.59 7.58 10 14.17l-3.59-3.58L5 12l-5 5 8-8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8",
  },
  shelf: {
    label: "Quick Shelf",
    path: "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8z",
  },
  sound: {
    label: "Suara",
    path: "M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77",
  },
};

type Props = {
  current: IslandView;
  onSelect: (view: IslandView) => void;
  onSettings: () => void;
};

function NavIcon({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0 fill-current`} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const CLIPBOARD_ICON = "M16 4h-1.18A3 3 0 0 0 9.18 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM12 3.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM16 20H8V6h1.18a3 3 0 0 0 5.64 0H16v14ZM10 10h4v1.5h-4zm0 4h4v1.5h-4z";

const SETTINGS_ICON =
  "M19.14 12.94a7.5 7.5 0 0 0 .05-1.88l2.03-1.58-2-3.46-2.39.96a7.3 7.3 0 0 0-1.63-.94L14.84 3h-4l-.36 3.04a7.3 7.3 0 0 0-1.63.94l-2.39-.96-2 3.46 2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58 2 3.46 2.39-.96c.5.4 1.04.71 1.63.94L10.84 21h4l.36-3.04c.59-.23 1.13-.54 1.63-.94l2.39.96 2-3.46zM12.84 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7";

export default function IslandNav({ current, onSelect, onSettings }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (view: IslandView) => {
    onSelect(view);
    setIsOpen(false);
  };

  const handleOpenClipboard = () => {
    setIsOpen(false);

    void clipboard.openWindow().catch((error) => {
      console.error("[IslandNav] Gagal membuka Clipboard Manager:", error);
    });
  };

  const handleSettings = () => {
    setIsOpen(false);
    onSettings();
  };

  return (
    <nav ref={menuRef} aria-label="Navigasi island" className="relative inline-flex">
      {/* Single navigation button */}
      <button
        type="button"
        title="Pilih halaman"
        aria-label={`Halaman aktif: ${NAV[current].label}. Pilih halaman lain`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((value) => !value);
        }}
        className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-white/75 transition-colors ${isOpen ? "bg-white/15 text-white" : "hover:bg-white/10 hover:text-white"}`}
      >
        <NavIcon path={NAV[current].path} className="h-3.5 w-3.5" />

        <span className="text-[10px] font-medium">{NAV[current].label}</span>

        <svg viewBox="0 0 24 24" className={`h-3 w-3 fill-none stroke-current transition-transform ${isOpen ? "rotate-180" : ""}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Feature picker */}
      {isOpen && (
        <div
          id="island-navigation-menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#111113]/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-2 pb-2 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Navigasi</span>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {ISLAND_PAGES.map((view) => {
              const active = view === current;

              return (
                <button
                  key={view}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => handleSelect(view)}
                  className={`flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${active ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white active:bg-white/15"}`}
                >
                  <NavIcon path={NAV[view].path} className="h-3.5 w-3.5" />

                  <span className="truncate text-[11px] font-medium">{NAV[view].label}</span>

                  {active && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-white" />}
                </button>
              );
            })}
          </div>

          <div className="my-2 h-px bg-white/10" />

          {/* Utility windows */}
          <button type="button" onClick={handleOpenClipboard} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-white/60 transition-colors hover:bg-white/10 hover:text-white">
            <NavIcon path={CLIPBOARD_ICON} className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">Clipboard Manager</span>
          </button>

          <button type="button" onClick={handleSettings} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-white/60 transition-colors hover:bg-white/10 hover:text-white">
            <NavIcon path={SETTINGS_ICON} className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">Pengaturan</span>
          </button>
        </div>
      )}
    </nav>
  );
}
