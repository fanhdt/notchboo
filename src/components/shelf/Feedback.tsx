import type { ReactNode } from "react";

import Icon, { type IconName } from "./Icon";

export function EmptyState({ icon, title, hint, children }: { icon: IconName; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-white/40">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-white/80">{title}</p>
      {hint && <p className="text-xs leading-relaxed text-white/45">{hint}</p>}
      {children}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex flex-col gap-2 p-3" role="status" aria-label="Memuat">
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-14 animate-pulse rounded-xl bg-white/5" />
      ))}
    </div>
  );
}

export function ErrorBanner({ message, onRetry, onDismiss }: { message: string; onRetry?: () => void; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
      <Icon name="warning" className="mt-0.5 h-3.5 w-3.5" />
      <span className="min-w-0 flex-1 wrap-break-word">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 font-medium underline-offset-2 hover:underline">
          Coba lagi
        </button>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Tutup pesan" className="shrink-0 text-red-200/70 hover:text-red-100">
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#c8e63c] px-3 py-1.5 text-xs font-medium text-black shadow-lg"
    >
      <Icon name="check" className="h-3.5 w-3.5" />
      {message}
    </div>
  );
}
