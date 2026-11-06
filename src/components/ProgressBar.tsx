import { useEffect, useRef, useState } from "react";

export type PlaybackState = {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  receivedAt: number;
};

type Props = {
  playback: PlaybackState;
  onSeek: (positionMs: number) => void;
  /** Tanpa label waktu, bar lebih tipis. Untuk island yang ringkas. */
  compact?: boolean;
};

function currentPosition(p: PlaybackState): number {
  const elapsed = p.isPlaying ? performance.now() - p.receivedAt : 0;
  return Math.min(p.durationMs, p.positionMs + elapsed);
}

// Format Spotify: 0:05, 3:45, dan 1:02:09 untuk yang lebih dari satu jam.
function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = seconds.toString().padStart(2, "0");

  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}

export default function ProgressBar({ playback, onSeek, compact = false }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null);

  const [position, setPosition] = useState(() => currentPosition(playback));
  const [dragMs, setDragMs] = useState<number | null>(null);
  const [showRemaining, setShowRemaining] = useState(false);

  // Ikuti posisi lagu saat tidak sedang digeser.
  useEffect(() => {
    if (dragMs !== null) return;

    setPosition(currentPosition(playback));
    if (!playback.isPlaying) return;

    let frame = 0;
    const loop = () => {
      setPosition(currentPosition(playback));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(frame);
  }, [playback, dragMs]);

  function msFromPointer(clientX: number): number {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * playback.durationMs;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ms = msFromPointer(e.clientX);
    dragRef.current = ms;
    setDragMs(ms);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current === null) return;
    const ms = msFromPointer(e.clientX);
    dragRef.current = ms;
    setDragMs(ms);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (dragRef.current === null) return;

    onSeek(dragRef.current);
    dragRef.current = null;
    setDragMs(null);
  }

  const shown = dragMs ?? position;
  const percent = playback.durationMs > 0 ? (shown / playback.durationMs) * 100 : 0;
  const remaining = Math.max(0, playback.durationMs - shown);

  return (
    // stopPropagation supaya klik di area ini tidak menutup island
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {/* Waktu berjalan */}
      {!compact && <span className="w-9 shrink-0 text-right text-[11px] font-medium tabular-nums text-white/70">{formatTime(shown)}</span>}

      {/* Area sentuh lebih tinggi dari bar-nya supaya mudah diklik */}
      <div
        ref={trackRef}
        title={compact ? `${formatTime(shown)} / ${formatTime(playback.durationMs)}` : undefined}
        className={`group relative flex flex-1 cursor-pointer touch-none items-center ${compact ? "h-3" : "h-4"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className={`relative w-full rounded-full bg-white/20 ${compact ? "h-[3px]" : "h-1"}`}>
          <div className={`absolute inset-y-0 left-0 rounded-full transition-colors ${dragMs !== null ? "bg-white" : "bg-white/90 group-hover:bg-white"}`} style={{ width: `${percent}%` }} />
          <div
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-opacity ${compact ? "h-2.5 w-2.5" : "h-3 w-3"} ${dragMs !== null ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            style={{ left: `${percent}%` }}
          />
        </div>
      </div>

      {/* Durasi total, klik untuk berganti ke sisa waktu */}
      {!compact && (
        <button
          type="button"
          title={showRemaining ? "Tampilkan durasi total" : "Tampilkan sisa waktu"}
          onClick={() => setShowRemaining((v) => !v)}
          className="w-10 shrink-0 cursor-pointer text-left text-[11px] font-medium tabular-nums text-white/70 hover:text-white"
        >
          {showRemaining ? `-${formatTime(remaining)}` : formatTime(playback.durationMs)}
        </button>
      )}
    </div>
  );
}
