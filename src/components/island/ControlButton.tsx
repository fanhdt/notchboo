import type { ReactNode } from "react";

type ControlButtonProps = {
  label: string;
  onPress: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
};

export default function ControlButton({ label, onPress, children, active, disabled }: ControlButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
        disabled ? "cursor-default text-white/15" : `active:bg-white/25 ${active ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/15 hover:text-white"}`
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        {children}
      </svg>
    </button>
  );
}
