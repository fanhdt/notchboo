import { getCurrentWindow } from "@tauri-apps/api/window";

import { addDays, DAY_SHORT, fromKey, openCountOn, WEEK_ORDER, weekStart, type Category, type Task } from "../../lib/tasks";
import Icon from "../shelf/Icon";
import IconButton from "../shelf/IconButton";

/** Bilah judul buatan sendiri (window tanpa dekorasi): area seret, kategori, minimize, dan tutup (menyembunyikan window). */
export function TasksTitleBar({ categoriesOpen, onToggleCategories }: { categoriesOpen: boolean; onToggleCategories: () => void }) {
  const appWindow = getCurrentWindow();

  return (
    <header data-tauri-drag-region className="flex h-11 shrink-0 select-none items-center gap-2 border-b border-white/5 pl-4 pr-2">
      <span className="pointer-events-none text-[#c8e63c]">
        <Icon name="check" className="h-4 w-4" />
      </span>
      <h1 className="pointer-events-none flex-1 text-sm font-semibold tracking-tight text-white">Tugas</h1>

      <IconButton label={categoriesOpen ? "Kembali" : "Kelola kategori"} icon="tag" active={categoriesOpen} onClick={onToggleCategories} />
      <IconButton label="Perkecil" icon="minimize" onClick={() => void appWindow.minimize()} />
      <IconButton label="Tutup" icon="close" danger onClick={() => void appWindow.hide()} />
    </header>
  );
}

type WeekProps = {
  selected: string;
  today: string;
  tasks: Task[];
  onSelect: (key: string) => void;
};

/** Satu minggu (Senin sampai Minggu) dengan jumlah tugas yang tersisa per hari. */
export function WeekStrip({ selected, today, tasks, onSelect }: WeekProps) {
  const start = weekStart(selected);
  const days = WEEK_ORDER.map((_, index) => addDays(start, index));
  const currentWeek = weekStart(today) === start;

  return (
    <div className="px-3 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-white/50">
          {fromKey(days[0]).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – {fromKey(days[6]).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <div className="flex items-center gap-1">
          {!currentWeek && (
            <button type="button" onClick={() => onSelect(today)} className="rounded-md px-2 py-1 text-[11px] text-[#c8e63c] transition-colors hover:bg-white/5">
              Hari ini
            </button>
          )}
          <IconButton label="Minggu sebelumnya" icon="chevronLeft" onClick={() => onSelect(addDays(selected, -7))} />
          <IconButton label="Minggu berikutnya" icon="chevronRight" onClick={() => onSelect(addDays(selected, 7))} />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((key) => {
          const date = fromKey(key);
          const active = key === selected;
          const isToday = key === today;
          const open = openCountOn(tasks, key, today);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-current={active ? "date" : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition-colors ${active ? "bg-white/12 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
            >
              <span className="text-[10px] uppercase tracking-wide">{DAY_SHORT[date.getDay()]}</span>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-[#c8e63c] text-black" : ""}`}>{date.getDate()}</span>
              <span className={`h-1 w-1 rounded-full ${open > 0 ? "bg-white/60" : "bg-transparent"}`} aria-hidden="true" />
              {open > 0 && <span className="sr-only">{open} tugas tersisa</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type FilterProps = {
  categories: Category[];
  value: string | null;
  onChange: (id: string | null) => void;
};

/** Penyaring tugas per kategori. */
export function CategoryFilter({ categories, value, onChange }: FilterProps) {
  const chip = (active: boolean) => `flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${active ? "border-white/25 bg-white/10 text-white" : "border-white/10 text-white/50 hover:text-white"}`;

  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 pt-3" aria-label="Kategori">
      <button type="button" onClick={() => onChange(null)} aria-pressed={value === null} className={chip(value === null)}>
        Semua
      </button>
      {categories.map((category) => (
        <button key={category.id} type="button" onClick={() => onChange(category.id)} aria-pressed={value === category.id} className={chip(value === category.id)}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
          {category.name}
        </button>
      ))}
    </div>
  );
}
