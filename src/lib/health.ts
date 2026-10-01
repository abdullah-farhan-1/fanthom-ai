// Connectivity checks for every external service the app depends on.
// Shared by `npm run check` (local, live calls) and GET /api/health (deployed, cheap calls).
// Never returns or logs secret values.

export type CheckStatus = "ok" | "warn" | "fail";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  ms: number;
}

const REQUIRED_ENV = [
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_FALLBACK_MODEL",
  "DEEPGRAM_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_BUCKET",
] as const;

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEEPGRAM_SAMPLE_AUDIO = "https://dpgr.am/spacewalk.wav";

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

async function timed(name: string, fn: () => Promise<[CheckStatus, string]>): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const [status, detail] = await fn();
    return { name, status, detail, ms: Date.now() - t0 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { name, status: "fail", detail, ms: Date.now() - t0 };
  }
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text);
    return String(body.error?.message ?? body.err_msg ?? body.message ?? body.msg ?? text).slice(0, 160);
  } catch {
    return text.slice(0, 160) || "(empty body)";
  }
}

function checkEnv(): CheckResult {
  const missing = REQUIRED_ENV.filter((name) => !env(name));
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  if (missing.length) {
    return { name: "env", status: "fail", detail: `missing: ${missing.join(", ")}`, ms: 0 };
  }
  if (!/^https:\/\/[^/]+$/.test(url.replace(/\/$/, ""))) {
    return { name: "env", status: "fail", detail: "NEXT_PUBLIC_SUPABASE_URL must be the base URL only (no /rest/v1)", ms: 0 };
  }
  return { name: "env", status: "ok", detail: `${REQUIRED_ENV.length} variables set`, ms: 0 };
}

// live: run a real one-word generation; otherwise only fetch model metadata (no quota used).
function checkGemini(modelVar: "GEMINI_MODEL" | "GEMINI_FALLBACK_MODEL", live: boolean) {
  const model = env(modelVar);
  return timed(`gemini (${modelVar === "GEMINI_MODEL" ? "primary" : "fallback"}: ${model})`, async () => {
    const headers = { "x-goog-api-key": env("GEMINI_API_KEY"), "Content-Type": "application/json" };
    if (!live) {
      const res = await fetch(`${GEMINI_BASE}/${model}`, { headers });
      return res.ok ? ["ok", "key valid, model listed"] : ["fail", `HTTP ${res.status}: ${await errorMessage(res)}`];
    }
    const generationConfig = model.includes("lite") ? undefined : { thinkingConfig: { thinkingLevel: "low" } };
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: "POST",
      headers,
      body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with exactly: OK" }] }], generationConfig }),
    });
    if (res.status === 503 || res.status === 429) {
      return ["warn", `HTTP ${res.status} (overloaded or rate limited, retry later): ${await errorMessage(res)}`];
    }
    if (!res.ok) return ["fail", `HTTP ${res.status}: ${await errorMessage(res)}`];
    const body = await res.json();
    const text = body.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("").trim();
    return ["ok", `generated ${JSON.stringify(text)}`];
  });
}

// live: transcribe a 26s public sample (uses a few cents of credit); otherwise only validate the key.
function checkDeepgram(live: boolean) {
  return timed("deepgram", async () => {
    const headers = { Authorization: `Token ${env("DEEPGRAM_API_KEY")}`, "Content-Type": "application/json" };
    if (!live) {
      const res = await fetch("https://api.deepgram.com/v1/projects", { headers });
      return res.ok ? ["ok", "key valid"] : ["fail", `HTTP ${res.status}: ${await errorMessage(res)}`];
    }
    const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&diarize=true&utterances=true", {
      method: "POST",
      headers,
      body: JSON.stringify({ url: DEEPGRAM_SAMPLE_AUDIO }),
    });
    if (!res.ok) return ["fail", `HTTP ${res.status}: ${await errorMessage(res)}`];
    const body = await res.json();
    const utterances = body.results?.utterances?.length ?? 0;
    return utterances > 0 ? ["ok", `transcribed sample, ${utterances} utterances`] : ["warn", "transcribed but no utterances returned"];
  });
}

function checkSupabasePublishable() {
  return timed("supabase (publishable key)", async () => {
    const res = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: env("NEXT_PUBLIC_SUPABASE_ANON_KEY") },
    });
    return res.ok ? ["ok", "key valid"] : ["fail", `HTTP ${res.status}: ${await errorMessage(res)}`];
  });
}

function checkSupabaseStorage() {
  const bucket = env("SUPABASE_BUCKET");
  return timed(`supabase (secret key, bucket "${bucket}")`, async () => {
    const secret = env("SUPABASE_SERVICE_ROLE_KEY");
    const res = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "")}/storage/v1/bucket/${bucket}`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) return ["fail", `HTTP ${res.status}: ${await errorMessage(res)}`];
    const body = await res.json();
    return body.public ? ["warn", "bucket is PUBLIC, recordings would be world-readable"] : ["ok", "bucket exists and is private"];
  });
}

export async function runHealthChecks({ live }: { live: boolean }): Promise<CheckResult[]> {
  const envResult = checkEnv();
  if (envResult.status === "fail") return [envResult];
  const results = await Promise.all([
    checkGemini("GEMINI_MODEL", live),
    checkGemini("GEMINI_FALLBACK_MODEL", live),
    checkDeepgram(live),
    checkSupabasePublishable(),
    checkSupabaseStorage(),
  ]);
  return [envResult, ...results];
}
