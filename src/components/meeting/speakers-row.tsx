"use client";

import { useState } from "react";
import { BraceLabel } from "@/components/logo";
import { Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatTime, initials, speakerColor } from "@/lib/format";
import type { SpeakerGuess } from "@/lib/notes";
import type { Segment } from "@/lib/types";
import type { SpeakerInfo } from "./meeting-view";

export function SpeakersRow({
  meetingId,
  info,
  duration,
  onRenamed,
  guesses = {},
  speakers = {},
  segments = [],
}: {
  meetingId: string;
  info: Map<string, SpeakerInfo>;
  duration: number;
  onRenamed: (speakers: Record<string, string>) => void;
  guesses?: Record<string, SpeakerGuess>;
  speakers?: Record<string, string>;
  segments?: Segment[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const list = [...info.values()].sort((a, b) => b.seconds - a.seconds);
  const total = list.reduce((acc, s) => acc + s.seconds, 0) || duration || 1;

  async function save(label: string) {
    setEditing(null);
    const res = await fetch(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speakers: { [label]: draft } }),
    });
    if (!res.ok) return toast.error("Could not rename speaker");
    const { speakers } = await res.json();
    onRenamed(speakers);
  }

  return (
    <div className="border-t border-border px-4 py-3 sm:px-5">
      <div className="mb-2 flex items-center justify-between">
        <BraceLabel>speakers · talk time</BraceLabel>
        <p className="label-mono !normal-case !tracking-normal max-sm:hidden">click a name to rename · “cited” = named in the transcript · “guess” = AI suggestion</p>
      </div>
      <div className="mb-3 flex h-1 overflow-hidden rounded-full bg-muted">
        {list.map((s) => (
          <div key={s.label} className={speakerColor(s.order).dot} style={{ width: `${(s.seconds / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {list.map((s) => {
          const color = speakerColor(s.order);
          return (
            <div key={s.label} className="flex items-center gap-2 text-sm">
              <span className={cn("grid size-6 place-items-center rounded-full text-[10px] font-semibold text-background", color.dot)}>
                {initials(s.name)}
              </span>
              {editing === s.label ? (
                <form
                  className="flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(s.label);
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => setEditing(null)}
                    className="h-7 w-32 rounded-md border border-brand/40 bg-panel-2 px-2 text-sm outline-none"
                    aria-label="Speaker name"
                  />
                  <button type="submit" onMouseDown={(e) => e.preventDefault()} aria-label="Save name" className="text-brand">
                    <Check className="size-4" />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="group inline-flex items-center gap-1 font-medium"
                  onClick={() => {
                    setDraft(s.name.startsWith("Speaker ") ? "" : s.name);
                    setEditing(s.label);
                  }}
                  title="Rename speaker"
                >
                  {s.name}
                  {guesses[s.label] && speakers[s.label] === guesses[s.label].name && (() => {
                    const g = guesses[s.label];
                    const seg = segments[g.idx];
                    const cited = g.evidence !== "model";
                    return (
                      <span
                        className={cn(
                          "rounded border px-1 font-mono text-[9px] uppercase tracking-wider",
                          cited ? "border-brand/30 text-brand/80" : "border-warn/40 text-warn",
                        )}
                        title={
                          cited
                            ? `Named from the transcript (${g.evidence === "self" ? "self-introduction" : "addressed by name"}) at ${formatTime(seg?.start_s ?? 0)}: “${(seg?.text ?? "").slice(0, 90)}…”`
                            : "AI's guess: the transcript doesn't state this name. Click the name to correct it."
                        }
                      >
                        {cited ? "cited" : "guess"}
                      </span>
                    );
                  })()}
                  <Pencil className="size-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </button>
              )}
              <span className="font-mono text-[11px] text-muted-foreground">{Math.round((s.seconds / total) * 100)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
