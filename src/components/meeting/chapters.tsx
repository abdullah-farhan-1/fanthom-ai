"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import type { Segment } from "@/lib/types";

export function Chapters({
  chapters,
  segments,
  duration,
  time,
  onSeek,
}: {
  chapters: { title: string; idx: number }[];
  segments: Segment[];
  duration: number;
  time: number;
  onSeek: (t: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const items = chapters.map((c, i) => {
    const start = segments[c.idx]?.start_s ?? 0;
    const end = i + 1 < chapters.length ? (segments[chapters[i + 1].idx]?.start_s ?? duration) : duration;
    return { ...c, start, end, n: i + 1 };
  });
  const activeIdx = items.findIndex((c) => time >= c.start && time < c.end);

  // Keep the current chapter in view as playback moves through a long meeting.
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-chapter="${activeIdx}"]`);
    if (el && strip.current) strip.current.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
  }, [activeIdx]);

  if (!items.length) return null;

  return (
    <div className="border-t border-border px-4 py-3 sm:px-5">
      <p className="label-mono mb-2">Chapters · {items.length}</p>
      <div ref={strip} className="scroll-thin flex gap-2 overflow-x-auto pb-1">
        {items.map((c, i) => {
          const active = i === activeIdx;
          return (
            <button
              key={c.idx}
              data-chapter={i}
              type="button"
              onClick={() => onSeek(c.start)}
              className={cn(
                "group relative shrink-0 overflow-hidden rounded-xl border px-3 py-2 text-left transition",
                active ? "border-brand/50 bg-brand-soft" : "border-border bg-panel-2/60 hover:border-foreground/20",
              )}
            >
              <span className="block font-mono text-[10px] text-muted-foreground">
                {String(c.n).padStart(2, "0")} · {formatTime(c.start)}
              </span>
              <span className={cn("block max-w-56 truncate text-sm", active && "text-brand")}>{c.title}</span>
              {active && (
                <span
                  className="absolute bottom-0 left-0 h-0.5 bg-brand"
                  style={{ width: `${((time - c.start) / Math.max(1, c.end - c.start)) * 100}%` }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
