import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function LauncherPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    inputRef.current?.focus();

    let unlisten: (() => void) | undefined;

    void appWindow
      .onFocusChanged(({ payload }) => {
        if (payload) {
          inputRef.current?.focus();
        }
      })
      .then((handler) => {
        unlisten = handler;
      });

    return () => {
      unlisten?.();
    };
  }, [appWindow]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      void appWindow.hide();
    }
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111113] text-white shadow-2xl">
      <header data-tauri-drag-region className="flex h-12 shrink-0 items-center justify-between border-b border-white/5 px-5">
        <div className="flex items-center gap-2">
          <span className="text-lg text-[#c8e63c]">✳</span>
          <span className="text-sm font-semibold">Mochi Launcher</span>
        </div>

        <span className="text-[10px] text-white/30">QUICK ACCESS</span>
      </header>

      <section className="flex flex-1 flex-col px-6 pt-7">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 transition-colors focus-within:border-[#c8e63c]/50">
          <span className="text-xl text-[#c8e63c]">⌕</span>

          <input
            ref={inputRef}
            type="text"
            placeholder="Cari aplikasi, file, atau perintah..."
            aria-label="Cari aplikasi, file, atau perintah"
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
          />

          <kbd className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/35">ESC</kbd>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mb-3 text-3xl text-white/15">⌘</div>
            <p className="text-sm text-white/55">Quick access to everything</p>
            <p className="mt-1 text-xs text-white/25">Mulai ketik untuk mencari.</p>
          </div>
        </div>

        <footer className="flex h-10 shrink-0 items-center justify-between border-t border-white/5 text-[10px] text-white/25">
          <span>MOCHI · LOCAL SEARCH</span>
          <span>ESC to close</span>
        </footer>
      </section>
    </main>
  );
}
