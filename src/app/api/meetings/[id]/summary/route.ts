import { db } from "@/lib/supabase";
import { loadSegments } from "@/lib/pipeline";
import { writeSummary } from "@/lib/notes";
import { isTemplate } from "@/lib/templates";

export const maxDuration = 120;

// Summary for one template: served from cache, generated on first request.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = new URL(request.url).searchParams.get("template") ?? "general";
  if (!isTemplate(template)) return Response.json({ error: "Unknown template" }, { status: 400 });

  const { data: cached } = await db()
    .from("summaries")
    .select("content, model")
    .eq("meeting_id", id)
    .eq("template", template)
    .maybeSingle();
  if (cached) return Response.json({ template, ...cached });

  const { data: meeting } = await db().from("meetings").select("speakers, meeting_date, status").eq("id", id).maybeSingle();
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  if (meeting.status !== "ready") return Response.json({ error: "Meeting is still processing" }, { status: 409 });

  try {
    const segments = await loadSegments(id);
    const { summary, model } = await writeSummary(segments, meeting.speakers ?? {}, meeting.meeting_date, template);
    await db().from("summaries").upsert({ meeting_id: id, template, content: summary, model });
    return Response.json({ template, content: summary, model });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Summary failed" }, { status: 502 });
  }
}
