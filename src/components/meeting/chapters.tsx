"use client";

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
  if (!chapters.length || !duration) return null;
  const items = chapters.map((c, i) => {
    const start = segments[c.idx]?.start_s ?? 0;
    const end = i + 1 < chapters.length ? (segments[chapters[i + 1].idx]?.start_s ?? duration) : duration;
    return { ...c, start, end };
  });

  return (
    <div className="border-t px-4 py-3">
      <div className="mb-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        {items.map((c) => (
          <button
            key={c.idx}
            type="button"
            aria-label={`Jump to ${c.title}`}
            onClick={() => onSeek(c.start)}
            style={{ flexGrow: Math.max(c.end - c.start, 1) }}
            className={cn("h-full transition-colors", time >= c.start && time < c.end ? "bg-brand" : "bg-muted hover:bg-brand/40")}
          />
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {items.map((c) => {
          const active = time >= c.start && time < c.end;
          return (
            <button
              key={c.idx}
              type="button"
              onClick={() => onSeek(c.start)}
              className={cn(
                "shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-xs transition",
                active ? "border-brand/40 bg-brand-soft" : "hover:bg-muted",
              )}
            >
              <span className="font-mono text-muted-foreground">{formatTime(c.start)}</span>{" "}
              <span className="font-medium">{c.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
