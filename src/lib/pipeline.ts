import { db, BUCKET } from "./supabase";
import { transcribeUrl } from "./deepgram";
import { writeNotes, writeSummary } from "./notes";
import type { Segment } from "./types";

async function setStage(id: string, stage: string) {
  await db().from("meetings").update({ stage }).eq("id", id);
}

export async function saveSegments(meetingId: string, segments: Segment[]) {
  const rows = segments.map((s) => ({ meeting_id: meetingId, ...s }));
  // Insert in chunks so an hour-long meeting (~1,000 utterances) stays under request limits.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db().from("segments").insert(rows.slice(i, i + 500));
    if (error) throw new Error(`Saving transcript failed: ${error.message}`);
  }
}

export async function loadSegments(meetingId: string): Promise<Segment[]> {
  const all: Segment[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from("segments")
      .select("idx, speaker, start_s, end_s, text")
      .eq("meeting_id", meetingId)
      .order("idx")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data as Segment[]).map((s) => ({ ...s, start_s: Number(s.start_s), end_s: Number(s.end_s) })));
    if (!data || data.length < 1000) return all;
  }
}

// Runs after the upload request has returned: transcribe (if media), then write notes and the default summary.
export async function processMeeting(id: string) {
  try {
    const { data: meeting, error } = await db().from("meetings").select("*").eq("id", id).single();
    if (error || !meeting) throw new Error(error?.message ?? "Meeting not found");

    let segments: Segment[];
    if (meeting.source === "transcript") {
      segments = await loadSegments(id);
    } else {
      await setStage(id, "Transcribing");
      const { data: signed, error: signError } = await db().storage.from(BUCKET).createSignedUrl(meeting.media_path, 60 * 60);
      if (signError || !signed) throw new Error(`Could not read the uploaded file: ${signError?.message}`);
      const result = await transcribeUrl(signed.signedUrl);
      segments = result.segments;
      await saveSegments(id, segments);
      await db().from("meetings").update({ duration_s: result.duration }).eq("id", id);
    }

    await setStage(id, "Writing notes");
    const { notes, speakers, model } = await writeNotes(segments, meeting.speakers ?? {}, meeting.meeting_date);
    const { summary } = await writeSummary(segments, speakers, meeting.meeting_date, "general");
    await db().from("summaries").upsert({ meeting_id: id, template: "general", content: summary, model });
    await db().from("meetings").update({ notes, speakers, model, status: "ready", stage: null, error: null }).eq("id", id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`processMeeting ${id} failed:`, message);
    await db().from("meetings").update({ status: "failed", stage: null, error: message }).eq("id", id);
  }
}
