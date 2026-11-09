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
    path: "M16.59 7.58 10 14.17l-3.59-3.58L5 12l5 5 8-8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8",
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
};

/** Baris ikon horizontal untuk pindah halaman island dengan satu klik. */
export default function IslandNav({ current, onSelect }: Props) {
  return (
    <nav aria-label="Halaman island" className="flex flex-row gap-1">
      {ISLAND_PAGES.map((view) => {
        const active = view === current;
        return (
          <button
            key={view}
            type="button"
            title={NAV[view].label}
            aria-label={NAV[view].label}
            aria-current={active ? "page" : undefined}
            onClick={(event) => {
              event.stopPropagation(); // klik di island biasa menutup island
              onSelect(view);
            }}
            className={`flex h-5.5 w-5.5 items-center justify-center rounded-full transition-colors ${active ? "bg-white/20 text-white" : "text-white/45 hover:bg-white/15 hover:text-white active:bg-white/25"}`}
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current">
              <path d={NAV[view].path} />
            </svg>
          </button>
        );
      })}
    </nav>
  );
}
