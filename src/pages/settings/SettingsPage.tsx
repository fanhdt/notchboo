import { useState, type KeyboardEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";

import { useSettings } from "../../hooks/useSettings";
import { confirmSettingsImport, exportSettings, previewSettingsImport, type AppSettings } from "../../lib/settings";
import { useSoundSettings } from "../../hooks/useSoundSettings";
import type { AlarmKind, AlarmSound } from "../../lib/sound";

type Section = "general" | "appearance" | "features" | "shortcuts" | "privacy" | "data" | "about";

const SECTIONS: { id: Section; label: string; description: string }[] = [
  { id: "general", label: "Umum", description: "Perilaku dan startup aplikasi" },
  { id: "appearance", label: "Tampilan", description: "Tema dan tampilan Island" },
  { id: "features", label: "Fitur", description: "Preferensi dan fitur Mochi" },
  { id: "shortcuts", label: "Shortcut", description: "Pintasan keyboard" },
  { id: "privacy", label: "Privasi", description: "Kontrol data dan akses" },
  { id: "data", label: "Data Management", description: "Ekspor dan impor konfigurasi" },
  { id: "about", label: "Tentang", description: "Informasi aplikasi" },
];

const SHORTCUT_ITEMS = [
  ["toggleIsland", "Toggle Island", "Tampilkan atau sembunyikan Island"],
  ["openLauncher", "Open Launcher", "Buka Launcher"],
  ["openClipboard", "Open Clipboard", "Buka Clipboard"],
  ["openNotifications", "Open Notifications", "Buka Notifications"],
  ["startFocus", "Start Focus", "Mulai sesi fokus"],
  ["openSettings", "Open Settings", "Buka pengaturan Mochi"],
] as const satisfies readonly [keyof AppSettings["shortcuts"], string, string][];

const controlClass = "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-accent/60";

const checkboxClass = "h-4 w-4 cursor-pointer accent-[#c8e63c]";

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-white/45">{description}</p>
    </div>
  );
}

function SettingRow({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-white/5 py-4 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white/85">{title}</p>
        {description && <p className="mt-1 text-xs leading-relaxed text-white/40">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className={checkboxClass} />
      <span className="sr-only">{label}</span>
    </label>
  );
}

export default function SettingsPage() {
  const { settings, loaded, saving, error, updateSettings, reloadSettings } = useSettings();
  const [activeSection, setActiveSection] = useState<Section>("general");

  const appWindow = getCurrentWindow();

  const sound = useSoundSettings();
  const [capturingShortcut, setCapturingShortcut] = useState<keyof AppSettings["shortcuts"] | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  const [dataBusy, setDataBusy] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const [importPath, setImportPath] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<AppSettings | null>(null);
  const [excludedAppInput, setExcludedAppInput] = useState("");

  async function handleExportSettings() {
    setDataBusy(true);
    setDataError(null);
    setDataNotice(null);

    try {
      const filePath = await save({
        title: "Export Mochi Settings",
        defaultPath: "mochi-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (!filePath) return;

      await exportSettings(filePath);
      setDataNotice("Konfigurasi berhasil diekspor.");
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Gagal mengekspor konfigurasi.");
    } finally {
      setDataBusy(false);
    }
  }

  async function handlePreviewImport() {
    setDataBusy(true);
    setDataError(null);
    setDataNotice(null);
    setImportPreview(null);
    setImportPath(null);

    try {
      const selected = await open({
        title: "Import Mochi Settings",
        multiple: false,
        directory: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (!selected || Array.isArray(selected)) return;

      const preview = await previewSettingsImport(selected);

      setImportPath(selected);
      setImportPreview(preview);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Gagal membaca konfigurasi.");
    } finally {
      setDataBusy(false);
    }
  }

  async function handleConfirmImport() {
    if (!importPath || !importPreview) return;

    setDataBusy(true);
    setDataError(null);
    setDataNotice(null);

    try {
      await confirmSettingsImport(importPath);
      await reloadSettings();

      setImportPath(null);
      setImportPreview(null);
      setDataNotice("Konfigurasi berhasil diimpor dan diterapkan.");
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Gagal menerapkan konfigurasi.");
    } finally {
      setDataBusy(false);
    }
  }

  function handleCancelImport() {
    setImportPath(null);
    setImportPreview(null);
    setDataError(null);
  }

  function updateGeneral<K extends keyof AppSettings["general"]>(key: K, value: AppSettings["general"][K]) {
    updateSettings((current) => ({
      ...current,
      general: { ...current.general, [key]: value },
    }));
  }

  function updateAppearance<K extends keyof AppSettings["appearance"]>(key: K, value: AppSettings["appearance"][K]) {
    updateSettings((current) => ({
      ...current,
      appearance: { ...current.appearance, [key]: value },
    }));
  }

  function updateIslandAppearance<K extends keyof AppSettings["appearance"]["island"]>(key: K, value: AppSettings["appearance"]["island"][K]) {
    updateSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        island: { ...current.appearance.island, [key]: value },
      },
    }));
  }

  function updateFeature<K extends keyof AppSettings["features"]>(key: K, value: AppSettings["features"][K]) {
    updateSettings((current) => ({
      ...current,
      features: { ...current.features, [key]: value },
    }));
  }

  function updatePrivacy<K extends keyof AppSettings["privacy"]>(key: K, value: AppSettings["privacy"][K]) {
    updateSettings((current) => ({
      ...current,
      privacy: { ...current.privacy, [key]: value },
    }));
  }

  function handleAddExcludedApp() {
    const appName = excludedAppInput.trim();

    if (!appName) return;

    const alreadyExists = settings?.privacy.excludedApps.some((app) => app.toLowerCase() === appName.toLowerCase());

    if (alreadyExists) {
      setExcludedAppInput("");
      return;
    }

    updatePrivacy("excludedApps", [...(settings?.privacy.excludedApps ?? []), appName]);

    setExcludedAppInput("");
  }

  function handleRemoveExcludedApp(appName: string) {
    updatePrivacy(
      "excludedApps",
      settings!.privacy.excludedApps.filter((app) => app.toLowerCase() !== appName.toLowerCase()),
    );
  }

  function updateShortcut<K extends keyof AppSettings["shortcuts"]>(key: K, value: AppSettings["shortcuts"][K]) {
    updateSettings((current) => ({
      ...current,
      shortcuts: { ...current.shortcuts, [key]: value },
    }));
  }

  function handleShortcutKeyDown(event: KeyboardEvent<HTMLButtonElement>, key: keyof AppSettings["shortcuts"]) {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setCapturingShortcut(null);
      return;
    }

    // Jangan menangkap tombol modifier sebelum tombol utama ditekan.
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
      return;
    }

    // Shortcut harus memiliki minimal satu modifier.
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      return;
    }

    const modifiers: string[] = [];

    if (event.ctrlKey || event.metaKey) modifiers.push("CmdOrCtrl");
    if (event.altKey) modifiers.push("Alt");
    if (event.shiftKey) modifiers.push("Shift");

    let keyName: string | null = null;

    if (/^Key[A-Z]$/.test(event.code)) {
      keyName = event.code.slice(3);
    } else if (/^Digit[0-9]$/.test(event.code)) {
      keyName = event.code.slice(5);
    } else if (/^F([1-9]|1[0-2])$/.test(event.code)) {
      keyName = event.code;
    } else {
      const supportedKeys: Record<string, string> = {
        Space: "Space",
        Enter: "Enter",
        Tab: "Tab",
        Backspace: "Backspace",
        Delete: "Delete",
        Insert: "Insert",
        Home: "Home",
        End: "End",
        PageUp: "PageUp",
        PageDown: "PageDown",
        ArrowUp: "Up",
        ArrowDown: "Down",
        ArrowLeft: "Left",
        ArrowRight: "Right",
      };

      keyName = supportedKeys[event.code] ?? null;
    }

    if (!keyName) return;

    const accelerator = [...modifiers, keyName].join("+");

    const conflict = Object.entries(settings?.shortcuts ?? {}).find(([otherKey, value]) => otherKey !== key && value === accelerator);

    if (conflict) {
      const conflictingLabel = SHORTCUT_ITEMS.find(([itemKey]) => itemKey === conflict[0])?.[1] ?? conflict[0];

      setShortcutError(`${accelerator} sudah digunakan oleh ${conflictingLabel}.`);
      setCapturingShortcut(null);
      return;
    }

    setShortcutError(null);
    updateShortcut(key, accelerator);
    setCapturingShortcut(null);
  }

  if (!loaded || !settings) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-sm text-white/50">
        {error ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="max-w-sm text-hot">{error}</p>
            <button type="button" onClick={() => void reloadSettings()} className="rounded-lg bg-white/10 px-4 py-2 text-white hover:bg-white/15">
              Coba lagi
            </button>
          </div>
        ) : (
          "Memuat pengaturan..."
        )}
      </div>
    );
  }

  const section = SECTIONS.find((item) => item.id === activeSection)!;

  return (
    <div className="flex h-full flex-col bg-surface text-white/90" style={{ colorScheme: "dark" }}>
      <header className="flex h-12 shrink-0 select-none items-center border-b border-white/5 px-4">
        <div data-tauri-drag-region className="flex flex-1 items-center gap-2">
          <span className="pointer-events-none text-accent">✳</span>
          <h1 className="pointer-events-none text-sm font-semibold tracking-tight text-white">Pengaturan Mochi</h1>
          <span className="ml-1 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/35">SETTINGS</span>
        </div>

        <span className="mr-3 text-[10px] text-white/35" role="status" aria-live="polite">
          {saving ? "Menyimpan..." : error ? "Gagal menyimpan" : " "}
        </span>

        <button type="button" aria-label="Perkecil" onClick={() => void appWindow.minimize()} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white">
          −
        </button>

        <button type="button" aria-label="Tutup" onClick={() => void appWindow.hide()} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-hot/15 hover:text-hot">
          ×
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-52 shrink-0 flex-col border-r border-white/5 p-3">
          <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Preferences</p>

          <nav className="flex flex-col gap-1" aria-label="Kategori pengaturan">
            {SECTIONS.map((item) => {
              const active = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col rounded-lg px-3 py-2.5 text-left transition-colors ${active ? "bg-accent/10 text-accent" : "text-white/55 hover:bg-white/5 hover:text-white/85"}`}
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className={`mt-0.5 text-[10px] ${active ? "text-accent/60" : "text-white/30"}`}>{item.description}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-white/5 px-2 pt-3">
            <p className="text-[10px] text-white/30">Mochi Desktop</p>
            <p className="mt-1 text-[10px] text-white/20">Version 0.1.1</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-7 py-7">
            <div className="mb-7 flex items-center justify-between">
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-accent/70">Settings / {section.label}</p>
                <h2 className="text-xl font-semibold tracking-tight text-white">{section.label}</h2>
                <p className="mt-1 text-xs text-white/40">{section.description}</p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-white/35">Mochi</span>
            </div>

            {activeSection === "general" && (
              <section>
                <SectionHeading title="Perilaku aplikasi" description="Atur bagaimana Mochi berjalan di Windows." />

                <SettingRow title="Jalankan saat startup" description="Buka Mochi secara otomatis ketika kamu masuk ke Windows.">
                  <Toggle label="Jalankan saat startup" checked={settings.general.launchAtStartup} onChange={(value) => updateGeneral("launchAtStartup", value)} />
                </SettingRow>

                <SettingRow title="Mulai dalam keadaan tersembunyi" description="Jangan langsung menampilkan window utama saat aplikasi dijalankan.">
                  <Toggle label="Mulai tersembunyi" checked={settings.general.startMinimized} onChange={(value) => updateGeneral("startMinimized", value)} />
                </SettingRow>

                <SettingRow title="Tetap berjalan di background" description="Mochi tetap aktif setelah window utama ditutup.">
                  <Toggle label="Tetap berjalan di background" checked={settings.general.keepRunningInBackground} onChange={(value) => updateGeneral("keepRunningInBackground", value)} />
                </SettingRow>

                <SettingRow title="Tutup ke system tray" description="Tombol tutup menyembunyikan aplikasi, bukan menghentikannya.">
                  <Toggle label="Tutup ke system tray" checked={settings.general.closeToTray} onChange={(value) => updateGeneral("closeToTray", value)} />
                </SettingRow>
              </section>
            )}

            {activeSection === "appearance" && (
              <section>
                <SectionHeading title="Tampilan" description="Sesuaikan tema dan perilaku visual Mochi." />

                <SettingRow title="Tema" description="Pilih tema aplikasi.">
                  <select className={controlClass} value={settings.appearance.theme} onChange={(event) => updateAppearance("theme", event.target.value as AppSettings["appearance"]["theme"])}>
                    <option value="system">System</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </SettingRow>

                <SettingRow title="Layout Island" description="Pilih susunan informasi pada Dynamic Island.">
                  <select className={controlClass} value={settings.appearance.island.layout} onChange={(event) => updateIslandAppearance("layout", event.target.value as AppSettings["appearance"]["island"]["layout"])}>
                    <option value="inline">Inline</option>
                    <option value="side">Side</option>
                  </select>
                </SettingRow>

                <SettingRow title="Perilaku Peek" description="Kapan Island menampilkan informasi tambahan.">
                  <select className={controlClass} value={settings.appearance.island.peekBehavior} onChange={(event) => updateIslandAppearance("peekBehavior", event.target.value as AppSettings["appearance"]["island"]["peekBehavior"])}>
                    <option value="whenBusy">When busy</option>
                    <option value="always">Always</option>
                    <option value="standby">Standby</option>
                  </select>
                </SettingRow>

                <SettingRow title="Animasi" description="Aktifkan atau nonaktifkan animasi antarmuka.">
                  <Toggle label="Animasi" checked={settings.appearance.animationsEnabled} onChange={(value) => updateAppearance("animationsEnabled", value)} />
                </SettingRow>

                <SettingRow title="Transparansi" description={`Tingkat transparansi: ${settings.appearance.transparency}%`}>
                  <div className="flex w-40 items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.appearance.transparency}
                      onChange={(event) => updateAppearance("transparency", Number(event.target.value))}
                      className="w-full accent-[#c8e63c]"
                      aria-label="Transparansi"
                    />
                    <span className="w-8 text-right text-xs tabular-nums text-white/55">{settings.appearance.transparency}</span>
                  </div>
                </SettingRow>
              </section>
            )}

            {activeSection === "features" && (
              <section>
                <SectionHeading title="Fitur Mochi" description="Kelola fitur yang tersedia dan preferensi masing-masing." />

                <SettingRow title="Media Player" description="Informasi media dan kontrol pemutaran.">
                  <Toggle label="Media Player" checked={settings.features.media} onChange={(value) => updateFeature("media", value)} />
                </SettingRow>

                <SettingRow title="System Monitor" description="Pantau penggunaan resource sistem.">
                  <Toggle label="System Monitor" checked={settings.features.systemMonitor} onChange={(value) => updateFeature("systemMonitor", value)} />
                </SettingRow>

                <SettingRow title="Tasks" description="Aktifkan pengelolaan tugas.">
                  <Toggle label="Tasks" checked={settings.features.tasks} onChange={(value) => updateFeature("tasks", value)} />
                </SettingRow>

                <SettingRow title="Quick Shelf" description="Akses file, catatan, dan snippet.">
                  <Toggle label="Quick Shelf" checked={settings.features.quickShelf} onChange={(value) => updateFeature("quickShelf", value)} />
                </SettingRow>

                <div className="mb-3 mt-7 border-b border-white/10 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/55">Pomodoro</h3>
                </div>

                <SettingRow title="Aktifkan Pomodoro" description="Tampilkan dan gunakan fitur timer fokus.">
                  <Toggle label="Pomodoro" checked={settings.features.pomodoro.enabled} onChange={(value) => updateFeature("pomodoro", { ...settings.features.pomodoro, enabled: value })} />
                </SettingRow>

                <SettingRow title="Mode timer">
                  <select className={controlClass} value={settings.features.pomodoro.mode} onChange={(event) => updateFeature("pomodoro", { ...settings.features.pomodoro, mode: event.target.value as "pomodoro" | "flow" })}>
                    <option value="pomodoro">Pomodoro</option>
                    <option value="flow">Flowmodoro</option>
                  </select>
                </SettingRow>

                <SettingRow title="Rasio Flowmodoro" description="Rasio waktu fokus terhadap waktu istirahat.">
                  <select className={controlClass} value={settings.features.pomodoro.flowRatio} onChange={(event) => updateFeature("pomodoro", { ...settings.features.pomodoro, flowRatio: Number(event.target.value) })}>
                    <option value={3}>3 : 1</option>
                    <option value={4}>4 : 1</option>
                    <option value={5}>5 : 1</option>
                  </select>
                </SettingRow>

                <div className="mb-3 mt-7 border-b border-white/10 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/55">Sound & Volume</h3>
                </div>

                <SettingRow title="Volume global" description="Atur volume seluruh suara notifikasi Mochi.">
                  <div className="flex w-44 items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(sound.settings.volume * 100)}
                      onChange={(event) => sound.setVolume(Number(event.target.value) / 100)}
                      className="w-full accent-[#c8e63c]"
                      aria-label="Volume global"
                    />
                    <span className="w-9 text-right text-xs tabular-nums text-white/55">{Math.round(sound.settings.volume * 100)}%</span>
                  </div>
                </SettingRow>

                <SettingRow title="Ulangi suara alarm" description="Ulangi suara sampai pengingat ditangani.">
                  <Toggle label="Ulangi suara alarm" checked={sound.settings.repeat} onChange={sound.setRepeat} />
                </SettingRow>

                {(
                  [
                    ["pomodoro", "Pomodoro"],
                    ["water", "Water Reminder"],
                    ["task", "Task"],
                    ["message", "Message"],
                  ] as const satisfies readonly [AlarmKind, string][]
                ).map(([kind, label]) => (
                  <SettingRow key={kind} title={`Suara ${label}`} description="Pilih suara notifikasi, lalu tekan Preview untuk mendengarkan.">
                    <div className="flex items-center gap-2">
                      <select className={controlClass} value={sound.settings.sounds[kind]} onChange={(event) => sound.setSound(kind, event.target.value as AlarmSound)}>
                        <option value="beep">Beep</option>
                        <option value="chime">Chime</option>
                        <option value="bell">Bell</option>
                        <option value="digital">Digital</option>
                        <option value="pop">Pop</option>
                        <option value="off">Off</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => sound.play(kind)}
                        disabled={sound.settings.sounds[kind] === "off" || sound.settings.volume <= 0}
                        aria-label={`Preview suara ${label}`}
                        className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ▶ Preview
                      </button>
                    </div>
                  </SettingRow>
                ))}

                <div className="mb-3 mt-7 border-b border-white/10 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/55">Water Reminder</h3>
                </div>

                <SettingRow title="Aktifkan pengingat minum">
                  <Toggle label="Water Reminder" checked={settings.features.waterReminder.enabled} onChange={(value) => updateFeature("waterReminder", { ...settings.features.waterReminder, enabled: value })} />
                </SettingRow>

                <SettingRow title="Mode pengingat">
                  <select className={controlClass} value={settings.features.waterReminder.mode} onChange={(event) => updateFeature("waterReminder", { ...settings.features.waterReminder, mode: event.target.value as "smart" | "fixed" })}>
                    <option value="smart">Smart</option>
                    <option value="fixed">Fixed interval</option>
                  </select>
                </SettingRow>

                <SettingRow title="Interval" description="Jeda pengingat dalam menit.">
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    className={`${controlClass} w-24`}
                    value={settings.features.waterReminder.intervalMin}
                    onChange={(event) => updateFeature("waterReminder", { ...settings.features.waterReminder, intervalMin: Math.max(1, Number(event.target.value)) })}
                  />
                </SettingRow>

                <SettingRow title="Target harian" description="Target konsumsi air dalam mililiter.">
                  <input
                    type="number"
                    min="1000"
                    max="4000"
                    step="100"
                    className={`${controlClass} w-24`}
                    value={settings.features.waterReminder.goalMl}
                    onChange={(event) => updateFeature("waterReminder", { ...settings.features.waterReminder, goalMl: Number(event.target.value) })}
                  />
                </SettingRow>

                <SettingRow title="Ukuran gelas" description="Jumlah air yang dihitung setiap kali kamu mencatat minum.">
                  <select
                    className={controlClass}
                    value={settings.features.waterReminder.glassMl}
                    onChange={(event) =>
                      updateFeature("waterReminder", {
                        ...settings.features.waterReminder,
                        glassMl: Number(event.target.value),
                      })
                    }
                  >
                    <option value={150}>150 ml</option>
                    <option value={250}>250 ml</option>
                    <option value={350}>350 ml</option>
                    <option value={500}>500 ml</option>
                  </select>
                </SettingRow>

                <SettingRow title="Mulai pengingat" description="Jam mulai pengingat minum aktif.">
                  <select
                    className={controlClass}
                    value={settings.features.waterReminder.startHour}
                    onChange={(event) => {
                      const startHour = Math.min(20, Math.max(0, Number(event.target.value)));
                      const endHour = Math.min(24, Math.max(settings.features.waterReminder.endHour, startHour + 4));

                      updateFeature("waterReminder", {
                        ...settings.features.waterReminder,
                        startHour,
                        endHour,
                      });
                    }}
                  >
                    {Array.from({ length: 21 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {`${String(hour).padStart(2, "0")}:00`}
                      </option>
                    ))}
                  </select>
                </SettingRow>

                <SettingRow title="Akhir pengingat" description="Jam terakhir pengingat minum aktif.">
                  <select
                    className={controlClass}
                    value={settings.features.waterReminder.endHour}
                    onChange={(event) =>
                      updateFeature("waterReminder", {
                        ...settings.features.waterReminder,
                        endHour: Math.min(24, Math.max(settings.features.waterReminder.startHour + 4, Number(event.target.value))),
                      })
                    }
                  >
                    {Array.from({ length: 21 - settings.features.waterReminder.startHour }, (_, index) => settings.features.waterReminder.startHour + 4 + index).map((hour) => (
                      <option key={hour} value={hour}>
                        {`${String(hour).padStart(2, "0")}:00`}
                      </option>
                    ))}
                  </select>
                </SettingRow>

                <div className="mb-3 mt-7 border-b border-white/10 pb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/55">Clipboard Manager</h3>
                </div>

                <SettingRow title="Aktifkan Clipboard Manager" description="Aktifkan fitur pengelolaan riwayat teks clipboard.">
                  <Toggle
                    label="Clipboard Manager"
                    checked={settings.features.clipboard.enabled}
                    onChange={(value) =>
                      updateFeature("clipboard", {
                        ...settings.features.clipboard,
                        enabled: value,
                      })
                    }
                  />
                </SettingRow>

                <SettingRow title="Maksimal riwayat" description="Jumlah item clipboard yang disimpan. Item yang disematkan tidak ikut dihapus oleh batas ini.">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="500"
                      className={`${controlClass} w-24`}
                      value={settings.features.clipboard.maxItems}
                      onChange={(event) => {
                        const value = Number(event.target.value);

                        if (!Number.isFinite(value)) return;

                        updateFeature("clipboard", {
                          ...settings.features.clipboard,
                          maxItems: Math.min(500, Math.max(1, Math.floor(value))),
                        });
                      }}
                    />
                    <span className="text-xs text-white/35">items</span>
                  </div>
                </SettingRow>

                <p className="mt-3 rounded-lg border border-white/5 bg-white/[0.025] p-3 text-xs leading-relaxed text-white/40">Clipboard Manager hanya menyimpan teks. Data disimpan secara lokal di perangkat dan tidak dikirim ke server.</p>

                <p className="py-3 text-xs leading-relaxed text-white/35">Clipboard, Launcher, Notifications, dan Focus merupakan konfigurasi fitur roadmap. Pengaturan tersedia setelah implementasi fiturnya dimulai.</p>
              </section>
            )}

            {activeSection === "shortcuts" && (
              <section>
                <SectionHeading title="Keyboard shortcuts" description="Atur pintasan keyboard global untuk mengontrol Mochi dari aplikasi mana pun." />

                {shortcutError && (
                  <div role="alert" className="mb-4 rounded-lg border border-hot/20 bg-hot/5 px-3 py-2">
                    <p className="text-xs text-hot">{shortcutError}</p>
                  </div>
                )}

                {SHORTCUT_ITEMS.map(([key, label, description]) => (
                  <SettingRow key={key} title={label} description={description}>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShortcutError(null);
                          setCapturingShortcut(key);
                        }}
                        onKeyDown={(event) => handleShortcutKeyDown(event, key)}
                        onBlur={() => {
                          if (capturingShortcut === key) {
                            setCapturingShortcut(null);
                          }
                        }}
                        className={`${controlClass} w-44 text-center ${capturingShortcut === key ? "border-accent/70 bg-accent/10 text-accent" : ""}`}
                      >
                        {capturingShortcut === key ? "Tekan kombinasi..." : (settings.shortcuts[key] ?? "Belum diatur")}
                      </button>

                      {settings.shortcuts[key] && (
                        <button
                          type="button"
                          aria-label={`Hapus shortcut ${label}`}
                          onClick={() => {
                            setShortcutError(null);
                            updateShortcut(key, null);
                          }}
                          className="rounded-lg px-2 py-2 text-xs text-white/35 transition-colors hover:bg-hot/10 hover:text-hot"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </SettingRow>
                ))}
              </section>
            )}

            {activeSection === "privacy" && (
              <section>
                <SectionHeading title="Privasi dan data" description="Kendalikan akses dan penyimpanan data lokal." />

                <SettingRow title="Clipboard capture" description="Izinkan Mochi menangkap dan menyimpan riwayat teks clipboard.">
                  <Toggle label="Clipboard capture" checked={settings.privacy.clipboardCaptureEnabled} onChange={(value) => updatePrivacy("clipboardCaptureEnabled", value)} />
                </SettingRow>

                <SettingRow title="Notification access" description="Izinkan akses ke sumber notifikasi Windows.">
                  <Toggle label="Notification access" checked={settings.privacy.notificationAccessEnabled} onChange={(value) => updatePrivacy("notificationAccessEnabled", value)} />
                </SettingRow>

                <SettingRow title="Retensi data" description="Masa penyimpanan riwayat clipboard dalam hari.">
                  <select className={controlClass} value={settings.privacy.retentionDays ?? "unlimited"} onChange={(event) => updatePrivacy("retentionDays", event.target.value === "unlimited" ? null : Number(event.target.value))}>
                    <option value="7">7 hari</option>
                    <option value="14">14 hari</option>
                    <option value="30">30 hari</option>
                    <option value="90">90 hari</option>
                    <option value="unlimited">Tanpa batas</option>
                  </select>
                </SettingRow>

                <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.025] p-4">
                  <div>
                    <p className="text-xs font-medium text-white/80">Pengecualian aplikasi</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/40">Clipboard tidak akan direkam ketika aplikasi yang sedang aktif termasuk dalam daftar ini. Masukkan nama executable, misalnya password-manager.exe.</p>
                  </div>

                  <form
                    className="mt-4 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleAddExcludedApp();
                    }}
                  >
                    <input
                      type="text"
                      value={excludedAppInput}
                      onChange={(event) => setExcludedAppInput(event.target.value)}
                      placeholder="Contoh: password-manager.exe"
                      className={`${controlClass} min-w-0 flex-1`}
                      aria-label="Nama aplikasi yang dikecualikan"
                    />

                    <button
                      type="submit"
                      disabled={!excludedAppInput.trim()}
                      className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Tambah
                    </button>
                  </form>

                  <div className="mt-4 space-y-2">
                    {settings.privacy.excludedApps.length === 0 ? (
                      <p className="py-3 text-center text-xs text-white/30">Belum ada aplikasi yang dikecualikan.</p>
                    ) : (
                      settings.privacy.excludedApps.map((appName) => (
                        <div key={appName} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/10 px-3 py-2">
                          <span className="min-w-0 truncate text-xs text-white/70">{appName}</span>

                          <button
                            type="button"
                            onClick={() => handleRemoveExcludedApp(appName)}
                            aria-label={`Hapus pengecualian ${appName}`}
                            className="shrink-0 rounded-md px-2 py-1 text-xs text-white/35 transition-colors hover:bg-hot/10 hover:text-hot"
                          >
                            Hapus
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <p className="mt-3 text-[10px] text-white/30">{settings.privacy.excludedApps.length} aplikasi dikecualikan</p>
                </div>
              </section>
            )}

            {activeSection === "data" && (
              <section>
                <SectionHeading title="Data Management" description="Kelola konfigurasi Mochi melalui file JSON. Simpan konfigurasi sebagai backup atau pindahkan ke perangkat lain." />

                {/* Export configuration */}
                <div className="mb-6 rounded-xl border border-white/5 bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-white/85">Export configuration</h3>
                      <p className="mt-1 max-w-md text-xs leading-relaxed text-white/40">Simpan seluruh konfigurasi Mochi saat ini ke file JSON.</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleExportSettings()}
                      disabled={dataBusy || saving}
                      className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Export JSON
                    </button>
                  </div>
                </div>

                {/* Import configuration */}
                <div className="rounded-xl border border-white/5 bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-white/85">Import configuration</h3>
                      <p className="mt-1 max-w-md text-xs leading-relaxed text-white/40">Pulihkan konfigurasi dari file JSON. File akan divalidasi dan ditampilkan terlebih dahulu sebelum diterapkan.</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handlePreviewImport()}
                      disabled={dataBusy || saving}
                      className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/75 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Select JSON
                    </button>
                  </div>

                  {importPreview && (
                    <div className="mt-5 rounded-lg border border-accent/20 bg-accent/[0.04] p-4">
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-accent">Import preview</p>
                        <p className="mt-1 text-[11px] text-white/40">File berhasil dibaca dan lolos validasi.</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-black/20 p-3">
                          <p className="text-[10px] text-white/35">Configuration version</p>
                          <p className="mt-1 text-sm font-medium text-white/80">{importPreview.version}</p>
                        </div>

                        <div className="rounded-lg bg-black/20 p-3">
                          <p className="text-[10px] text-white/35">Theme</p>
                          <p className="mt-1 text-sm font-medium capitalize text-white/80">{importPreview.appearance.theme}</p>
                        </div>

                        <div className="rounded-lg bg-black/20 p-3">
                          <p className="text-[10px] text-white/35">Configured shortcuts</p>
                          <p className="mt-1 text-sm font-medium text-white/80">{Object.values(importPreview.shortcuts).filter(Boolean).length}</p>
                        </div>

                        <div className="rounded-lg bg-black/20 p-3">
                          <p className="text-[10px] text-white/35">Startup</p>
                          <p className="mt-1 text-sm font-medium text-white/80">{importPreview.general.launchAtStartup ? "Enabled" : "Disabled"}</p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-lg border border-hot/15 bg-hot/[0.04] p-3">
                        <p className="text-xs font-medium text-hot">Perhatian</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-white/45">Konfigurasi aktif akan digantikan. Mochi akan membuat backup otomatis sebelum perubahan diterapkan.</p>
                      </div>

                      <div className="mt-4 flex justify-end gap-2">
                        <button type="button" onClick={handleCancelImport} disabled={dataBusy} className="rounded-lg px-4 py-2 text-xs text-white/50 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40">
                          Cancel
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleConfirmImport()}
                          disabled={dataBusy || saving}
                          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {dataBusy ? "Applying..." : "Apply configuration"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Operation status */}
                {dataError && (
                  <div role="alert" className="mt-4 rounded-lg border border-hot/20 bg-hot/5 p-3">
                    <p className="text-xs leading-relaxed text-hot">{dataError}</p>
                  </div>
                )}

                {dataNotice && (
                  <div role="status" className="mt-4 rounded-lg border border-accent/20 bg-accent/5 p-3">
                    <p className="text-xs leading-relaxed text-accent">{dataNotice}</p>
                  </div>
                )}

                {dataBusy && <p className="mt-4 text-[11px] text-white/35">Sedang memproses konfigurasi...</p>}
              </section>
            )}

            {activeSection === "about" && (
              <section>
                <div className="mb-8 flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.025] p-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-3xl text-accent">✳</div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Mochi</h3>
                    <p className="mt-1 text-xs text-white/40">Modular On-device Companion for Human Interaction</p>
                    <p className="mt-2 text-[10px] text-accent">Version 0.1.1</p>
                  </div>
                </div>

                <SectionHeading title="Tentang aplikasi" description="Mochi adalah productivity companion yang berjalan secara lokal di desktop." />

                <SettingRow title="Platform">
                  <span className="text-xs text-white/50">Windows Desktop</span>
                </SettingRow>
                <SettingRow title="Configuration version">
                  <span className="text-xs tabular-nums text-white/50">{settings.version}</span>
                </SettingRow>
                <SettingRow title="Storage">
                  <span className="text-xs text-white/50">Local device</span>
                </SettingRow>
              </section>
            )}

            {error && (
              <div className="mt-6 flex items-start justify-between gap-3 rounded-lg border border-hot/20 bg-hot/5 p-3">
                <p className="text-xs leading-relaxed text-hot">{error}</p>
                <button type="button" onClick={() => void reloadSettings()} className="shrink-0 text-xs text-white/60 hover:text-white">
                  Muat ulang
                </button>
              </div>
            )}

            <div className="mt-10 border-t border-white/5 pt-4">
              <p className="text-[10px] leading-relaxed text-white/25">Perubahan disimpan otomatis ke konfigurasi lokal Mochi.</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
