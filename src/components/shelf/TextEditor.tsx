import { useEffect, useRef, useState } from "react";

import type { ItemKind, ShelfItem, TextInput } from "../../lib/shelf";
import { ErrorBanner } from "./Feedback";

type Props = {
  kind: Exclude<ItemKind, "file">;
  /** Item dengan isi lengkap (dari `shelf_get`), atau null untuk item baru. */
  initial: ShelfItem | null;
  error: string | null;
  onSave: (input: TextInput) => Promise<boolean>;
  onClose: () => void;
};

const COPY = {
  note: { new: "Catatan baru", edit: "Edit catatan", bodyPlaceholder: "Tulis catatan…" },
  snippet: { new: "Snippet baru", edit: "Edit snippet", bodyPlaceholder: "Tempel atau tulis snippet…" },
} as const;

/** Editor catatan/snippet sebagai lapisan penuh di atas daftar. Ctrl+Enter menyimpan, Esc menutup. */
export default function TextEditor({ kind, initial, error, onSave, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [language, setLanguage] = useState(initial?.language ?? "");
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const isSnippet = kind === "snippet";
  const canSave = !saving && (title.trim() !== "" || body.trim() !== "");

  useEffect(() => {
    bodyRef.current?.focus();
  }, []);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const ok = await onSave({ title, body, language: isSnippet ? language : null });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col bg-[#111113]"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? COPY[kind].edit : COPY[kind].new}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void save();
        }
      }}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{initial ? COPY[kind].edit : COPY[kind].new}</h2>
        <span className="text-[11px] text-white/35">Ctrl+Enter untuk menyimpan</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Judul (opsional)"
            maxLength={200}
            aria-label="Judul"
            className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 focus:border-[#c8e63c]/50 focus:outline-none"
          />
          {isSnippet && (
            <input
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder="Bahasa"
              maxLength={32}
              aria-label="Bahasa"
              className="h-9 w-28 rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-xs text-white placeholder:text-white/35 focus:border-[#c8e63c]/50 focus:outline-none"
            />
          )}
        </div>

        <textarea
          ref={bodyRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={COPY[kind].bodyPlaceholder}
          aria-label="Isi"
          spellCheck={!isSnippet}
          className={`min-h-0 flex-1 resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm leading-relaxed text-white placeholder:text-white/35 focus:border-[#c8e63c]/50 focus:outline-none ${
            isSnippet ? "font-mono text-xs" : ""
          }`}
        />

        {error && <ErrorBanner message={error} />}
      </div>

      <div className="flex justify-end gap-2 border-t border-white/5 px-3 py-3">
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs text-white/70 hover:bg-white/10">
          Batal
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="rounded-lg bg-[#c8e63c] px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}
