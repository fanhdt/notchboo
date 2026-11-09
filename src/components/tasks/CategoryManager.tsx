import { useState, type FormEvent } from "react";

import { CATEGORY_COLORS, type Category, type Task } from "../../lib/tasks";
import { DeleteButton } from "../shelf/ItemControls";

type Props = {
  categories: Category[];
  tasks: Task[];
  onAdd: (name: string, color: string) => void;
  onRemove: (id: string) => void;
};

/** Menambah dan menghapus kategori. Menghapus kategori tidak menghapus tugasnya, hanya melepas labelnya. */
export default function CategoryManager({ categories, tasks, onAdd, onRemove }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[0]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    onAdd(trimmed, color);
    setName("");
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <ul className="flex flex-col gap-1.5">
        {categories.length === 0 && <li className="py-6 text-center text-sm text-white/45">Belum ada kategori</li>}
        {categories.map((category) => {
          const count = tasks.filter((task) => task.categoryId === category.id).length;
          return (
            <li key={category.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/3 px-3 py-2.5">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
              <span className="min-w-0 flex-1 truncate text-sm text-white">{category.name}</span>
              <span className="shrink-0 text-[11px] text-white/40">{count} tugas</span>
              <DeleteButton onConfirm={() => onRemove(category.id)} />
            </li>
          );
        })}
      </ul>

      <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/4 p-3">
        <span className="text-xs font-medium text-white/70">Kategori baru</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Mis. Kuliah, Olahraga"
          maxLength={30}
          aria-label="Nama kategori"
          className="h-9 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-white placeholder:text-white/35 focus:border-[#c8e63c]/50 focus:outline-none"
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5" role="radiogroup" aria-label="Warna">
            {CATEGORY_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={color === item}
                aria-label={item}
                onClick={() => setColor(item)}
                className={`h-6 w-6 rounded-full transition-transform ${color === item ? "scale-110 ring-2 ring-white/80 ring-offset-2 ring-offset-[#111113]" : "hover:scale-110"}`}
                style={{ backgroundColor: item }}
              />
            ))}
          </div>

          <button type="submit" disabled={name.trim() === ""} className="rounded-lg bg-[#c8e63c] px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-30">
            Tambah
          </button>
        </div>
      </form>
    </div>
  );
}
