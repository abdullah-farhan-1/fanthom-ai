import { z } from "zod";
import { db } from "@/lib/supabase";

const Body = z.object({
  index: z.number().int().min(0),
  review: z.enum(["approved", "removed"]).nullable().optional(),
  done: z.boolean().optional(),
});

// Human review of one action item: approve or remove a flagged item, or tick it off.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { index, review, done } = parsed.data;

  const { data: meeting } = await db().from("meetings").select("notes").eq("id", id).maybeSingle();
  const item = meeting?.notes?.action_items?.[index];
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  if (review !== undefined) item.review = review;
  if (done !== undefined) item.done = done;
  await db().from("meetings").update({ notes: meeting.notes }).eq("id", id);
  return Response.json({ item });
}
