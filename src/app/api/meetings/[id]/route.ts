import { db, BUCKET } from "@/lib/supabase";

// Lightweight status for polling while a meeting is processing.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await db().from("meetings").select("id, status, stage, error").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(data);
}

// Rename speakers {"speakers": {"0": "Maria"}} and/or like {"liked": true}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { speakers?: Record<string, string>; liked?: boolean } | null;
  if (!body || (!body.speakers && typeof body.liked !== "boolean")) {
    return Response.json({ error: "speakers or liked is required" }, { status: 400 });
  }
  const { data: current } = await db().from("meetings").select("speakers").eq("id", id).maybeSingle();
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });

  const update: { speakers?: Record<string, string>; liked?: boolean } = {};
  if (body.speakers) {
    const speakers = { ...current.speakers };
    for (const [label, name] of Object.entries(body.speakers)) {
      const clean = name.trim().slice(0, 60);
      if (clean) speakers[label] = clean;
      else delete speakers[label];
    }
    update.speakers = speakers;
  }
  if (typeof body.liked === "boolean") update.liked = body.liked;
  const { error } = await db().from("meetings").update(update).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ speakers: update.speakers ?? current.speakers, liked: update.liked });
}

// Delete a meeting: its recording in storage, then the row (segments, summaries and highlights cascade).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: meeting } = await db().from("meetings").select("media_path").eq("id", id).maybeSingle();
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  if (meeting.media_path) {
    const { error } = await db().storage.from(BUCKET).remove([meeting.media_path]);
    if (error) return Response.json({ error: `Could not delete the recording: ${error.message}` }, { status: 500 });
  }
  const { error } = await db().from("meetings").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
