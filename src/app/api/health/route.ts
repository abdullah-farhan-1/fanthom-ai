import { runHealthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";

// Cheap checks only (key validity, model metadata, bucket); no generation or transcription,
// so hitting this endpoint does not spend quota or credit.
export async function GET() {
  const checks = await runHealthChecks({ live: false });
  const ok = checks.every((c) => c.status !== "fail");
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
