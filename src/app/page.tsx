import Link from "next/link";
import { AlertTriangle, CheckSquare, FileText, Loader2, Mic, Video, XCircle } from "lucide-react";
import { listMeetings } from "@/lib/queries";
import { formatDate, formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

const SOURCE_ICON = { audio: Mic, video: Video, transcript: FileText };

export default async function Home() {
  const meetings = await listMeetings();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          <p className="text-sm text-muted-foreground">
            {meetings.length} recorded · notes are checked against the transcript before they are trusted
          </p>
        </div>
      </div>

      {meetings.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-background p-12 text-center">
          <p className="font-medium">No meetings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Use “New meeting” to upload a recording or paste a transcript.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {meetings.map((m) => {
            const Icon = SOURCE_ICON[m.source];
            return (
              <li key={m.id}>
                <Link
                  href={`/meetings/${m.id}`}
                  className="group block rounded-2xl border bg-background p-4 transition hover:border-brand/40 hover:shadow-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="font-medium group-hover:text-brand">{m.title}</h2>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(m.meeting_date)}
                          {formatDuration(m.duration_s) && ` · ${formatDuration(m.duration_s)}`}
                          {m.speakers.length > 0 && ` · ${m.speakers.slice(0, 4).join(", ")}${m.speakers.length > 4 ? ` +${m.speakers.length - 4}` : ""}`}
                        </span>
                      </div>
                      {m.status === "ready" && m.overview && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.overview}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                        {m.status === "processing" && (
                          <span className="inline-flex items-center gap-1 text-brand">
                            <Loader2 className="size-3 animate-spin" /> {m.stage ?? "Processing"}…
                          </span>
                        )}
                        {m.status === "failed" && (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <XCircle className="size-3" /> Failed, open to retry
                          </span>
                        )}
                        {m.status === "ready" && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CheckSquare className="size-3" /> {m.action_items} action items
                          </span>
                        )}
                        {m.needs_review > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-warn">
                            <AlertTriangle className="size-3" /> {m.needs_review} to review
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
