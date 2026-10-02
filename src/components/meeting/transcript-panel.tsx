"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BraceLabel } from "@/components/logo";
import { ChevronDown, ChevronUp, LocateFixed, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime, speakerColor } from "@/lib/format";
import type { Segment } from "@/lib/types";
import type { SpeakerInfo } from "./meeting-view";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const Line = memo(function Line({
  segment,
  name,
  colorClass,
  showSpeaker,
  active,
  current,
  query,
  onSeek,
}: {
  segment: Segment;
  name: string;
  colorClass: string;
  showSpeaker: boolean;
  active: boolean;
  current: boolean;
  query: string;
  onSeek: (t: number) => void;
}) {
  const parts = query ? segment.text.split(new RegExp(`(${escapeRegExp(query)})`, "gi")) : [segment.text];
  return (
    <div
      data-idx={segment.idx}
      className={cn(
        "group relative cursor-pointer rounded-lg border-l-2 px-3 py-1.5 transition-colors",
        active ? "border-brand bg-brand-soft" : "border-transparent hover:bg-foreground/[0.04]",
        current && "ring-1 ring-warn/70",
      )}
      onClick={() => onSeek(segment.start_s)}
    >
      {showSpeaker && (
        <div className="mb-0.5 mt-2 flex items-baseline gap-2">
          <span className={cn("font-mono text-[11px] font-semibold uppercase tracking-wider", colorClass)}>{name}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{formatTime(segment.start_s)}</span>
        </div>
      )}
      <p className={cn("text-[13.5px] leading-relaxed", active ? "text-foreground" : "text-foreground/80")}>
        {parts.map((p, i) =>
          i % 2 === 1 ? (
            <mark key={i} className="rounded bg-warn-soft px-0.5 text-foreground">
              {p}
            </mark>
          ) : (
            p
          ),
        )}
      </p>
    </div>
  );
});

export function TranscriptPanel({
  segments,
  speakerInfo,
  activeIdx,
  jumpSignal,
  onSeek,
}: {
  segments: Segment[];
  speakerInfo: Map<string, SpeakerInfo>;
  activeIdx: number;
  jumpSignal: number;
  onSeek: (t: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState("");
  const [matchCursor, setMatchCursor] = useState(0);
  const [lastJump, setLastJump] = useState(jumpSignal);
  if (jumpSignal !== lastJump) {
    // A new seek from outside (chapter, action item, player): resume following playback.
    setLastJump(jumpSignal);
    setFollow(true);
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q.length < 2 ? [] : segments.filter((s) => s.text.toLowerCase().includes(q)).map((s) => s.idx);
  }, [query, segments]);
  const currentMatch = matches.length ? matches[matchCursor % matches.length] : -1;

  function scrollTo(idx: number, smooth = true) {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
    if (!el || !scroller.current) return;
    const box = scroller.current;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 3, behavior: smooth ? "smooth" : "auto" });
  }

  // Follow playback; an explicit seek always scrolls and turns following back on.
  useEffect(() => {
    if (follow && activeIdx >= 0) scrollTo(activeIdx);
  }, [activeIdx, follow]);
  useEffect(() => {
    if (currentMatch >= 0) scrollTo(currentMatch);
  }, [currentMatch]);

  function step(dir: 1 | -1) {
    if (!matches.length) return;
    setFollow(false);
    setMatchCursor((c) => (c + dir + matches.length) % matches.length);
  }

  return (
    <div className="panel flex h-[70vh] flex-col overflow-hidden lg:h-full">
      <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
        <BraceLabel>transcript · {segments.length} turns</BraceLabel>
        <span className={cn("label-mono flex items-center gap-1.5", follow ? "!text-brand" : "")}>
          <span className={cn("size-1.5 rounded-full", follow ? "bg-brand live-dot" : "bg-muted-foreground")} />
          {follow ? "following" : "paused"}
        </span>
      </div>
      <div className="flex items-center gap-2 border-b border-border p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMatchCursor(0);
              setFollow(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") step(e.shiftKey ? -1 : 1);
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Search transcript"
            aria-label="Search transcript"
            className="h-8 w-full rounded-lg border border-border bg-panel-2/70 pl-8 pr-2 text-sm outline-none focus:border-brand/50"
          />
        </div>
        {query.trim().length >= 2 && (
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
            <span className="min-w-12 text-center tabular-nums">
              {matches.length ? `${(matchCursor % matches.length) + 1}/${matches.length}` : "0/0"}
            </span>
            <button type="button" onClick={() => step(-1)} aria-label="Previous match" className="rounded p-1 hover:bg-muted">
              <ChevronUp className="size-4" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next match" className="rounded p-1 hover:bg-muted">
              <ChevronDown className="size-4" />
            </button>
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="rounded p-1 hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={scroller}
        className="scroll-thin relative flex-1 overflow-y-auto p-2"
        onWheel={() => setFollow(false)}
        onTouchMove={() => setFollow(false)}
      >
        {segments.map((s, i) => {
          const info = speakerInfo.get(s.speaker);
          return (
            <Line
              key={s.idx}
              segment={s}
              name={info?.name ?? s.speaker}
              colorClass={speakerColor(info?.order ?? 0).text}
              showSpeaker={i === 0 || segments[i - 1].speaker !== s.speaker || s.start_s - segments[i - 1].end_s > 30}
              active={s.idx === activeIdx}
              current={s.idx === currentMatch}
              query={query.trim().length >= 2 ? query.trim() : ""}
              onSeek={onSeek}
            />
          );
        })}
      </div>

      {!follow && activeIdx >= 0 && (
        <button
          type="button"
          onClick={() => {
            setFollow(true);
            scrollTo(activeIdx);
          }}
          className="m-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground shadow-[0_0_20px_-6px_var(--brand)]"
        >
          <LocateFixed className="size-3.5" /> Back to current moment
        </button>
      )}
    </div>
  );
}
