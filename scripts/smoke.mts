// End-to-end smoke test against a running server.
// npx tsx --env-file=.env.local scripts/smoke.mts transcript samples/demo-meeting.txt "Title" 2026-10-01
// npx tsx --env-file=.env.local scripts/smoke.mts media path/to/file.mp4 "Title" 2026-10-02
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const [kind, file, title, date] = process.argv.slice(2);

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const t0 = Date.now();
let body: Record<string, unknown>;
if (kind === "transcript") {
  body = { source: "transcript", transcript: readFileSync(file, "utf8"), title, meeting_date: date };
} else {
  // Same path the browser takes: signed upload URL, then upload straight to Supabase Storage.
  const { path, token } = await post("/api/uploads", { filename: basename(file), size: statSync(file).size });
  const browser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await browser.storage.from(process.env.SUPABASE_BUCKET ?? "recordings").uploadToSignedUrl(path, token, new Blob([readFileSync(file)]), {
    contentType: file.endsWith(".mp4") ? "video/mp4" : "audio/wav",
  });
  if (error) throw new Error(`upload failed: ${error.message}`);
  console.log(`uploaded ${(statSync(file).size / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  body = { source: file.endsWith(".mp4") ? "video" : "audio", media_path: path, title, meeting_date: date };
}
const { id } = await post("/api/meetings", body);
console.log(`created ${id}`);

let last = "";
for (;;) {
  const s = await (await fetch(`${BASE}/api/meetings/${id}`)).json();
  const line = `${s.status}${s.stage ? ` / ${s.stage}` : ""}${s.error ? ` / ${s.error}` : ""}`;
  if (line !== last) console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`);
  last = line;
  if (s.status !== "processing") break;
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(id);
