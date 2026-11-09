import { useState } from "react";

import { useItemActions, useShelfItems } from "../../hooks/useShelf";
import type { ItemKind, ShelfItem } from "../../lib/shelf";
import { EmptyState, ErrorBanner, LoadingState, Toast } from "./Feedback";
import TextCard from "./TextCard";
import TextEditor from "./TextEditor";

type TextKind = Exclude<ItemKind, "file">;

const COPY = {
  note: {
    add: "Catatan baru",
    emptyTitle: "Belum ada catatan",
    emptyHint: "Simpan catatan singkat untuk beberapa hari. Yang tidak disematkan akan hilang sendiri.",
    icon: "note",
  },
  snippet: {
    add: "Snippet baru",
    emptyTitle: "Belum ada snippet",
    emptyHint: "Simpan potongan teks atau kode yang sering dipakai, lalu salin dengan satu klik.",
    icon: "code",
  },
} as const;

type Props = {
  kind: TextKind;
  query: string;
  pinnedOnly: boolean;
};

type EditorState = { item: ShelfItem | null } | null;

/** Daftar catatan atau snippet beserta editornya. Dipakai bersama oleh ShelfNotes dan ShelfSnippets. */
export default function TextItemList({ kind, query, pinnedOnly }: Props) {
  const list = useShelfItems(kind, query, pinnedOnly);
  const actions = useItemActions();
  const [editor, setEditor] = useState<EditorState>(null);

  const copy = COPY[kind];
  const filtering = query.trim() !== "" || pinnedOnly;

  async function startEdit(item: ShelfItem) {
    // Daftar hanya membawa potongan awal isi; editor harus memegang isi lengkap.
    const full = await actions.loadFull(item);
    if (full) setEditor({ item: full });
  }

  function closeEditor() {
    list.dismissActionError();
    setEditor(null);
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-3">
          <span className="text-xs text-white/40">{list.loading ? "Memuat…" : `${list.items.length} item`}</span>
        </div>

        <div className="flex flex-col gap-2 px-3 pt-1">
          {list.error && <ErrorBanner message={list.error} onRetry={() => void list.refresh()} />}
          {!editor && list.actionError && <ErrorBanner message={list.actionError} onDismiss={list.dismissActionError} />}
          {actions.error && <ErrorBanner message={actions.error} onDismiss={actions.clearFeedback} />}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.loading && list.items.length === 0 ? (
            <LoadingState />
          ) : list.items.length === 0 && !list.error ? (
            filtering ? (
              <EmptyState icon="search" title="Tidak ada hasil" hint={query.trim() ? `Tidak ada ${kind === "note" ? "catatan" : "snippet"} yang cocok dengan “${query.trim()}”.` : "Belum ada item yang disematkan di sini."} />
            ) : (
              <EmptyState icon={copy.icon} title={copy.emptyTitle} hint={copy.emptyHint} />
            )
          ) : (
            <ul className="flex flex-col gap-2 p-3 pb-6">
              {list.items.map((item) => (
                <TextCard
                  key={item.id}
                  item={item}
                  onEdit={() => void startEdit(item)}
                  onTogglePin={() => void list.togglePin(item)}
                  onSetExpiry={(expiry) => void list.setExpiry(item, expiry)}
                  onDelete={() => void list.remove(item)}
                  onCopy={() => void actions.copyBody(item)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {editor && <TextEditor kind={kind} initial={editor.item} error={list.actionError} onSave={(input) => list.saveText(editor.item, kind, input)} onClose={closeEditor} />}

      <Toast message={actions.notice} />
    </>
  );
}
