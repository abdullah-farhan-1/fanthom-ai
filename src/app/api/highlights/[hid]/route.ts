import { db } from "@/lib/supabase";

export async function DELETE(_request: Request, { params }: { params: Promise<{ hid: string }> }) {
  const { hid } = await params;
  const { error } = await db().from("highlights").delete().eq("id", hid);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
