import { useEffect, useMemo, useRef, useState } from "react";

import CategoryManager from "../../components/tasks/CategoryManager";
import { CategoryFilter, TasksTitleBar, WeekStrip } from "../../components/tasks/TasksHeader";
import TaskForm from "../../components/tasks/TaskForm";
import TaskRow from "../../components/tasks/TaskRow";
import Icon from "../../components/shelf/Icon";
import { useTaskStore, type TaskInput } from "../../hooks/useTasks";
import { formatLongDate, occurrencesOn, todayKey } from "../../lib/tasks";

/** `null` = tidak ada form, "new" = tugas baru, selain itu id tugas yang diubah. */
type Editing = null | "new" | string;

/** Window `tasks`: tugas per hari dalam seminggu, dengan kategori dan pengulangan. */
export default function TasksPage() {
  const api = useTaskStore();
  const { tasks, categories } = api.store;

  const [today, setToday] = useState(todayKey);
  const [selected, setSelected] = useState(todayKey);
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  // Window ini bisa terbuka berhari-hari: perbarui "hari ini" saat tanggal berganti.
  const todayRef = useRef(today);
  todayRef.current = today;

  useEffect(() => {
    const timer = setInterval(() => {
      const day = todayKey();
      const previous = todayRef.current;
      if (day === previous) return;

      setToday(day);
      setSelected((current) => (current === previous ? day : current));
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  // Kategori yang dihapus tidak boleh tetap menjadi filter.
  useEffect(() => {
    if (filter !== null && !categories.some((category) => category.id === filter)) setFilter(null);
  }, [categories, filter]);

  const dayList = useMemo(() => occurrencesOn(tasks, selected, today), [tasks, selected, today]);
  const visible = filter === null ? dayList : dayList.filter((occurrence) => occurrence.task.categoryId === filter);
  const openCount = visible.filter((occurrence) => !occurrence.done).length;

  const editingTask = editing !== null && editing !== "new" ? tasks.find((task) => task.id === editing) : undefined;

  const blank: TaskInput = { title: "", categoryId: filter, date: selected, time: null, repeat: "none", days: [] };
  const initial: TaskInput = editingTask ? { title: editingTask.title, categoryId: editingTask.categoryId, date: editingTask.date, time: editingTask.time, repeat: editingTask.repeat, days: editingTask.days } : blank;

  function save(input: TaskInput) {
    if (editingTask) api.updateTask(editingTask.id, input);
    else api.addTask(input);
    setEditing(null);
  }

  return (
    <div className="flex h-full flex-col bg-[#111113] text-white/90" style={{ colorScheme: "dark" }}>
      <TasksTitleBar categoriesOpen={categoriesOpen} onToggleCategories={() => setCategoriesOpen((open) => !open)} />

      {categoriesOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CategoryManager categories={categories} tasks={tasks} onAdd={api.addCategory} onRemove={api.removeCategory} />
        </div>
      ) : (
        <>
          <WeekStrip selected={selected} today={today} tasks={tasks} onSelect={setSelected} />
          <CategoryFilter categories={categories} value={filter} onChange={setFilter} />

          <div className="flex items-baseline justify-between px-4 pb-1 pt-4">
            <h2 className="text-sm font-semibold capitalize text-white">{selected === today ? `Hari ini · ${formatLongDate(selected)}` : formatLongDate(selected)}</h2>
            <span className="text-[11px] text-white/45">{openCount} tersisa</span>
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {editing !== null && (
              <div className="mb-3">
                <TaskForm key={editing} initial={initial} categories={categories} submitLabel={editingTask ? "Simpan" : "Tambah"} onSubmit={save} onCancel={() => setEditing(null)} />
              </div>
            )}

            {!api.loaded ? null : visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-white/40">Tidak ada tugas di hari ini</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {visible.map((occurrence) => (
                  <TaskRow
                    key={`${occurrence.task.id}-${occurrence.date}`}
                    occurrence={occurrence}
                    category={categories.find((category) => category.id === occurrence.task.categoryId)}
                    onToggle={() => api.toggleDone(occurrence.task.id, occurrence.date)}
                    onEdit={() => setEditing(occurrence.task.id)}
                    onDelete={() => api.removeTask(occurrence.task.id)}
                  />
                ))}
              </ul>
            )}
          </main>

          {editing === null && (
            <div className="shrink-0 border-t border-white/5 p-3">
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#c8e63c] py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:opacity-75"
              >
                <Icon name="add" className="h-4 w-4" />
                Tugas baru
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
