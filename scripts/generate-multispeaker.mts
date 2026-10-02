// Builds a many-speaker test meeting with exact ground truth: one Gemini TTS call per line, each
// speaker with a fixed voice, concatenated with short gaps. Writes <name>.wav and <name>.truth.json
// (who spoke when). Usage: node --env-file=.env.local scripts/generate-multispeaker.mts samples/offsite-planning.txt
import { readFileSync, writeFileSync } from "node:fs";

const VOICES: Record<string, string> = { Priya: "Kore", Marcus: "Charon", Elena: "Aoede", Tom: "Puck", Grace: "Leda" };
// Free-tier TTS allows ~10 requests per model per day, so speakers are spread across models.
// Each speaker always uses the same model so their voice stays consistent.
const MODEL: Record<string, string> = {
  Priya: "gemini-2.5-flash-preview-tts",
  Tom: "gemini-3.1-flash-tts-preview",
  Grace: "gemini-3.1-flash-tts-preview",
  Marcus: "gemini-3.8-flash-lite-tts",
  Elena: "gemini-3.8-flash-lite-tts",
};
const GAP_S = 0.35;

const input = process.argv[2];
const lines = readFileSync(input, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
  const [speaker, ...rest] = l.split(":");
  if (!VOICES[speaker]) throw new Error(`no voice for ${speaker}`);
  return { speaker, text: rest.join(":").trim() };
});

async function say(text: string, voice: string, model: string) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Say naturally, as part of a relaxed work meeting: ${text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    });
    if (res.status === 429 && /quota/i.test(await res.clone().text()) && /per ?day|PerDay|requests, limit/i.test(await res.clone().text())) {
      throw new Error(`daily TTS quota exhausted for ${model}`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const wait = 5 * 2 ** attempt;
      console.log(`  HTTP ${res.status}, retrying in ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const json = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${json.error?.message}`);
    const part = json.candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData);
    if (!part) throw new Error(`no audio for: ${text}`);
    return { pcm: Buffer.from(part.inlineData.data, "base64"), rate: Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? 24000) };
  }
}

function wav(pcm: Buffer, rate: number) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const pieces: Buffer[] = [];
const truth: { speaker: string; start: number; end: number; text: string }[] = [];
let t = 0;
let rate = 24000;
for (const [i, l] of lines.entries()) {
  process.stdout.write(`line ${i + 1}/${lines.length} ${l.speaker}\r`);
  const r = await say(l.text, VOICES[l.speaker], MODEL[l.speaker]);
  rate = r.rate;
  const dur = r.pcm.length / 2 / rate;
  truth.push({ speaker: l.speaker, start: +t.toFixed(3), end: +(t + dur).toFixed(3), text: l.text });
  pieces.push(r.pcm, Buffer.alloc(Math.round(rate * GAP_S) * 2));
  t += dur + GAP_S;
}
writeFileSync(input.replace(/\.txt$/, ".wav"), wav(Buffer.concat(pieces), rate));
writeFileSync(input.replace(/\.txt$/, ".truth.json"), JSON.stringify({ speakers: Object.keys(VOICES), turns: truth }, null, 1));
console.log(`\nwrote ${lines.length} lines, ${(t / 60).toFixed(1)} min`);
