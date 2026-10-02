import { z } from "zod";
import { db } from "@/lib/supabase";

const Body = z.object({
  start_s: z.number().min(0),
  end_s: z.number().positive(),
  title: z.string().trim().max(200).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.end_s <= parsed.data.start_s) {
    return Response.json({ error: "A highlight needs a start before its end" }, { status: 400 });
  }
  const { data, error } = await db()
    .from("highlights")
    .insert({ meeting_id: id, ...parsed.data })
    .select("id, start_s, end_s, title, share_id, created_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ...data, start_s: Number(data.start_s), end_s: Number(data.end_s) }, { status: 201 });
}
