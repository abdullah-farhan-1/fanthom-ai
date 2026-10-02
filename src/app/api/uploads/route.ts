import { db, BUCKET } from "@/lib/supabase";

const MAX_BYTES = 2 * 1024 ** 3; // 2 GB

// Returns a one-time signed upload URL so the browser uploads straight to Supabase Storage.
// Big files never pass through this function (Vercel caps request bodies at 4.5 MB).
export async function POST(request: Request) {
  const { filename, size } = (await request.json().catch(() => ({}))) as { filename?: string; size?: number };
  if (!filename) return Response.json({ error: "filename is required" }, { status: 400 });
  if (size && size > MAX_BYTES) return Response.json({ error: "Files up to 2 GB are supported" }, { status: 413 });

  const safe = filename.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-80);
  const path = `${crypto.randomUUID()}/${safe}`;
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return Response.json({ error: error?.message ?? "Could not create upload URL" }, { status: 500 });
  return Response.json({ path: data.path, token: data.token });
}
