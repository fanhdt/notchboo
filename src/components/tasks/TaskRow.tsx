import { describeRepeat, formatShortDate, type Category, type Occurrence } from "../../lib/tasks";
import Icon from "../shelf/Icon";
import IconButton from "../shelf/IconButton";
import { DeleteButton } from "../shelf/ItemControls";

type Props = {
  occurrence: Occurrence;
  category: Category | undefined;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export default function TaskRow({ occurrence, category, onToggle, onEdit, onDelete }: Props) {
  const { task, date, done, overdue } = occurrence;
  const repeat = describeRepeat(task);

  return (
    <li className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/3 px-3 py-2.5 transition-colors hover:border-white/10 hover:bg-white/5">
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? "Tandai belum selesai" : "Tandai selesai"}
        aria-pressed={done}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${done ? "border-[#c8e63c] bg-[#c8e63c] text-black" : "border-white/35 hover:border-white"}`}
      >
        {done && <Icon name="check" className="h-3.5 w-3.5" />}
      </button>

      <button type="button" onClick={onEdit} title="Ubah tugas" className="min-w-0 flex-1 text-left">
        <span className={`block truncate text-sm ${done ? "text-white/35 line-through" : "text-white"}`}>{task.title}</span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/45">
          {category && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: category.color }} />
              {category.name}
            </span>
          )}
          {task.time && (
            <span className="flex items-center gap-1 tabular-nums">
              <Icon name="clock" className="h-3 w-3" />
              {task.time}
            </span>
          )}
          {repeat && (
            <span className="flex items-center gap-1">
              <Icon name="repeat" className="h-3 w-3" />
              {repeat}
            </span>
          )}
          {overdue && <span className="text-red-300/80">Tertunda sejak {formatShortDate(date)}</span>}
        </span>
      </button>

      <div className="flex shrink-0 items-center">
        <IconButton label="Ubah tugas" icon="edit" onClick={onEdit} />
        <DeleteButton onConfirm={onDelete} />
      </div>
    </li>
  );
}
