import { after } from "next/server";
import { db } from "@/lib/supabase";
import { processMeeting } from "@/lib/pipeline";

export const maxDuration = 300;

// Re-run processing for a failed meeting. Media meetings re-transcribe, so old segments are cleared.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: meeting } = await db().from("meetings").select("source, status").eq("id", id).maybeSingle();
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  if (meeting.status === "processing") return Response.json({ error: "Already processing" }, { status: 409 });

  // Re-transcribing renumbers speakers, so old names (AI-guessed or not) no longer apply.
  if (meeting.source !== "transcript") {
    await db().from("segments").delete().eq("meeting_id", id);
    await db().from("meetings").update({ speakers: {} }).eq("id", id);
  }
  await db().from("summaries").delete().eq("meeting_id", id);
  await db()
    .from("meetings")
    .update({ status: "processing", stage: meeting.source === "transcript" ? "Writing notes" : "Transcribing", error: null })
    .eq("id", id);
  after(() => processMeeting(id));
  return Response.json({ ok: true });
}
