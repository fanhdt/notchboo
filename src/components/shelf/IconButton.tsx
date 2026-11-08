import Icon, { type IconName } from "./Icon";

type Props = {
  label: string;
  icon: IconName;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
};

export default function IconButton({ label, icon, onClick, active, danger, disabled }: Props) {
  const tone = active
    ? "bg-[#c8e63c]/15 text-[#c8e63c]"
    : danger
      ? "text-white/50 hover:bg-red-500/15 hover:text-red-300"
      : "text-white/50 hover:bg-white/10 hover:text-white";

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-30 ${tone}`}
    >
      <Icon name={icon} />
    </button>
  );
}
