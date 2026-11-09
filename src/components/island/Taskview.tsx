import { useState, type FormEvent, type MouseEvent } from "react";

import type { TasksApi } from "../../hooks/useTasks";
import { formatShortDate } from "../../lib/tasks";

/** Jumlah tugas yang ditampilkan sekaligus di island. */
const MAX_VISIBLE = 3;

const CHECK_PATH = "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";

/** Klik di island biasa menutup island; tombol di halaman ini tidak boleh ikut memicunya. */
function press(action: () => void) {
  return (event: MouseEvent) => {
    event.stopPropagation();
    action();
  };
}

/** Tugas hari ini di island. Pengelolaan lengkap (minggu, kategori, pengulangan) ada di window Tugas. */
export default function TasksView({ api }: { api: TasksApi }) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");

  const { today, openCount, due, categories } = api;

  if (due) {
    return (
      <div role="alert" className="flex w-full flex-col items-center gap-2" onClick={(event) => event.stopPropagation()}>
        <span className="text-[11px] font-medium text-amber-300">Pengingat tugas</span>
        <span className="max-w-full truncate text-sm font-semibold">{due.task.title}</span>
        <div className="flex gap-2">
          <button type="button" onClick={press(() => api.complete(due))} className="rounded-full bg-amber-300 px-3.5 py-1.5 text-[11px] font-semibold text-black transition-opacity hover:opacity-90 active:opacity-75">
            Selesai
          </button>
          <button type="button" onClick={press(() => api.snooze(due))} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-white/80 transition-colors hover:bg-white/20">
            Tunda 10 mnt
          </button>
          <button type="button" onClick={press(() => api.dismiss(due))} className="rounded-full px-2 py-1.5 text-[11px] text-white/50 transition-colors hover:text-white">
            Tutup
          </button>
        </div>
      </div>
    );
  }

  const visible = today.slice(0, MAX_VISIBLE);
  const hidden = today.length - visible.length;

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    api.add(trimmed, time || null);
    setTitle("");
    setTime("");
  }

  return (
    <div className="flex h-full w-full flex-col gap-1.5 py-1" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/80">Hari ini</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/45">{openCount} tersisa</span>
          <button type="button" onClick={press(api.openWindow)} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/80 transition-colors hover:bg-white/20">
            Kelola
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-white/45">Tidak ada tugas hari ini</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {visible.map(({ task, date, done, overdue }) => {
            const category = categories.find((item) => item.id === task.categoryId);

            return (
              <li key={`${task.id}-${date}`} className="flex h-6 items-center gap-2 rounded-md px-1 hover:bg-white/5">
                <button
                  type="button"
                  onClick={press(() => api.toggle(task.id, date))}
                  aria-label={done ? "Tandai belum selesai" : "Tandai selesai"}
                  aria-pressed={done}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${done ? "border-amber-300 bg-amber-300 text-black" : "border-white/40 hover:border-white"}`}
                >
                  {done && (
                    <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
                      <path d={CHECK_PATH} />
                    </svg>
                  )}
                </button>

                {category && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} title={category.name} />}

                <span className={`min-w-0 flex-1 truncate text-xs ${done ? "text-white/35 line-through" : "text-white/90"}`}>{task.title}</span>

                {overdue && <span className="shrink-0 text-[10px] text-red-300/80">{formatShortDate(date)}</span>}
                {task.time && <span className={`shrink-0 text-[10px] tabular-nums ${done ? "text-white/30" : "text-amber-300/80"}`}>{task.time}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {hidden > 0 && <p className="text-center text-[10px] text-white/40">+{hidden} tugas lagi</p>}

      <form onSubmit={submit} className="mt-auto flex items-center gap-1.5">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Tambah tugas hari ini…"
          maxLength={120}
          aria-label="Tugas baru"
          className="h-7 min-w-0 flex-1 rounded-md bg-white/10 px-2 text-xs text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-amber-300/60"
        />
        <input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          aria-label="Jam pengingat (opsional)"
          title="Pengingat (opsional)"
          style={{ colorScheme: "dark" }}
          className="h-7 w-21 rounded-md bg-white/10 px-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-amber-300/60"
        />
        <button
          type="submit"
          aria-label="Tambah tugas"
          disabled={title.trim() === ""}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-300 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          +
        </button>
      </form>
    </div>
  );
}
