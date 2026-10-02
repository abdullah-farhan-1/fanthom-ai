"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, Check, CheckCircle2, Copy, HelpCircle, Link2, Loader2, Play, Scissors, Sparkles, Trash2, Undo2, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime, ownerLabel, withNames } from "@/lib/format";
import { TEMPLATES, type TemplateKey } from "@/lib/templates";
import type { ActionItem, Summary } from "@/lib/notes";
import type { Highlight } from "@/lib/queries";
import type { Meeting, Segment } from "@/lib/types";

type Seek = (t: number) => void;

function TimeChip({ t, onSeek }: { t: number; onSeek: Seek }) {
  return (
    <button
      type="button"
      onClick={() => onSeek(t)}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-brand-soft hover:text-brand"
      title="Play from here"
    >
      <Play className="size-2.5 fill-current" /> {formatTime(t)}
    </button>
  );
}

function SummaryTab({ meeting, segments, speakers, onSeek }: { meeting: Meeting; segments: Segment[]; speakers: Record<string, string>; onSeek: Seek }) {
  const [template, setTemplate] = useState<TemplateKey>("general");
  const [cache, setCache] = useState<Partial<Record<TemplateKey, Summary>>>({});
  const [error, setError] = useState<string | null>(null);
  const summary = cache[template];

  useEffect(() => {
    if (cache[template]) return;
    let cancelled = false;
    fetch(`/api/meetings/${meeting.id}/summary?template=${template}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Summary failed");
        if (!cancelled) setCache((c) => ({ ...c, [template]: json.content }));
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [template, cache, meeting.id]);

  return (
    <div className="space-y-4">
      {meeting.notes?.overview && <p className="text-sm leading-relaxed">{withNames(meeting.notes.overview, speakers)}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Template</span>
        {(Object.keys(TEMPLATES) as TemplateKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setError(null);
              setTemplate(key);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition",
              key === template ? "border-brand bg-brand text-brand-foreground" : "hover:bg-muted",
            )}
          >
            {TEMPLATES[key].label}
          </button>
        ))}
      </div>
      {error ? (
        <div className="flex items-center gap-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              setCache((c) => ({ ...c }));
            }}
          >
            Retry
          </Button>
        </div>
      ) : !summary ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Writing {TEMPLATES[template].label} notes…
        </div>
      ) : (
        <div className="space-y-5">
          {summary.sections.map((section) => (
            <section key={section.heading}>
              <h3 className="mb-1.5 text-sm font-semibold">{section.heading}</h3>
              <ul className="space-y-1.5">
                {section.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                    <span className="flex-1">{withNames(b.text, speakers)}</span>
                    {b.idx !== null && segments[b.idx] && <TimeChip t={segments[b.idx].start_s} onSeek={onSeek} />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionItemsTab({
  meeting,
  items,
  setItems,
  segments,
  speakers,
  onSeek,
}: {
  meeting: Meeting;
  items: ActionItem[];
  setItems: (fn: (items: ActionItem[]) => ActionItem[]) => void;
  segments: Segment[];
  speakers: Record<string, string>;
  onSeek: Seek;
}) {
  const [showRemoved, setShowRemoved] = useState(false);

  async function update(index: number, patch: Partial<Pick<ActionItem, "review" | "done">>) {
    setItems((list) => list.map((it, i) => (i === index ? { ...it, ...patch } : it)));
    const res = await fetch(`/api/meetings/${meeting.id}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, ...patch }),
    });
    if (!res.ok) toast.error("Could not save that change");
  }

  const removed = items.filter((i) => i.review === "removed").length;
  const visible = items.map((item, index) => ({ item, index })).filter(({ item }) => showRemoved || item.review !== "removed");

  function copyAll() {
    const text = items
      .filter((i) => i.review !== "removed")
      .map((i) => `- ${i.task}${i.owner ? ` (${ownerLabel(i.owner, speakers)})` : ""}${i.due_date ? `, due ${i.due_date}` : ""}`)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => toast.success("Action items copied"));
  }

  if (!items.length) {
    return <p className="py-6 text-sm text-muted-foreground">No action items were found in this meeting. Nothing was invented to fill the gap.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Every item is checked against the transcript: the quote must exist, the owner must be in the meeting, and the
          date must match its wording.
          {meeting.notes?.merged_duplicates ? ` ${meeting.notes.merged_duplicates} repeated mention(s) merged.` : ""}
        </span>
        <Button size="xs" variant="ghost" onClick={copyAll}>
          <Copy /> Copy
        </Button>
      </div>
      <ul className="space-y-2">
        {visible.map(({ item, index }) => {
          const flagged = item.status === "needs_review" && item.review !== "approved";
          const isRemoved = item.review === "removed";
          return (
            <li
              key={index}
              className={cn(
                "rounded-xl border p-3 transition",
                flagged && !isRemoved && "border-warn/40 bg-warn-soft/60",
                isRemoved && "opacity-50",
              )}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!item.done}
                  aria-label="Mark done"
                  disabled={isRemoved}
                  onClick={() => update(index, { done: !item.done })}
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                    item.done ? "border-brand bg-brand text-brand-foreground" : "border-muted-foreground/40",
                  )}
                >
                  {item.done && <Check className="size-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", item.done && "text-muted-foreground line-through", isRemoved && "line-through")}>
                    {withNames(item.task, speakers)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className={cn("rounded-full px-2 py-0.5", item.owner ? "bg-brand-soft text-brand" : "bg-muted")}>
                      {ownerLabel(item.owner, speakers) ?? "No owner"}
                    </span>
                    {item.due_date ? (
                      <span>Due {formatDate(item.due_date)}</span>
                    ) : item.due_text ? (
                      <span>Due “{item.due_text}”</span>
                    ) : null}
                    {segments[item.idx] && <TimeChip t={segments[item.idx].start_s} onSeek={onSeek} />}
                    {item.status === "needs_review" && item.review === "approved" && (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="size-3" /> Reviewed
                      </span>
                    )}
                  </div>
                  {flagged && !isRemoved && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 font-medium text-warn">
                        <AlertTriangle className="size-3.5" /> Needs review:
                      </span>
                      <span>{item.reasons.join(" · ")}</span>
                      <span className="flex gap-1">
                        <Button size="xs" variant="outline" onClick={() => update(index, { review: "approved" })}>
                          <Check /> Keep
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => update(index, { review: "removed" })}>
                          <X /> Remove
                        </Button>
                      </span>
                    </div>
                  )}
                  {isRemoved && (
                    <Button size="xs" variant="ghost" className="mt-1" onClick={() => update(index, { review: null })}>
                      <Undo2 /> Restore
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {removed > 0 && (
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowRemoved((s) => !s)}>
          {showRemoved ? "Hide" : "Show"} {removed} removed
        </button>
      )}
    </div>
  );
}

function DecisionsTab({ meeting, segments, speakers, onSeek }: { meeting: Meeting; segments: Segment[]; speakers: Record<string, string>; onSeek: Seek }) {
  const decisions = meeting.notes?.decisions ?? [];
  const questions = meeting.notes?.questions ?? [];
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Decisions</h3>
        {decisions.length ? (
          <ul className="space-y-2">
            {decisions.map((d, i) => (
              <li key={i} className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm", d.status === "needs_review" && "border-warn/40 bg-warn-soft/60")}>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <div className="flex-1">
                  <p>{withNames(d.text, speakers)}</p>
                  {d.status === "needs_review" && <p className="mt-1 text-xs text-warn">⚠ {d.reasons.join(" · ")}</p>}
                  <p className="mt-1 text-xs italic text-muted-foreground">“{d.quote}”</p>
                </div>
                {segments[d.idx] && <TimeChip t={segments[d.idx].start_s} onSeek={onSeek} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No decisions were made.</p>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Open questions</h3>
        {questions.length ? (
          <ul className="space-y-2">
            {questions.map((q, i) => (
              <li key={i} className="flex items-start gap-2 rounded-xl border p-3 text-sm">
                <HelpCircle className="mt-0.5 size-4 shrink-0 text-sky-600" />
                <p className="flex-1">{withNames(q.text, speakers)}</p>
                {segments[q.idx] && <TimeChip t={segments[q.idx].start_s} onSeek={onSeek} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing left open.</p>
        )}
      </section>
    </div>
  );
}

function HighlightsTab({
  meeting,
  segments,
  initial,
  activeIdx,
  onSeek,
}: {
  meeting: Meeting;
  segments: Segment[];
  initial: Highlight[];
  activeIdx: number;
  onSeek: Seek;
}) {
  const [highlights, setHighlights] = useState(initial);
  const [busy, setBusy] = useState(false);

  // A highlight spans the current line and following lines up to ~20 s, like a "clip this" button.
  async function highlightNow() {
    const from = Math.max(0, activeIdx);
    const first = segments[from];
    if (!first) return;
    let last = first;
    for (let i = from + 1; i < segments.length && segments[i].end_s - first.start_s <= 20; i++) last = segments[i];
    setBusy(true);
    const res = await fetch(`/api/meetings/${meeting.id}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_s: first.start_s, end_s: Math.max(last.end_s, first.start_s + 5), title: first.text.split(/\s+/).slice(0, 10).join(" ") }),
    });
    setBusy(false);
    if (!res.ok) return toast.error("Could not create highlight");
    const created: Highlight = await res.json();
    setHighlights((h) => [...h, created].sort((a, b) => a.start_s - b.start_s));
    toast.success("Highlight saved", { description: "Copy its link to share the clip." });
  }

  async function remove(id: string) {
    setHighlights((h) => h.filter((x) => x.id !== id));
    const res = await fetch(`/api/highlights/${id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Could not delete highlight");
  }

  function copyLink(h: Highlight) {
    navigator.clipboard.writeText(`${window.location.origin}/share/${h.share_id}`).then(() => toast.success("Clip link copied", { description: "Anyone with the link can watch this clip." }));
  }

  const linesIn = (h: Highlight) => segments.filter((s) => s.start_s >= h.start_s - 0.01 && s.start_s < h.end_s);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Clip a moment to share it with someone who was not on the call. Play to a moment, or click a transcript line, then highlight it.
        </p>
        <Button size="sm" onClick={highlightNow} disabled={busy || activeIdx < 0}>
          {busy ? <Loader2 className="animate-spin" /> : <Scissors />} Highlight {activeIdx >= 0 ? formatTime(segments[activeIdx].start_s) : "moment"}
        </Button>
      </div>
      {highlights.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No highlights yet.</p>
      ) : (
        <ul className="space-y-2">
          {highlights.map((h) => (
            <li key={h.id} className="rounded-xl border p-3">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{h.title || "Highlight"}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{linesIn(h).map((s) => s.text).join(" ")}</p>
                </div>
                <TimeChip t={h.start_s} onSeek={onSeek} />
              </div>
              <div className="mt-2 flex gap-1 pl-6">
                <Button size="xs" variant="outline" onClick={() => copyLink(h)}>
                  <Link2 /> Copy clip link
                </Button>
                <Button size="xs" variant="ghost" onClick={() => window.open(`/share/${h.share_id}`, "_blank")}>
                  Open
                </Button>
                <Button size="xs" variant="ghost" onClick={() => remove(h.id)} aria-label="Delete highlight">
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NotesPanel({
  meeting,
  segments,
  speakers,
  highlights,
  activeIdx,
  onSeek,
}: {
  meeting: Meeting;
  segments: Segment[];
  speakers: Record<string, string>;
  highlights: Highlight[];
  time: number;
  activeIdx: number;
  onSeek: Seek;
}) {
  const [items, setItems] = useState<ActionItem[]>(meeting.notes?.action_items ?? []);
  const toReview = items.filter((i) => i.status === "needs_review" && !i.review).length;
  const open = items.filter((i) => i.review !== "removed").length;

  return (
    <div className="rounded-2xl border bg-background p-4">
      <Tabs defaultValue="summary">
        <TabsList className="mb-3 w-full justify-start overflow-x-auto">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="actions">
            Action items <span className="ml-1 text-muted-foreground">{open}</span>
            {toReview > 0 && <span className="ml-1 rounded-full bg-warn-soft px-1.5 text-[10px] text-warn">{toReview} ⚠</span>}
          </TabsTrigger>
          <TabsTrigger value="decisions">Decisions & questions</TabsTrigger>
          <TabsTrigger value="highlights">Highlights</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <SummaryTab meeting={meeting} segments={segments} speakers={speakers} onSeek={onSeek} />
        </TabsContent>
        <TabsContent value="actions">
          <ActionItemsTab meeting={meeting} items={items} setItems={setItems} segments={segments} speakers={speakers} onSeek={onSeek} />
        </TabsContent>
        <TabsContent value="decisions">
          <DecisionsTab meeting={meeting} segments={segments} speakers={speakers} onSeek={onSeek} />
        </TabsContent>
        <TabsContent value="highlights">
          <HighlightsTab meeting={meeting} segments={segments} initial={highlights} activeIdx={activeIdx} onSeek={onSeek} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
