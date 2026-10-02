"use client";

import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { formatTime } from "@/lib/format";

// Plays only [start, end] of a recording: starts at the clip, pauses at its end.
export function ClipPlayer({ src, start, end, video }: { src: string; start: number; end: number; video: boolean }) {
  const ref = useRef<HTMLMediaElement | null>(null);
  const [ended, setEnded] = useState(false);
  const props = {
    ref: (el: HTMLMediaElement | null) => {
      ref.current = el;
    },
    src: `${src}#t=${start},${end}`,
    controls: true,
    preload: "metadata" as const,
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      e.currentTarget.currentTime = start;
    },
    onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      const m = e.currentTarget;
      if (m.currentTime >= end) {
        m.pause();
        setEnded(true);
      } else if (m.currentTime < start - 0.5) {
        m.currentTime = start;
      }
    },
    onPlay: () => setEnded(false),
  };

  return (
    <div>
      {video ? <video {...props} playsInline className="aspect-video w-full bg-black" /> : <audio {...props} className="w-full p-4" />}
      {ended && (
        <button
          type="button"
          onClick={() => {
            if (!ref.current) return;
            ref.current.currentTime = start;
            ref.current.play();
          }}
          className="flex w-full items-center justify-center gap-1.5 border-t py-2 text-sm text-brand hover:bg-muted"
        >
          <RotateCcw className="size-4" /> Replay clip ({formatTime(end - start)})
        </button>
      )}
    </div>
  );
}
