import { EmptyState, ErrorBanner, LoadingState } from "../../components/shelf/Feedback";
import Icon from "../../components/shelf/Icon";
import { useShelfSettings } from "../../hooks/useShelf";
import { EXPIRY_LABEL, EXPIRY_OPTIONS } from "../../lib/shelf";

export default function ShelfSettings() {
  const { settings, loading, error, saved, setDefaultExpiry } = useShelfSettings();

  if (loading) return <LoadingState />;

  if (!settings) {
    return <div className="p-3">{error ? <ErrorBanner message={error} /> : <EmptyState icon="settings" title="Pengaturan tidak tersedia" />}</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <section>
        <h2 className="text-sm font-semibold text-white">Masa berlaku bawaan</h2>

        <p className="mt-1 text-xs leading-relaxed text-white/50">
          Berlaku untuk item baru. Item yang disematkan tidak pernah dihapus otomatis, dan item kedaluwarsa dibersihkan setiap jam. Masa berlaku item yang sudah ada bisa diubah satu per satu.
        </p>

        <fieldset className="mt-3 flex flex-col gap-1.5">
          <legend className="sr-only">Masa berlaku bawaan</legend>

          {EXPIRY_OPTIONS.map((option) => {
            const selected = settings.defaultExpiry === option;

            return (
              <label
                key={option}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  selected ? "border-accent/50 bg-accent/10 text-white" : "border-white/10 text-white/70 hover:bg-white/5"
                }`}
              >
                <input type="radio" name="default-expiry" value={option} checked={selected} onChange={() => void setDefaultExpiry(option)} className="sr-only" />

                <span>{EXPIRY_LABEL[option]}</span>

                {selected && <Icon name="check" className="h-4 w-4 text-accent" />}
              </label>
            );
          })}
        </fieldset>

        <div className="mt-2 h-4 text-xs text-accent" role="status" aria-live="polite">
          {saved ? "Tersimpan" : ""}
        </div>

        {error && <ErrorBanner message={error} />}
      </section>
    </div>
  );
}
