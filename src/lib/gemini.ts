// Minimal Gemini client: JSON output, retry on overload, then fall back to the second model.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRY_DELAYS_MS = [2000, 5000];

export interface GeminiResult {
  text: string;
  model: string;
}

// Evaluation runs set GEMINI_CACHE_DIR so re-runs reuse identical responses (no API calls, and
// score changes come only from code changes). Never set in production.
async function cached(prompt: string, run: () => Promise<GeminiResult>): Promise<GeminiResult> {
  const dir = process.env.GEMINI_CACHE_DIR;
  if (!dir) return run();
  const { createHash } = await import("node:crypto");
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const file = `${dir}/${createHash("sha256").update(prompt).digest("hex").slice(0, 32)}.json`;
  const hit = await readFile(file, "utf8").catch(() => null);
  if (hit) return JSON.parse(hit);
  const result = await run();
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(result));
  return result;
}

export async function generateJson(prompt: string): Promise<GeminiResult> {
  return cached(prompt, () => callGemini(prompt));
}

async function callGemini(prompt: string): Promise<GeminiResult> {
  const models = [process.env.GEMINI_MODEL, process.env.GEMINI_FALLBACK_MODEL].filter(Boolean) as string[];
  let lastError = "no Gemini model configured";
  for (const model of models) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const res = await fetch(`${BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            ...(model.includes("lite") ? {} : { thinkingConfig: { thinkingLevel: "low" } }),
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        if (text.trim()) return { text, model };
        lastError = `${model} returned an empty response (${data.candidates?.[0]?.finishReason ?? "no candidate"})`;
        break;
      }
      const body = await res.text();
      lastError = `${model} ${res.status}: ${body.slice(0, 200)}`;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) break;
      if (attempt < RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw new Error(`AI notes failed: ${lastError}`);
}
