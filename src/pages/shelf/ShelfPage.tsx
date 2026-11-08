import { useCallback, useState } from "react";

import Icon from "../../components/shelf/Icon";
import ImportStatus from "../../components/shelf/ImportStatus";
import { CategoryTabs, SearchBar, TitleBar, type ShelfView } from "../../components/shelf/ShelfHeader";
import { useFileDrop, useShelfImport } from "../../hooks/useShelf";
import ShelfFiles from "./ShelfFiles";
import ShelfNotes from "./ShelfNotes";
import ShelfSettings from "./ShelfSettings";
import ShelfSnippets from "./ShelfSnippets";

/** Window `shelf`: kerangka, pencarian, kategori, dan penerima file yang diseret. */
export default function ShelfPage() {
  const [view, setView] = useState<ShelfView>("file");
  const [query, setQuery] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const importer = useShelfImport(useCallback(() => setReloadToken((token) => token + 1), []));
  const { importPaths } = importer;

  // File bisa dilepas di kategori mana pun; hasilnya selalu ditampilkan di tab File.
  const dragging = useFileDrop(
    useCallback(
      (paths: string[]) => {
        setView("file");
        void importPaths(paths);
      },
      [importPaths],
    ),
  );

  const settingsOpen = view === "settings";

  return (
    <div className="flex h-full flex-col bg-[#111113] text-white/90" style={{ colorScheme: "dark" }}>
      <TitleBar settingsOpen={settingsOpen} onToggleSettings={() => setView(settingsOpen ? "file" : "settings")} />

      {!settingsOpen && (
        <>
          <SearchBar value={query} onChange={setQuery} pinnedOnly={pinnedOnly} onTogglePinned={() => setPinnedOnly((value) => !value)} />
          <CategoryTabs view={view} onChange={setView} />
          <ImportStatus importer={importer} />
        </>
      )}

      <main className="relative min-h-0 flex-1">
        {view === "file" && <ShelfFiles query={query} pinnedOnly={pinnedOnly} importer={importer} reloadToken={reloadToken} />}
        {view === "note" && <ShelfNotes query={query} pinnedOnly={pinnedOnly} />}
        {view === "snippet" && <ShelfSnippets query={query} pinnedOnly={pinnedOnly} />}
        {view === "settings" && (
          <div className="h-full overflow-y-auto">
            <ShelfSettings />
          </div>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-50 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#c8e63c]/70 bg-[#111113]/90 text-[#c8e63c]">
            <Icon name="upload" className="h-8 w-8" />
            <span className="text-sm font-medium">Lepas untuk menyimpan ke Shelf</span>
          </div>
        )}
      </main>
    </div>
  );
}
