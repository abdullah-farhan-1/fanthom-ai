import Link from "next/link";
import { BraceLabel } from "@/components/logo";
import { AlertTriangle, ArrowUpRight, FileText, Loader2, Mic, Video, XCircle } from "lucide-react";
import { listMeetings } from "@/lib/queries";
import { formatDate, formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

const SOURCE_ICON = { audio: Mic, video: Video, transcript: FileText };

export default async function Home() {
  const meetings = await listMeetings();
  const hours = meetings.reduce((acc, m) => acc + (m.duration_s ?? 0), 0) / 3600;
  const actions = meetings.reduce((acc, m) => acc + m.action_items, 0);
  const review = meetings.reduce((acc, m) => acc + m.needs_review, 0);

  const stats = [
    { label: "Meetings", value: String(meetings.length) },
    { label: "Hours on record", value: hours.toFixed(1) },
    { label: "Action items", value: String(actions) },
    { label: "To review", value: String(review), warn: review > 0 },
  ];

  return (
    <div className="rise mx-auto max-w-[1100px] px-4 py-10 sm:px-6 sm:py-14">
      <section>
        <BraceLabel>conversations, structured</BraceLabel>
        <h1 className="mt-4 max-w-3xl font-display text-3xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
          Every meeting, <span className="text-brand">on the record.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Transcripts, summaries in any template, action items and shareable clips. Every AI claim links back to the
          moment it came from, and anything it can’t back up is flagged for a human.
        </p>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-panel p-4 sm:p-5">
            <p className="label-mono">{s.label}</p>
            <p className={`mt-2 font-display text-2xl font-medium sm:text-3xl ${s.warn ? "text-warn" : ""}`}>{s.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <BraceLabel>recent meetings</BraceLabel>
          <span className="label-mono">sorted by date</span>
        </div>

        {meetings.length === 0 ? (
          <div className="panel p-12 text-center">
            <p className="font-medium">No meetings yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Use “New meeting” to upload a recording or paste a transcript.</p>
          </div>
        ) : (
          <ul className="panel divide-y divide-border overflow-hidden">
            {meetings.map((m) => {
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
                        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        {formatDate(m.meeting_date)}
                        {formatDuration(m.duration_s) && ` · ${formatDuration(m.duration_s)}`}
                        {m.speakers.length > 0 && ` · ${m.speakers.slice(0, 4).join(", ")}${m.speakers.length > 4 ? ` +${m.speakers.length - 4}` : ""}`}
                      </p>
                      {m.status === "ready" && m.overview && (
                        <p className="mt-2 line-clamp-2 text-sm text-foreground/70">{m.overview}</p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        {m.status === "processing" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 text-brand">
                            <Loader2 className="size-3 animate-spin" /> {m.stage ?? "Processing"}
                          </span>
                        )}
                        {m.status === "failed" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-2 py-0.5 text-destructive">
                            <XCircle className="size-3" /> Failed · open to retry
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
    </div>
  );
}
