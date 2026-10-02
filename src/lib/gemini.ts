// Minimal Gemini client: JSON output, retry on overload, then fall back to the second model.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRY_DELAYS_MS = [2000, 5000];

export interface GeminiResult {
  text: string;
  model: string;
}

export async function generateJson(prompt: string): Promise<GeminiResult> {
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
