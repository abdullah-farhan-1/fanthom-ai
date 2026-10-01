// Turns a "Speaker: line" script into a two-voice WAV using Gemini multi-speaker TTS.
// Usage: node --env-file=.env.local scripts/generate-sample-audio.mts samples/demo-meeting.txt
import { readFileSync, writeFileSync } from "node:fs";

const TTS_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-3.8-flash-tts";
// Voice per speaker name. Multi-speaker TTS takes at most two speakers per script.
const VOICE_TABLE: Record<string, string> = { Sara: "Kore", Daniyal: "Charon", Hina: "Aoede", Omar: "Puck" };
const LINES_PER_CHUNK = 10;
const GAP_SECONDS = 0.4;

const input = process.argv[2];
if (!input) throw new Error("usage: generate-sample-audio.mts <script.txt>");
const output = input.replace(/\.txt$/, ".wav");

const lines = readFileSync(input, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
const speakers = [...new Set(lines.map((l) => l.split(":")[0]))];
const unknown = speakers.filter((s) => !VOICE_TABLE[s]);
if (unknown.length) throw new Error(`no voice configured for: ${unknown.join(", ")}`);
if (speakers.length > 2) throw new Error(`multi-speaker TTS supports 2 speakers, script has: ${speakers.join(", ")}`);
const VOICES = Object.fromEntries(speakers.map((s) => [s, VOICE_TABLE[s]]));

async function synthesize(chunk: string[]): Promise<{ pcm: Buffer; rate: number }> {
  const body = {
    // One part per line, tagged with its speaker (required by multi-speaker TTS).
    contents: [{
      parts: chunk.map((line) => {
        const [speaker, ...rest] = line.split(":");
        return { text: rest.join(":").trim(), speechMetadata: { speaker } };
      }),
    }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: Object.entries(VOICES).map(([speaker, voiceName]) => ({
            speaker,
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          })),
        },
      },
    },
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if ((res.status === 503 || res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = 5 * 2 ** attempt;
      console.log(`  HTTP ${res.status}, retrying in ${wait}s (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const json = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${json.error?.message}`);
    const part = json.candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData);
    if (!part) throw new Error(`no audio in response: ${JSON.stringify(json).slice(0, 200)}`);
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? 24000);
    return { pcm: Buffer.from(part.inlineData.data, "base64"), rate };
  }
}

// 16-bit mono PCM -> WAV
function wav(pcm: Buffer, rate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const pieces: Buffer[] = [];
let rate = 24000;
for (let i = 0; i < lines.length; i += LINES_PER_CHUNK) {
  const chunk = lines.slice(i, i + LINES_PER_CHUNK);
  console.log(`chunk ${i / LINES_PER_CHUNK + 1}/${Math.ceil(lines.length / LINES_PER_CHUNK)} (${chunk.length} lines)`);
  const result = await synthesize(chunk);
  rate = result.rate;
  pieces.push(result.pcm, Buffer.alloc(Math.round(rate * GAP_SECONDS) * 2));
}

const pcm = Buffer.concat(pieces);
writeFileSync(output, wav(pcm, rate));
console.log(`wrote ${output}: ${(pcm.length / 2 / rate / 60).toFixed(1)} min at ${rate} Hz`);
