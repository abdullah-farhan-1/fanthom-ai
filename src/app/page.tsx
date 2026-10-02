import { BraceLabel } from "@/components/logo";
import { MeetingList } from "@/components/meeting-list";
import { listMeetings } from "@/lib/queries";

export const dynamic = "force-dynamic";

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

      <MeetingList meetings={meetings} />
    </div>
  );
}
