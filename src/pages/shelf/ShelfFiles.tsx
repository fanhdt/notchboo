import { useItemActions, useShelfItems, type UseShelfImport } from "../../hooks/useShelf";
import { EmptyState, ErrorBanner, LoadingState } from "../../components/shelf/Feedback";
import FileRow from "../../components/shelf/FileRow";
import Icon from "../../components/shelf/Icon";
import { ConfirmDialog } from "../../components/shelf/ItemControls";

type Props = {
  query: string;
  pinnedOnly: boolean;
  importer: UseShelfImport;
  /** Berubah setiap kali impor berhasil, memaksa daftar dimuat ulang. */
  reloadToken: number;
};

export default function ShelfFiles({ query, pinnedOnly, importer, reloadToken }: Props) {
  const list = useShelfItems("file", query, pinnedOnly, reloadToken);
  const actions = useItemActions();

  const filtering = query.trim() !== "" || pinnedOnly;

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-3 pb-1 pt-3">
          <span className="text-xs text-white/40">{list.loading ? "Memuat…" : `${list.items.length} file`}</span>
          <button
            type="button"
            onClick={() => void importer.pick()}
            disabled={importer.importing}
            className="flex items-center gap-1.5 rounded-lg bg-[#c8e63c] px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Icon name="add" className="h-3.5 w-3.5" />
            Tambah file
          </button>
        </div>

        <div className="flex flex-col gap-2 px-3 pt-1">
          {list.error && <ErrorBanner message={list.error} onRetry={() => void list.refresh()} />}
          {list.actionError && <ErrorBanner message={list.actionError} onDismiss={list.dismissActionError} />}
          {actions.error && <ErrorBanner message={actions.error} onDismiss={actions.clearFeedback} />}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.loading && list.items.length === 0 ? (
            <LoadingState />
          ) : list.items.length === 0 && !list.error ? (
            filtering ? (
              <EmptyState icon="search" title="Tidak ada hasil" hint={query.trim() ? `Tidak ada file yang cocok dengan “${query.trim()}”.` : "Belum ada file yang disematkan."} />
            ) : (
              <EmptyState icon="upload" title="Seret file ke sini" hint="Atau pilih lewat tombol Tambah file. Shelf menyimpan salinan; file aslimu tidak diubah.">
                <button type="button" onClick={() => void importer.pick()} className="mt-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white">
                  Pilih file…
                </button>
              </EmptyState>
            )
          ) : (
            <ul className="flex flex-col gap-2 p-3 pb-6">
              {list.items.map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  onOpen={() => void actions.openFile(item)}
                  onReveal={() => void actions.reveal(item)}
                  onTogglePin={() => void list.togglePin(item)}
                  onSetExpiry={(expiry) => void list.setExpiry(item, expiry)}
                  onDelete={() => void list.remove(item)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {actions.pendingRisky && (
        <ConfirmDialog
          title="Jalankan file ini?"
          message={`“${actions.pendingRisky.fileName ?? actions.pendingRisky.title}” adalah jenis file yang bisa menjalankan program. Buka hanya jika kamu mempercayainya.`}
          confirmLabel="Tetap buka"
          onConfirm={() => void actions.confirmRisky()}
          onCancel={actions.cancelRisky}
        />
      )}
    </>
  );
}
