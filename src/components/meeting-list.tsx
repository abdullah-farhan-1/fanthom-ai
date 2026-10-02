"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownUp, ArrowUpRight, FileText, Mic, Video, XCircle } from "lucide-react";
import { BraceLabel } from "@/components/logo";
import { LikeButton } from "@/components/like-button";
import { DeleteMeetingButton } from "@/components/delete-meeting-button";
import { BrandSpinner } from "@/components/signal-loader";
import { formatDate, formatDuration } from "@/lib/format";
import type { MeetingListItem } from "@/lib/queries";

const SOURCE_ICON = { audio: Mic, video: Video, transcript: FileText };

// Clicking the sort label cycles through these.
const SORTS = [
  { key: "date", label: "date", compare: (a: MeetingListItem, b: MeetingListItem) => b.meeting_date.localeCompare(a.meeting_date) || b.created_at.localeCompare(a.created_at) },
  { key: "length", label: "length", compare: (a: MeetingListItem, b: MeetingListItem) => (b.duration_s ?? 0) - (a.duration_s ?? 0) },
  { key: "liked", label: "liked", compare: (a: MeetingListItem, b: MeetingListItem) => Number(b.liked) - Number(a.liked) || b.meeting_date.localeCompare(a.meeting_date) },
  { key: "title", label: "title a–z", compare: (a: MeetingListItem, b: MeetingListItem) => a.title.localeCompare(b.title) },
] as const;

function List({ meetings }: { meetings: MeetingListItem[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const [liked, setLiked] = useState<Record<string, boolean>>(() => Object.fromEntries(meetings.map((m) => [m.id, m.liked])));
  const [deleted, setDeleted] = useState<Set<string>>(() => new Set());
  const [sortIdx, setSortIdx] = useState(() => Math.max(0, SORTS.findIndex((s) => s.key === params.get("sort"))));
  const sort = SORTS[sortIdx];

  const sorted = useMemo(
    () =>
      meetings
        .filter((m) => !deleted.has(m.id))
        .map((m) => ({ ...m, liked: liked[m.id] ?? m.liked }))
        .sort(sort.compare),
    [meetings, liked, deleted, sort],
  );

  // Sorting is instant and client-side; only the URL is updated (no server round trip), so a
  // shared or refreshed link keeps the order.
  function cycleSort() {
    const nextIdx = (sortIdx + 1) % SORTS.length;
    setSortIdx(nextIdx);
    const url = new URL(window.location.href);
    if (SORTS[nextIdx].key === "date") url.searchParams.delete("sort");
    else url.searchParams.set("sort", SORTS[nextIdx].key);
    window.history.replaceState(null, "", url);
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <BraceLabel>recent meetings</BraceLabel>
        <button
          type="button"
          onClick={cycleSort}
          title="Change sort order"
          className="label-mono group flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 transition hover:border-brand/50 hover:!text-foreground"
        >
          <ArrowDownUp className="size-3.5 text-brand transition-transform group-hover:rotate-180" />
          sorted by <span className="text-brand">{sort.label}</span>
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="panel p-12 text-center">
          <p className="font-medium">No meetings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Use “New meeting” to upload a recording or paste a transcript.</p>
        </div>
      ) : (
        <ul className="panel divide-y divide-border overflow-hidden">
          {sorted.map((m) => {
            const Icon = SOURCE_ICON[m.source];
            return (
              <li key={m.id}>
                <Link href={`/meetings/${m.id}`} className="group flex gap-4 p-4 transition-colors hover:bg-foreground/[0.03] sm:p-5">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-panel-2 text-muted-foreground transition group-hover:border-brand/40 group-hover:text-brand">
                    <Icon className="size-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium leading-snug transition group-hover:text-brand">{m.title}</h3>
                      <div className="flex shrink-0 items-center gap-2">
                        <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                        {!m.seed && <DeleteMeetingButton
                          meetingId={m.id}
                          title={m.title}
                          className="opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
                          onDeleted={() => {
                            setDeleted((d) => new Set(d).add(m.id));
                            router.refresh(); // refresh the stats strip in the background
                          }}
                        />}
                        <LikeButton
                          meetingId={m.id}
                          initial={m.liked}
                          onChange={(v) => setLiked((l) => ({ ...l, [m.id]: v }))}
                        />
                      </div>
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {formatDate(m.meeting_date)}
                      {formatDuration(m.duration_s) && ` · ${formatDuration(m.duration_s)}`}
                      {m.speakers.length > 0 && ` · ${m.speakers.slice(0, 4).join(", ")}${m.speakers.length > 4 ? ` +${m.speakers.length - 4}` : ""}`}
                    </p>
                    {m.status === "ready" && m.overview && <p className="mt-2 line-clamp-2 text-sm text-foreground/70">{m.overview}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {m.status === "processing" && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 text-brand">
                          <BrandSpinner size="sm" /> {m.stage ?? "Processing"}
                        </span>
                      )}
                      {m.status === "failed" && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-2 py-0.5 text-destructive">
                          <XCircle className="size-3" /> Failed · open to retry
                        </span>
                      )}
                      {m.seed && (
                        <span
                          title={m.seed.credit}
                          className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-0.5 font-mono text-[11px] text-cyan-200"
                        >
                          {`{ ${m.seed.label.toLowerCase()} }`} {m.seed.credit}
                        </span>
                      )}
                      {m.status === "ready" && (
                        <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                          {m.action_items} action {m.action_items === 1 ? "item" : "items"}
                        </span>
                      )}
                      {m.needs_review > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 font-mono text-[11px] text-warn">
                          <AlertTriangle className="size-3" /> {m.needs_review} to review
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function MeetingList({ meetings }: { meetings: MeetingListItem[] }) {
  return (
    <Suspense fallback={null}>
      <List meetings={meetings} />
    </Suspense>
  );
}
