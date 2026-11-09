import { useState, type FormEvent } from "react";

import type { TaskInput } from "../../hooks/useTasks";
import { dayOfWeek, DAY_SHORT, WEEK_ORDER, type Category, type Repeat } from "../../lib/tasks";

type Props = {
  initial: TaskInput;
  categories: Category[];
  /** Judul tombol simpan. */
  submitLabel: string;
  onSubmit: (input: TaskInput) => void;
  onCancel: () => void;
};

const REPEAT_OPTIONS: { id: Repeat; label: string }[] = [
  { id: "none", label: "Sekali" },
  { id: "daily", label: "Harian" },
  { id: "weekly", label: "Mingguan" },
];

const FIELD = "h-9 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-white placeholder:text-white/35 focus:border-[#c8e63c]/50 focus:outline-none";

/** Form tugas untuk membuat dan mengubah: judul, kategori, tanggal, jam pengingat, dan pengulangan. */
export default function TaskForm({ initial, categories, submitLabel, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time ?? "");
  const [repeat, setRepeat] = useState<Repeat>(initial.repeat);
  const [days, setDays] = useState<number[]>(initial.days);

  function toggleDay(day: number) {
    setDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !date) return;

    // Mingguan tanpa hari dipilih: pakai hari dari tanggal mulai.
    const weeklyDays = repeat === "weekly" ? (days.length > 0 ? days : [dayOfWeek(date)]) : [];

    onSubmit({ title: trimmed, categoryId, date, time: time || null, repeat, days: weeklyDays });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/4 p-3" style={{ colorScheme: "dark" }}>
      <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Apa yang harus dilakukan?" maxLength={160} aria-label="Judul tugas" className={FIELD} />

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-white/50">
          {repeat === "none" ? "Tanggal" : "Mulai tanggal"}
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-white/50">
          Jam pengingat (opsional)
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className={FIELD} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-[11px] text-white/50">
        Kategori
        <select value={categoryId ?? ""} onChange={(event) => setCategoryId(event.target.value || null)} className={FIELD}>
          <option value="">Tanpa kategori</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-white/50">Pengulangan</span>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {REPEAT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setRepeat(option.id)}
              aria-pressed={repeat === option.id}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${repeat === option.id ? "bg-white/12 text-white" : "text-white/50 hover:text-white"}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {repeat === "weekly" && (
          <div className="flex justify-between gap-1" role="group" aria-label="Hari">
            {WEEK_ORDER.map((day) => {
              const active = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={active}
                  className={`h-8 flex-1 rounded-md text-[11px] font-medium transition-colors ${active ? "bg-[#c8e63c] text-black" : "bg-white/5 text-white/55 hover:text-white"}`}
                >
                  {DAY_SHORT[day]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs text-white/60 transition-colors hover:text-white">
          Batal
        </button>
        <button type="submit" disabled={title.trim() === "" || !date} className="rounded-lg bg-[#c8e63c] px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-30">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
