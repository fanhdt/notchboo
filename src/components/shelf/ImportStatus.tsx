import type { UseShelfImport } from "../../hooks/useShelf";
import { ErrorBanner } from "./Feedback";
import Icon from "./Icon";

/** Kemajuan impor, kegagalan, dan daftar file yang dilewati. Tidak menampilkan apa pun saat tidak ada yang perlu dilaporkan. */
export default function ImportStatus({ importer }: { importer: UseShelfImport }) {
  const { importing, progress, skipped, error, dismiss } = importer;

  if (!importing && !error && skipped.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-3 pt-3">
      {importing && (
        <div role="status" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{progress ? `Menyalin ${progress.fileName}` : "Menyiapkan impor…"}</span>
            {progress && (
              <span className="shrink-0 tabular-nums text-white/45">
                {progress.index}/{progress.count}
              </span>
            )}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#c8e63c] transition-[width] duration-200" style={{ width: progress ? `${((progress.index - 1) / progress.count) * 100}%` : "0%" }} />
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} onDismiss={dismiss} />}

      {skipped.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <div className="flex items-center gap-2">
            <Icon name="warning" className="h-3.5 w-3.5" />
            <span className="flex-1 font-medium">{skipped.length} file dilewati</span>
            <button type="button" onClick={dismiss} aria-label="Tutup pesan" className="text-amber-100/70 hover:text-amber-50">
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="mt-1.5 flex flex-col gap-1 text-amber-100/80">
            {skipped.map((file) => (
              <li key={file.path} className="wrap-break-word">
                <span className="font-medium">{file.path.split(/[\\/]/).pop()}</span>: {file.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
