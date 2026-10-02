// Speaker evaluation against ground truth: who said what (attribution) and who is who (naming).
//
//   npm run eval:speakers                 all datasets that are available locally
//   npm run eval:speakers -- ami offsite  only these
//
// Datasets (audio is not in git; see README "Evaluation"):
//   fathom-cricket, fathom-house  real Google Meet calls; Fathom records each participant separately,
//                                 so its transcript gives the true speaker of every turn
//   ami                           AMI EN2001a (87 min, 5 people), hand-annotated word timings per speaker
//   offsite                       synthetic 5-person meeting built for naming traps (exact truth)
//
// Deepgram responses are cached in samples/cache/ and Gemini responses in samples/cache/gemini/,
// so re-runs are free and deterministic: score changes come only from code changes.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { requestTranscription, segmentsFromResponse, type DeepgramResponse, type TurnMethod } from "../src/lib/deepgram";
import { parseTranscript } from "../src/lib/transcript";
import { writeNotes } from "../src/lib/notes";
import type { Segment } from "../src/lib/types";

process.env.GEMINI_CACHE_DIR ??= "samples/cache/gemini";
const CACHE = "samples/cache";
mkdirSync(CACHE, { recursive: true });

interface RefTurn {
  speaker: string; // true identity, e.g. "Asim" or AMI agent "A"
  start: number;
  end: number;
}
interface Dataset {
  name: string;
  audio: string;
  contentType: string;
  reference: () => RefTurn[];
  names: Record<string, string> | null; // true speaker -> name a person would use; null = not scored
  date: string;
  collar: number; // seconds ignored around each reference turn boundary (standard in diarization scoring)
}

// ---------- references ----------

function fathomReference(path: string, aliases: Record<string, string>): () => RefTurn[] {
  return () => {
    // Fathom export: "0:01 - Full Name (Org)" header lines; a turn lasts until the next header.
    const segs = parseTranscript(readFileSync(path, "utf8"));
    return segs.map((s, i) => ({
      speaker: aliases[s.speaker] ?? s.speaker,
      start: s.start_s,
      end: segs[i + 1]?.start_s ?? s.end_s,
    }));
  };
}

function amiReference(): RefTurn[] {
  const dir = "samples/ami/annotations/words";
  const turns: RefTurn[] = [];
  for (const file of readdirSync(dir).filter((f) => f.startsWith("EN2001a.") && f.endsWith(".words.xml"))) {
    const agent = file.split(".")[1];
    const words = [...readFileSync(`${dir}/${file}`, "latin1").matchAll(/<w [^>]*starttime="([\d.]+)" endtime="([\d.]+)"(?![^>]*punc)[^>]*>/g)]
      .map((m) => ({ start: Number(m[1]), end: Number(m[2]) }));
    for (const w of words) {
      const last = turns.findLast((t) => t.speaker === agent);
      if (last && w.start - last.end < 0.5) last.end = Math.max(last.end, w.end);
      else turns.push({ speaker: agent, start: w.start, end: w.end });
    }
  }
  return turns.sort((a, b) => a.start - b.start);
}

function truthReference(path: string): () => RefTurn[] {
  return () => (JSON.parse(readFileSync(path, "utf8")).turns as { speaker: string; start: number; end: number }[]).map((t) => ({ ...t }));
}

const DATASETS: Dataset[] = [
  {
    name: "fathom-cricket",
    audio: "docs/fathom-research/recording1/Impromptu Google Meet Meeting - Oct 2 2026 (1).mp4",
    contentType: "video/mp4",
    reference: fathomReference("docs/fathom-research/recording1/transcript.txt", { "Abdullah Farhan": "Abdullah", "Muhammad Asim Iftikhar": "Asim" }),
    names: null, // names are never said in this call; the eval scores attribution only
    date: "2026-10-02",
    collar: 1, // Fathom timestamps are whole seconds and short replies are folded into turns
  },
  {
    name: "fathom-house",
    audio: "samples/fathom/house-plans.mp4",
    contentType: "video/mp4",
    reference: fathomReference("docs/fathom-research/recording2/transcript.txt", { "Abdullah Farhan": "Abdullah", "Muhammad Asim Iftikhar": "Asim" }),
    names: null,
    date: "2026-10-02",
    collar: 1,
  },
  { name: "ami", audio: "samples/ami/EN2001a.mp3", contentType: "audio/mpeg", reference: amiReference, names: null, date: "2026-09-28", collar: 0.25 },
  {
    name: "offsite",
    audio: "samples/offsite-planning.wav",
    contentType: "audio/wav",
    reference: truthReference("samples/offsite-planning.truth.json"),
    names: { Priya: "Priya", Marcus: "Marcus", Elena: "Elena", Tom: "Tom", Grace: "" }, // Grace's name is never said
    date: "2026-10-03",
    collar: 0.25,
  },
];

// ---------- transcription (cached) ----------

async function deepgram(d: Dataset): Promise<DeepgramResponse> {
  const file = `${CACHE}/${d.name}.deepgram.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  process.stdout.write(`  transcribing ${d.name} (not cached)…\n`);
  const data = await requestTranscription({ bytes: readFileSync(d.audio), contentType: d.contentType });
  writeFileSync(file, JSON.stringify(data));
  return data;
}

// ---------- metrics ----------

const STEP = 0.2;

// Attribution: at every 0.2 s where both the reference and the hypothesis have speech, is the
// hypothesis speaker (mapped one-to-one to a true speaker by maximum overlap) a true speaker?
function attribution(ref: RefTurn[], hyp: Segment[], collar = 0) {
  const end = Math.max(...ref.map((r) => r.end), ...hyp.map((h) => h.end_s));
  const n = Math.ceil(end / STEP);
  const refAt: string[][] = Array.from({ length: n }, () => []);
  for (const r of ref) for (let i = Math.floor(r.start / STEP); i < Math.min(n, Math.ceil(r.end / STEP)); i++) refAt[i].push(r.speaker);
  const skip = new Array(n).fill(false);
  for (const r of ref)
    for (const edge of [r.start, r.end])
      for (let i = Math.max(0, Math.floor((edge - collar) / STEP)); i < Math.min(n, Math.ceil((edge + collar) / STEP)); i++) skip[i] = true;
  const hypAt: (string | null)[] = new Array(n).fill(null);
  for (const h of hyp) for (let i = Math.floor(h.start_s / STEP); i < Math.min(n, Math.ceil(h.end_s / STEP)); i++) hypAt[i] = h.speaker;

  const overlap = new Map<string, Map<string, number>>();
  let frames = 0;
  for (let i = 0; i < n; i++) {
    const h = hypAt[i];
    if (h === null || !refAt[i].length || skip[i]) continue;
    frames++;
    for (const r of refAt[i]) {
      const m = overlap.get(h) ?? new Map();
      m.set(r, (m.get(r) ?? 0) + 1);
      overlap.set(h, m);
    }
  }
  // greedy one-to-one mapping by largest overlap
  const pairs = [...overlap].flatMap(([h, m]) => [...m].map(([r, c]) => ({ h, r, c }))).sort((a, b) => b.c - a.c);
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const p of pairs) if (!map.has(p.h) && !used.has(p.r)) (map.set(p.h, p.r), used.add(p.r));
  // majority true speaker per hypothesis label (for naming), without the one-to-one constraint
  const majority = new Map<string, string>();
  for (const [h, m] of overlap) majority.set(h, [...m].sort((a, b) => b[1] - a[1])[0][0]);

  let correct = 0;
  for (let i = 0; i < n; i++) {
    const h = hypAt[i];
    if (h === null || !refAt[i].length || skip[i]) continue;
    if (refAt[i].includes(map.get(h) ?? "")) correct++;
  }
  const refSpeakers = new Set(ref.map((r) => r.speaker));
  const talk = new Map<string, number>();
  for (const s of hyp) talk.set(s.speaker, (talk.get(s.speaker) ?? 0) + s.end_s - s.start_s);
  return { accuracy: correct / Math.max(1, frames), hypSpeakers: talk.size, refSpeakers: refSpeakers.size, majority, talk };
}

function sameName(a: string, b: string) {
  return a.toLowerCase().slice(0, 3) === b.toLowerCase().slice(0, 3);
}

// Naming: for each hypothesis speaker with >2% of talk time, compare the assigned name to the
// true speaker's name. Wrong names are the critical failure; an empty truth name means "should stay unnamed".
function naming(d: Dataset, speakers: Record<string, string>, guesses: Record<string, { evidence: string }>, a: ReturnType<typeof attribution>) {
  const total = [...a.talk.values()].reduce((x, y) => x + y, 0);
  const rows: string[] = [];
  let correct = 0, wrong = 0, unnamed = 0, wrongCited = 0;
  for (const [label, secs] of [...a.talk].sort((x, y) => y[1] - x[1])) {
    if (secs / total < 0.02) continue;
    const truth = a.majority.get(label);
    const expected = truth !== undefined ? (d.names![truth] ?? "") : "";
    const got = speakers[label];
    const kind = guesses[label]?.evidence === "model" ? "guess" : guesses[label] ? "cited" : "-";
    let verdict: string;
    if (!got) {
      verdict = expected ? "unnamed (could have been named)" : "unnamed ✓";
      if (expected) unnamed++;
      else correct++;
    } else if (expected && sameName(got, expected)) {
      verdict = "✓";
      correct++;
    } else {
      verdict = "✗ WRONG";
      wrong++;
      if (kind === "cited") wrongCited++;
    }
    rows.push(`      spk${label.padEnd(3)} ${String(Math.round((secs / total) * 100)).padStart(3)}%  truth=${(truth ?? "?").padEnd(9)} got=${(got ?? "-").padEnd(10)} ${kind.padEnd(6)} ${verdict}`);
  }
  return { correct, wrong, unnamed, wrongCited, rows };
}

// ---------- run ----------

const only = process.argv.slice(2);
const methods: TurnMethod[] = ["utterances", "words"];
const summary: string[] = [];
for (const d of DATASETS) {
  if (only.length && !only.includes(d.name)) continue;
  if (!existsSync(d.audio)) {
    console.log(`skip ${d.name}: ${d.audio} not found`);
    continue;
  }
  const data = await deepgram(d);
  const ref = d.reference();
  console.log(`\n=== ${d.name}: ${new Set(ref.map((r) => r.speaker)).size} true speakers, ${Math.round(ref.at(-1)!.end / 60)} min`);
  for (const method of methods) {
    const segs = segmentsFromResponse(data, method);
    const a = attribution(ref, segs, d.collar);
    console.log(`  [${method}] attribution ${(a.accuracy * 100).toFixed(1)}%  speakers found ${a.hypSpeakers} (true ${a.refSpeakers})  turns ${segs.length}`);
    let line = `${d.name.padEnd(15)} ${method.padEnd(10)} attribution ${(a.accuracy * 100).toFixed(1).padStart(5)}%  speakers ${a.hypSpeakers}/${a.refSpeakers}`;
    if (d.names) {
      const { notes, speakers } = await writeNotes(segs, {}, d.date);
      const n = naming(d, speakers, notes.speaker_guesses ?? {}, a);
      console.log(n.rows.join("\n"));
      line += `  names ✓${n.correct} ✗${n.wrong} (cited ✗${n.wrongCited}) missed ${n.unnamed}`;
    }
    summary.push(line);
  }
}
console.log(`\n${summary.join("\n")}`);
