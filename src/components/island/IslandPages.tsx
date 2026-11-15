import type { IslandController } from "../../hooks/useIslandController";
import ControlButton from "./ControlButton";
import IslandShelf from "./IslandShelf";
import { LyricsInline, LyricsScroll } from "./LyricsScroll";
import PomodoroView from "./PomodoroView";
import ProgressBar from "./ProgressBar";
import SoundView from "./SoundView";
import SystemView from "./SystemView";
import TasksView from "./Taskview";
import WaterView from "./WaterView";

function MediaPage({ c }: { c: IslandController }) {
  const { media, playback, layout, lyrics } = c;

  if (!media) return <span className="text-sm text-white/60">Tidak ada media</span>;

  const artwork = media.artwork ? <img src={media.artwork} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : <div className="h-9 w-9 shrink-0 rounded-lg bg-white/10" />;

  const progress = playback && playback.durationMs > 0 ? <ProgressBar playback={playback} onSeek={c.seekTo} compact={layout === "side"} /> : <div className="h-1" />;

  const controls = (
    <div className="flex items-center justify-center gap-4">
      <ControlButton label="Sebelumnya" onPress={() => c.sendMediaAction("previous")}>
        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
      </ControlButton>

      <ControlButton label={playback?.isPlaying ? "Jeda" : "Putar"} onPress={() => c.sendMediaAction("playPause")}>
        {playback?.isPlaying ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <path d="M8 5v14l11-7z" />}
      </ControlButton>

      <ControlButton label="Berikutnya" onPress={() => c.sendMediaAction("next")}>
        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
      </ControlButton>
    </div>
  );

  if (layout === "side") {
    return (
      <div className="flex h-full w-full gap-3">
        <div className="flex w-37.5 shrink-0 flex-col justify-center gap-1 py-1.5">
          <div className="flex items-center gap-2.5">
            {artwork}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{media.title}</span>
              <span className="truncate text-xs text-white/60">{media.artist}</span>
            </div>
          </div>
          {progress}
          {controls}
        </div>

        <div className="min-w-0 flex-1 py-2">
          <LyricsScroll lines={lyrics ?? []} playback={playback} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1 py-1">
      <div className="flex items-center gap-3">
        {artwork}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold">{media.title}</span>
          <span className="truncate text-[11px] text-white/60">{media.artist}</span>
        </div>
      </div>

      {/* Lirik di atas progress bar */}
      {layout === "inline" && <LyricsInline lines={lyrics ?? []} playback={playback} />}

      {progress}

      {controls}
    </div>
  );
}

/** Isi halaman island yang sedang dipilih. Dipakai bersama oleh semua gaya tampilan. */
export default function IslandPages({ c }: { c: IslandController }) {
  switch (c.view) {
    case "media":
      return <MediaPage c={c} />;
    case "system":
      return <SystemView stats={c.stats} />;
    case "pomodoro":
      return (
        <PomodoroView
          mode={c.mode}
          modeLocked={c.timer.running}
          phase={c.timerPhase}
          remainingMs={c.timer.remainingMs}
          running={c.timer.running}
          alerting={c.alerting}
          flowRatio={c.flowRatio}
          breakTotalMs={c.flow.breakTotalMs}
          onModeChange={c.setMode}
          onRatioChange={c.setFlowRatio}
          onToggle={c.togglePomodoro}
          onReset={c.timer.reset}
          onSkip={c.skipPhase}
        />
      );
    case "water":
      return <WaterView water={c.alarms.water} />;
    case "tasks":
      return <TasksView api={c.alarms.tasks} />;
    case "sound":
      return <SoundView sound={c.alarms.sound} />;
    case "shelf":
      return <IslandShelf active={c.state === "expanded"} version={c.shelf.version} dragging={c.shelf.draggingFile} importer={c.shelf.importer} />;
  }
}
