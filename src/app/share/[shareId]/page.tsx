import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db, BUCKET } from "@/lib/supabase";
import { formatDate, formatTime, speakerLabel } from "@/lib/format";
import { ClipPlayer } from "@/components/clip-player";

export const dynamic = "force-dynamic";

async function load(shareId: string) {
  const { data: h } = await db()
    .from("highlights")
    .select("id, start_s, end_s, title, meeting_id, meetings(title, meeting_date, source, media_path, speakers)")
    .eq("share_id", shareId)
    .maybeSingle();
  if (!h) return null;
  const meeting = (Array.isArray(h.meetings) ? h.meetings[0] : h.meetings) as {
    title: string;
    meeting_date: string;
    source: string;
    media_path: string | null;
    speakers: Record<string, string>;
  };
  const start = Number(h.start_s);
  const end = Number(h.end_s);
  const [{ data: lines }, media] = await Promise.all([
    db()
      .from("segments")
      .select("idx, speaker, start_s, text")
      .eq("meeting_id", h.meeting_id)
      .gte("start_s", start - 0.01)
      .lt("start_s", end)
      .order("idx"),
    meeting.media_path ? db().storage.from(BUCKET).createSignedUrl(meeting.media_path, 60 * 60 * 24) : null,
  ]);
  return { h: { ...h, start, end }, meeting, lines: lines ?? [], mediaUrl: media?.data?.signedUrl ?? null };
}

export async function generateMetadata({ params }: PageProps<"/share/[shareId]">): Promise<Metadata> {
  const { shareId } = await params;
  const data = await load(shareId);
  return { title: data ? `Clip: ${data.h.title ?? data.meeting.title}` : "Clip" };
}

export default async function SharePage({ params }: PageProps<"/share/[shareId]">) {
  const { shareId } = await params;
  const data = await load(shareId);
  if (!data) notFound();
  const { h, meeting, lines, mediaUrl } = data;

  return (
    <div className="rise mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="label-mono !text-brand">Shared clip</p>
      <h1 className="mt-2 font-display text-2xl font-medium tracking-tight sm:text-3xl">{h.title || "Highlight"}</h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        From “{meeting.title}” · {formatDate(meeting.meeting_date)} · {formatTime(h.start)}–{formatTime(h.end)}
      </p>

      <div className="panel mt-6 overflow-hidden">
        {mediaUrl ? (
          <ClipPlayer src={mediaUrl} start={h.start} end={h.end} video={meeting.source === "video"} />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">This meeting was added as a transcript, so the clip is text only.</p>
        )}
        <div className="space-y-3 border-t border-border p-4 sm:p-5">
          {lines.map((l) => (
            <div key={l.idx}>
              <p className="text-xs">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-cyan-300">{speakerLabel(l.speaker, meeting.speakers ?? {})}</span>{" "}
                <span className="font-mono text-[11px] text-muted-foreground">{formatTime(Number(l.start_s))}</span>
              </p>
              <p className="text-sm leading-relaxed">{l.text}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Only this clip is shared, not the rest of the meeting.</p>
    </div>
  );
}
