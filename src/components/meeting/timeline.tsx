"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime, speakerColor } from "@/lib/format";
import type { Segment } from "@/lib/types";
import type { SpeakerInfo } from "./meeting-view";

const DEFAULT_BARS = 140;

interface Marker {
  t: number;
  label: string;
}

// Deterministic jitter so the waveform looks organic but never changes between renders.
function jitter(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// A "conversation waveform": each bar is a slice of the meeting, coloured by who spoke most in it
// and sized by how many words were said. Built from the transcript, so it works for any length.
function buildBars(segments: Segment[], duration: number, count: number) {
  const width = duration / count;
  const bars = Array.from({ length: count }, () => ({ words: 0, bySpeaker: new Map<string, number>() }));
  for (const s of segments) {
    const len = Math.max(0.1, s.end_s - s.start_s);
    const words = s.text.split(/\s+/).length;
    const first = Math.max(0, Math.floor(s.start_s / width));
    const last = Math.min(count - 1, Math.floor(Math.max(s.start_s, s.end_s - 0.01) / width));
    for (let b = first; b <= last; b++) {
      const overlap = Math.min(s.end_s, (b + 1) * width) - Math.max(s.start_s, b * width);
      if (overlap <= 0) continue;
      bars[b].words += (words * overlap) / len;
      bars[b].bySpeaker.set(s.speaker, (bars[b].bySpeaker.get(s.speaker) ?? 0) + overlap);
    }
  }
  // Normalise against the busy end (90th percentile), not the single peak, so long meetings keep contrast.
  const busy = bars.map((b) => b.words).filter(Boolean).sort((a, b) => a - b);
  const ref = Math.max(1, busy[Math.floor(busy.length * 0.9)] ?? 1);
  return bars.map((b, i) => {
    let speaker: string | null = null;
    let best = 0;
    for (const [label, secs] of b.bySpeaker) if (secs > best) [speaker, best] = [label, secs];
    const level = b.words ? 0.1 + 0.9 * Math.min(1, b.words / ref) ** 1.4 : 0.05;
    // Rounded so server and browser render identical values (no hydration mismatch).
    return { speaker, height: Math.round(Math.min(1, level * (0.8 + jitter(i) * 0.4)) * 1000) / 10 };
  });
}

export function Timeline({
  segments,
  speakerInfo,
  duration,
  time,
  playing,
  rate,
  hasMedia,
  chapters,
  highlights,
  actions,
  onSeek,
  onToggle,
  onRate,
}: {
  segments: Segment[];
  speakerInfo: Map<string, SpeakerInfo>;
  duration: number;
  time: number;
  playing: boolean;
  rate: number;
  hasMedia: boolean;
  chapters: Marker[];
  highlights: Marker[];
  actions: Marker[];
  onSeek: (t: number, play?: boolean) => void;
  onToggle: () => void;
  onRate: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // About one bar per 5 px, so the waveform stays legible from phones to wide screens.
  const [count, setCount] = useState(DEFAULT_BARS);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setCount(Math.max(48, Math.min(220, Math.floor(entry.contentRect.width / 5)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const bars = useMemo(() => buildBars(segments, duration || 1, count), [segments, duration, count]);
  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / (duration || 1)) * 100))}%`;

  const timeAt = (clientX: number) => {
    const box = track.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - box.left) / box.width) * duration));
  };

  const speakingNow = segments.find((s) => s.start_s <= time && time < s.end_s + 0.5);
  const now = speakingNow ? speakerInfo.get(speakingNow.speaker) : undefined;
  const chapterAt = (t: number) => [...chapters].reverse().find((c) => c.t <= t)?.label;

  return (
    <div className="px-4 pb-4 pt-5 sm:px-5">
      {/* Markers above the waveform: chapters (ticks) and highlights (lime diamonds) */}
      <div className="relative mb-1.5 h-3">
        {chapters.map((c) => (
          <button
            key={`c${c.t}`}
            type="button"
            title={`${formatTime(c.t)} · ${c.label}`}
            onClick={() => onSeek(c.t)}
            className="absolute top-0 h-3 w-px -translate-x-1/2 bg-muted-foreground/50 hover:bg-foreground"
            style={{ left: pct(c.t) }}
          />
        ))}
        {highlights.map((h) => (
          <button
            key={`h${h.t}`}
            type="button"
            title={`Highlight · ${h.label}`}
            onClick={() => onSeek(h.t)}
            className="absolute top-0.5 size-2 -translate-x-1/2 rotate-45 bg-brand shadow-[0_0_8px_var(--brand)]"
            style={{ left: pct(h.t) }}
          />
        ))}
      </div>

      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Meeting timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={formatTime(time)}
        className="relative h-20 cursor-pointer touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-md"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          onSeek(timeAt(e.clientX), false);
        }}
        onPointerMove={(e) => {
          const t = timeAt(e.clientX);
          setHover(t);
          if (dragging) onSeek(t, false);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => !dragging && setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onSeek(Math.min(duration, time + 5), false);
          if (e.key === "ArrowLeft") onSeek(Math.max(0, time - 5), false);
          if (e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="absolute inset-0 flex items-center gap-px sm:gap-[2px]">
          {bars.map((b, i) => {
            const played = ((i + 0.5) / count) * duration <= time;
            const info = b.speaker ? speakerInfo.get(b.speaker) : undefined;
            return (
              <span
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-opacity duration-300",
                  info ? speakerColor(info.order).dot : "bg-muted-foreground/40",
                  played ? "opacity-100" : "opacity-40",
                )}
                style={{ height: `${b.height}%` }}
              />
            );
          })}
        </div>
        {/* playhead */}
        <div className="pointer-events-none absolute inset-y-[-6px] w-0.5 -translate-x-1/2 rounded-full bg-brand shadow-[0_0_14px_var(--brand)]" style={{ left: pct(time) }} />
        {hover !== null && (
          <>
            <div className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-foreground/40" style={{ left: pct(hover) }} />
            <div
              className="pointer-events-none absolute -top-9 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 font-mono text-[11px] shadow-lg"
              style={{ left: pct(hover) }}
            >
              {formatTime(hover)}
              {chapterAt(hover) && <span className="ml-1.5 font-sans text-muted-foreground">{chapterAt(hover)}</span>}
            </div>
          </>
        )}
      </div>

      {/* Action items under the waveform */}
      <div className="relative mt-1.5 h-2.5">
        {actions.map((a, i) => (
          <button
            key={`a${i}`}
            type="button"
            title={`Action item · ${a.label}`}
            onClick={() => onSeek(a.t)}
            className="absolute top-0 size-2 -translate-x-1/2 rounded-full border border-warn bg-warn/30 hover:bg-warn"
            style={{ left: pct(a.t) }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {hasMedia && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSeek(Math.max(0, time - 15))}
              className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Back 15 seconds"
            >
              <RotateCcw className="size-4" />
            </button>
            <button
              type="button"
              onClick={onToggle}
              className="grid size-11 place-items-center rounded-full bg-brand text-brand-foreground shadow-[0_0_24px_-4px_var(--brand)] transition hover:scale-105 active:scale-95"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
            </button>
            <button
              type="button"
              onClick={() => onSeek(Math.min(duration, time + 15))}
              className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Forward 15 seconds"
            >
              <RotateCw className="size-4" />
            </button>
          </div>
        )}
        <span className="font-mono text-sm tabular-nums">
          {formatTime(time)} <span className="text-muted-foreground">/ {formatTime(duration)}</span>
        </span>
        {hasMedia && (
          <button
            type="button"
            onClick={onRate}
            className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground hover:border-brand/50 hover:text-foreground"
            aria-label="Playback speed"
          >
            {rate}×
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm">
          {now ? (
            <>
              <span className={cn("size-2 rounded-full", speakerColor(now.order).dot, playing && "live-dot")} />
              <span className="label-mono !normal-case !tracking-normal">speaking</span>
              <span className={cn("font-medium", speakerColor(now.order).text)}>{now.name}</span>
            </>
          ) : (
            <span className="label-mono">{hasMedia ? "silence" : "transcript only"}</span>
          )}
        </div>
      </div>
    </div>
  );
}
