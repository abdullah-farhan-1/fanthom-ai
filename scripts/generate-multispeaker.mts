// Builds a many-speaker test meeting with exact ground truth: one TTS call per line, each
// speaker with a fixed voice, concatenated with short gaps. Writes <name>.wav and <name>.truth.json
// (who spoke when). Usage: node --env-file=.env.local scripts/generate-multispeaker.mts samples/offsite-planning.txt
import { readFileSync, writeFileSync } from "node:fs";

// Local Piper neural TTS: free, offline, deterministic, one distinct voice per speaker.
// PIPER (binary) and PIPER_VOICES (dir with <voice>.onnx) point at a local install:
//   python3 -m venv .venv && .venv/bin/pip install piper-tts
//   .venv/bin/python -m piper.download_voices en_GB-alba-medium ... --data-dir voices
import { execFileSync } from "node:child_process";
const PIPER = process.env.PIPER ?? "piper";
const VOICE_DIR = process.env.PIPER_VOICES ?? "voices";
const VOICES: Record<string, string> = {
  Priya: "en_GB-alba-medium",
  Marcus: "en_US-ryan-medium",
  Elena: "en_US-amy-medium",
  Tom: "en_US-joe-medium",
  Grace: "en_US-kristin-medium",
};
const GAP_S = 0.35;

const input = process.argv[2];
const lines = readFileSync(input, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
  const [speaker, ...rest] = l.split(":");
  if (!VOICES[speaker]) throw new Error(`no voice for ${speaker}`);
  return { speaker, text: rest.join(":").trim() };
});

function say(text: string, voice: string) {
  const out = execFileSync(PIPER, ["-m", `${VOICE_DIR}/${voice}.onnx`, "--output-raw"], { input: text, maxBuffer: 1 << 28 });
  const rate = JSON.parse(readFileSync(`${VOICE_DIR}/${voice}.onnx.json`, "utf8")).audio.sample_rate as number;
  return { pcm: out, rate };
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
  const r = say(l.text, VOICES[l.speaker]);
  rate = r.rate;
  const dur = r.pcm.length / 2 / rate;
  truth.push({ speaker: l.speaker, start: +t.toFixed(3), end: +(t + dur).toFixed(3), text: l.text });
  pieces.push(r.pcm, Buffer.alloc(Math.round(rate * GAP_S) * 2));
  t += dur + GAP_S;
}
writeFileSync(input.replace(/\.txt$/, ".wav"), wav(Buffer.concat(pieces), rate));
writeFileSync(input.replace(/\.txt$/, ".truth.json"), JSON.stringify({ speakers: Object.keys(VOICES), turns: truth }, null, 1));
console.log(`\nwrote ${lines.length} lines, ${(t / 60).toFixed(1)} min`);
