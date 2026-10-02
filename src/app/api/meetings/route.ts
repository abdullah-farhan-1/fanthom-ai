import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/supabase";
import { parseTranscript } from "@/lib/transcript";
import { processMeeting, saveSegments } from "@/lib/pipeline";

// Long enough for an hour of audio: Deepgram + Gemini run inside after().
export const maxDuration = 300;

const Body = z.object({
  title: z.string().trim().max(200).optional(),
  meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.enum(["audio", "video", "transcript"]),
  media_path: z.string().optional(),
  transcript: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;
  // No future meetings. One day of slack because the browser's local date can be ahead of UTC.
  const latest = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (body.meeting_date && body.meeting_date > latest) {
    return Response.json({ error: "The meeting date can't be in the future." }, { status: 400 });
  }

  const segments = body.source === "transcript" ? parseTranscript(body.transcript ?? "") : null;
  if (body.source === "transcript" && (!segments || segments.length < 2)) {
    return Response.json({ error: "Paste a transcript with at least two lines of speech." }, { status: 400 });
  }
  if (body.source !== "transcript" && !body.media_path) {
    return Response.json({ error: "Upload a recording first." }, { status: 400 });
  }

  const { data: meeting, error } = await db()
    .from("meetings")
    .insert({
      title: body.title || "Untitled meeting",
      meeting_date: body.meeting_date,
      source: body.source,
      media_path: body.media_path ?? null,
      duration_s: segments ? segments.at(-1)!.end_s : null,
      stage: body.source === "transcript" ? "Writing notes" : "Transcribing",
    })
    .select("id")
    .single();
  if (error || !meeting) return Response.json({ error: error?.message ?? "Could not create meeting" }, { status: 500 });

  if (segments) await saveSegments(meeting.id, segments);
  after(() => processMeeting(meeting.id));
  return Response.json({ id: meeting.id }, { status: 201 });
}
