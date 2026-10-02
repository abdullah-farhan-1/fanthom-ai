import { db } from "@/lib/supabase";

// Lightweight status for polling while a meeting is processing.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await db().from("meetings").select("id, status, stage, error").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(data);
}

// Rename speakers: body {"speakers": {"0": "Maria"}}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { speakers?: Record<string, string> } | null;
  if (!body?.speakers) return Response.json({ error: "speakers is required" }, { status: 400 });
  const { data: current } = await db().from("meetings").select("speakers").eq("id", id).maybeSingle();
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });
  const speakers = { ...current.speakers };
  for (const [label, name] of Object.entries(body.speakers)) {
    const clean = name.trim().slice(0, 60);
    if (clean) speakers[label] = clean;
    else delete speakers[label];
  }
  await db().from("meetings").update({ speakers }).eq("id", id);
  return Response.json({ speakers });
}
