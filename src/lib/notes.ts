import { z } from "zod";
import { generateJson } from "./gemini";
import { TEMPLATES, type TemplateKey } from "./templates";
import { formatTime } from "./transcript";
import type { Segment } from "./types";

// ---------- What the model must return ----------

// Model output varies run to run, so parsing is lenient per field and per item: optional fields
// default to null, numbers sent as strings are coerced, and one malformed item is dropped rather
// than failing the whole meeting. Correctness is then enforced by the transcript checks below.
const Idx = z.coerce.number().int().catch(-1); // invalid -> -1, which the citation check flags
const Text = z.coerce.string().catch("");
const Optional = z.string().nullish().transform((v) => (v && v.trim() ? v : null)).catch(null);

let droppedItems = 0;
function items<T extends z.ZodTypeAny>(schema: T) {
  return z
    .array(z.unknown())
    .catch([])
    .default([])
    .transform((list) =>
      list.flatMap((x) => {
        const r = schema.safeParse(x);
        if (!r.success) droppedItems++;
        return r.success ? [r.data as z.infer<T>] : [];
      }),
    );
}

const Cited = { idx: Idx, quote: Text };

const RawNotes = z.object({
  overview: Text.default(""),
  participants: items(z.string().trim().min(2)),
  speaker_names: items(
    z.object({ label: z.string(), name: z.string().min(1), idx: Idx, evidence: z.enum(["self", "addressed"]).catch("addressed") }),
  ),
  chapters: items(z.object({ title: z.string().min(1), idx: Idx })),
  action_items: items(
    z.object({
      task: z.string().min(1),
      owner: Optional,
      due_text: Optional,
      due_date: Optional,
      ...Cited,
    }),
  ),
  decisions: items(z.object({ text: z.string().min(1), ...Cited })),
  questions: items(z.object({ text: z.string().min(1), idx: Idx })),
});

const RawSummary = z.object({
  sections: items(
    z.object({
      heading: z.string().min(1),
      bullets: items(z.object({ text: z.string().min(1), idx: z.coerce.number().int().nullish().catch(null).transform((v) => v ?? null) })),
    }),
  ),
});

// ---------- What we store after checking ----------

export interface Check {
  status: "ok" | "needs_review";
  reasons: string[];
  review?: "approved" | "removed" | null; // set by a person in the UI
  done?: boolean;
}
export type ActionItem = z.infer<typeof RawNotes>["action_items"][number] & Check;
export type Decision = z.infer<typeof RawNotes>["decisions"][number] & Check;
export interface Notes {
  overview: string;
  chapters: { title: string; idx: number }[];
  action_items: ActionItem[];
  decisions: Decision[];
  questions: { text: string; idx: number }[];
  merged_duplicates: number;
  speaker_guesses?: Record<string, SpeakerGuess>; // names the AI inferred (with evidence), not set by a person
}
export type Summary = z.infer<typeof RawSummary>;

// JSON.parse with a readable error, tolerating a ```json fence around the payload.
class FormatError extends Error {}
function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new FormatError("The AI returned notes in an unreadable format. Try again.");
  }
}

// ---------- Prompting ----------

function transcriptBlock(segments: Segment[], speakers: Record<string, string>) {
  return segments
    .map((s) => `[${s.idx}] (${formatTime(s.start_s)}) ${speakerName(s.speaker, speakers)}: ${s.text}`)
    .join("\n");
}

export function speakerName(label: string, speakers: Record<string, string>) {
  return speakers[label] ?? (/^\d+$/.test(label) ? `Speaker ${Number(label) + 1}` : label);
}

function dateLine(meetingDate: string) {
  const weekday = new Date(`${meetingDate}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `${weekday} ${meetingDate}`;
}

const RULES = `Rules:
- Use only what is said in the transcript. Never invent people, tasks, dates or decisions.
- Every cited "idx" must be the number in [brackets] of the line that supports the item, and "quote" must be copied verbatim from that line (at most 25 words).
- If something is proposed and later changed in the meeting, report only the final version.
- Empty arrays are correct when nothing qualifies. Do not pad.`;

interface Part {
  n: number;
  of: number;
  from: string;
  to: string;
}

async function askNotes(segments: Segment[], speakers: Record<string, string>, meetingDate: string, chapters: string, part?: Part) {
  const scope = part
    ? `\nThis is part ${part.n} of ${part.of} of a longer meeting (${part.from} to ${part.to}). Extract only what is in this part; the other parts are handled separately. Line numbers are global, so cite them exactly as shown.\n`
    : "";
  const prompt = `You are an AI meeting notetaker. The meeting took place on ${dateLine(meetingDate)}.${scope}

Transcript (one line per utterance):
${transcriptBlock(segments, speakers)}

Return JSON with exactly these keys:
{
  "overview": "2-4 sentence summary of what the meeting was about and its outcome. No small talk.",
  "participants": ["first name of each person who SPEAKS in this meeting, not people who are only mentioned"],
  "speaker_names": [{"label": "Speaker N exactly as shown", "name": "first name", "idx": line number of the evidence, "evidence": "self" | "addressed"}]  // for generic "Speaker N" labels only. "self": on line idx that speaker states their own name ("I'm Sara"). "addressed": on line idx a DIFFERENT speaker says the name while talking to Speaker N ("Good to see you, Sara"), so cite the other speaker's line. List every piece of evidence you find, including repeats,
  "chapters": [{"title": "short topic title", "idx": first line of the topic}]  // ${chapters} chapters in order, each a distinct topic,
  "action_items": [{"task": "imperative, specific", "owner": "name as it appears in the transcript, or null", "due_text": "the words used for the deadline, or null", "due_date": "YYYY-MM-DD resolved from the meeting date, or null", "idx": 0, "quote": "..."}]  // explicit commitments or assignments, not ideas or maybes. First-person commitments count and are owned by the speaker ("I'll send it", "I can have the fix in by Friday"). If the meeting ends with a recap, check every task in it is in this list. Cite the line where the commitment was first made,
  "decisions": [{"text": "what was agreed", "idx": 0, "quote": "..."}],
  "questions": [{"text": "open question left unresolved", "idx": 0}]
}

${RULES}`;
  const { text, model } = await generateJson(prompt);
  droppedItems = 0;
  const raw = RawNotes.parse(parseJson(text));
  if (droppedItems) console.warn(`notes: dropped ${droppedItems} malformed item(s) from ${model}`);
  return { raw, model };
}

export async function writeSummary(
  segments: Segment[],
  speakers: Record<string, string>,
  meetingDate: string,
  template: TemplateKey,
): Promise<{ summary: Summary; model: string }> {
  const t = TEMPLATES[template];
  const prompt = `You are an AI meeting notetaker writing "${t.label}" notes. ${t.guidance}
The meeting took place on ${dateLine(meetingDate)}.

Transcript (one line per utterance):
${transcriptBlock(segments, speakers)}

Return JSON: {"sections": [{"heading": "...", "bullets": [{"text": "...", "idx": line number that supports it, or null}]}]}
Use these section headings in order: ${t.sections.map((s) => `"${s}"`).join(", ")}.
Bullets are concise (one sentence). If a section has nothing relevant, give it a single bullet "Not discussed." with idx null.
The meeting is ${Math.max(1, Math.round(((segments.at(-1)?.end_s ?? 0) - (segments[0]?.start_s ?? 0)) / 60))} minutes long: cover all of it, scaling detail with length (about one bullet per 5 minutes in the longest section, at most 12 bullets per section).

${RULES}`;
  const { text, model } = await generateJson(prompt);
  const summary = RawSummary.parse(parseJson(text));
  const max = segments.length - 1;
  for (const section of summary.sections) {
    for (const b of section.bullets) if (b.idx !== null && (b.idx < 0 || b.idx > max)) b.idx = null;
  }
  return { summary, model };
}

// ---------- Quality checks (plain code, transcript is the source of truth) ----------

const STOP = new Set("a an the and or but to of in on at for with is are was were be been it this that i you we they he she um uh like so just".split(" "));

function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

// Share of the quote's words found in the cited line or its neighbours.
function quoteSupport(quote: string, idx: number, segments: Segment[]) {
  const window = segments.slice(Math.max(0, idx - 2), idx + 3).map((s) => s.text).join(" ");
  const have = new Set(tokens(window));
  const want = tokens(quote);
  if (!want.length) return 0;
  return want.filter((t) => have.has(t)).length / want.length;
}

function editDistance(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

// Names the transcript knows about: speaker labels/names plus capitalised words people said.
function knownNames(segments: Segment[], speakers: Record<string, string>) {
  const names = new Set<string>();
  for (const s of segments) {
    speakerName(s.speaker, speakers)
      .toLowerCase()
      .split(/\s+/)
      .forEach((n) => names.add(n));
    for (const m of s.text.matchAll(/\b[A-Z][a-z]{2,}\b/g)) names.add(m[0].toLowerCase());
  }
  return names;
}

function ownerKnown(owner: string, names: Set<string>) {
  return owner
    .toLowerCase()
    .split(/\s+/)
    .some((part) => [...names].some((n) => n === part || (part.length >= 4 && editDistance(n, part) <= 1)));
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function dateProblems(due_text: string | null, due_date: string | null, meetingDate: string): string[] {
  if (!due_date) return due_text ? [`Deadline "${due_text}" could not be resolved to a date`] : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date) || Number.isNaN(Date.parse(due_date))) return [`"${due_date}" is not a valid date`];
  if (due_date < meetingDate) return [`Due date ${due_date} is before the meeting`];
  const weekday = WEEKDAYS.find((d) => due_text?.toLowerCase().includes(d));
  if (weekday) {
    const actual = WEEKDAYS[new Date(`${due_date}T00:00:00Z`).getUTCDay()];
    if (actual !== weekday) return [`"${due_text}" but ${due_date} is a ${actual[0].toUpperCase()}${actual.slice(1)}`];
  }
  return [];
}

function similar(a: string, b: string) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  const inter = [...A].filter((t) => B.has(t)).length;
  return inter / Math.max(1, new Set([...A, ...B]).size);
}

function citationProblems(idx: number, quote: string, segments: Segment[]) {
  if (idx < 0 || idx >= segments.length) return ["Cites a line that does not exist"];
  return quoteSupport(quote, idx, segments) < 0.6 ? ["Quote not found in the transcript near the cited line"] : [];
}

export function checkNotes(raw: z.infer<typeof RawNotes>, segments: Segment[], speakers: Record<string, string>, meetingDate: string): Notes {
  const names = knownNames(segments, speakers);
  const max = segments.length - 1;

  const items: ActionItem[] = raw.action_items.map((a) => {
    const reasons = citationProblems(a.idx, a.quote, segments);
    if (!a.owner) reasons.push("No owner assigned");
    else if (!ownerKnown(a.owner, names)) reasons.push(`Owner "${a.owner}" is not mentioned in the meeting`);
    reasons.push(...dateProblems(a.due_text, a.due_date, meetingDate));
    return { ...a, status: reasons.length ? "needs_review" : "ok", reasons };
  });

  // Merge near-duplicates (e.g. repeated in a recap): keep the earliest mention.
  const kept: ActionItem[] = [];
  let merged = 0;
  for (const item of [...items].sort((a, b) => a.idx - b.idx)) {
    const dup = kept.find((k) => (k.owner ?? "") === (item.owner ?? "") && similar(k.task, item.task) >= 0.5);
    if (dup) merged++;
    else kept.push(item);
  }

  const decisions: Decision[] = [];
  for (const d of [...raw.decisions].sort((a, b) => a.idx - b.idx)) {
    if (decisions.some((k) => similar(k.text, d.text) >= 0.5)) {
      merged++;
      continue;
    }
    const reasons = citationProblems(d.idx, d.quote, segments);
    decisions.push({ ...d, status: reasons.length ? "needs_review" : "ok", reasons });
  }
  const questions: { text: string; idx: number }[] = [];
  for (const q of raw.questions.filter((q) => q.idx >= 0 && q.idx <= max).sort((a, b) => a.idx - b.idx)) {
    if (!questions.some((k) => similar(k.text, q.text) >= 0.5)) questions.push(q);
  }

  return {
    overview: raw.overview,
    chapters: raw.chapters.filter((c) => c.idx >= 0 && c.idx <= max).sort((a, b) => a.idx - b.idx),
    action_items: kept,
    decisions,
    questions,
    merged_duplicates: merged,
  };
}

// ---------- Speaker names: evidence, checked against the transcript, then voted ----------

export interface SpeakerGuess {
  name: string;
  score: number;
  idx: number; // strongest evidence line
  evidence: "self" | "addressed" | "model"; // "model": the AI's suggestion, not backed by the transcript
}

const NOT_NAMES = new Set(
  ("sorry sure fine good great glad here there just not going gonna happy trying okay ok yes yeah no so really very also still " +
    "with from the a an in on at can could will would what when where why who how that this it you we they he she but and " +
    "because well now then actually honestly basically totally like right done ready back sir mister doctor everyone everybody guys")
    .split(" "),
);
// "this is X" is left out: in conversation it is mostly "this is Can you believe it…".
const SELF_INTRO = /\b(?:[Ii]'m|[Ii] am|[Mm]y name is|[Mm]y name's)\s+([A-Z][a-z]{2,})\b/g;
// Vocative: "Charles, I wanna…" / "…good to see you, Shane." The speaker is talking TO that name.
const VOCATIVE = /(?:^|[.?!]\s+)([A-Z][a-z]{2,}),|,\s+([A-Z][a-z]{2,})[.?!]/g;

function sameName(a: string, b: string) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return true;
  // Piers ~ Pierce ~ "Piz" (mis-transcribed): same opening and only a few edits apart
  return x.slice(0, 2) === y.slice(0, 2) && editDistance(x, y) <= (Math.min(x.length, y.length) >= 4 ? 2 : 3);
}

// Checks one piece of evidence against the transcript and returns its weight (0 = rejected).
function evidenceWeight(label: string, name: string, idx: number, kind: "self" | "addressed", segments: Segment[]) {
  const seg = segments[idx];
  if (!seg) return 0;
  const said = new RegExp(`\\b${name.replace(/[^a-z]/gi, "").slice(0, 4)}`, "i").test(seg.text);
  if (!said) return 0;
  if (kind === "self") return seg.speaker === label ? 2 : 0;
  // addressed: someone else says the name, and the named speaker talks right before or after
  if (seg.speaker === label) return 0;
  const near = segments.slice(Math.max(0, idx - 2), idx + 3).some((s) => s.speaker === label);
  return near ? 1 : 0;
}

export function inferSpeakers(raw: z.infer<typeof RawNotes>, segments: Segment[], speakers: Record<string, string>) {
  const labels = new Set(segments.map((s) => s.speaker));
  const votes = new Map<string, Map<string, { score: number; best: { idx: number; kind: "self" | "addressed"; w: number } }>>();
  const add = (label: string, name: string, idx: number, kind: "self" | "addressed", w: number) => {
    if (!w || NOT_NAMES.has(name.toLowerCase())) return;
    const byName = votes.get(label) ?? new Map();
    const key = [...byName.keys()].find((k) => sameName(k, name)) ?? name;
    const entry = byName.get(key) ?? { score: 0, best: { idx, kind, w: 0 } };
    entry.score += w;
    if (w > entry.best.w) entry.best = { idx, kind, w };
    byName.set(key, entry);
    votes.set(label, byName);
  };

  // Evidence from the model (checked), plus self-introductions found directly in the transcript.
  for (const g of raw.speaker_names) {
    const n = /^Speaker (\d+)$/.exec(g.label.trim());
    const label = n ? String(Number(n[1]) - 1) : null;
    if (!label || !labels.has(label)) continue;
    const name = g.name.trim().split(/\s+/)[0];
    add(label, name, g.idx, g.evidence, evidenceWeight(label, name, g.idx, g.evidence, segments));
  }
  for (const seg of segments) {
    if (!/^\d+$/.test(seg.speaker)) continue;
    for (const m of seg.text.matchAll(SELF_INTRO)) {
      // A real introduction is usually echoed nearby ("My name is Evan." "Evan? Nice to meet you, Evan.");
      // a transcription glitch ("I'm Answer") is not.
      const around = segments.slice(Math.max(0, seg.idx - 1), seg.idx + 2).map((x) => x.text).join(" ");
      const echoes = around.match(new RegExp(`\\b${m[1]}\\b`, "g"))?.length ?? 0;
      add(seg.speaker, m[1], seg.idx, "self", echoes >= 2 ? 3 : 2);
    }
  }

  const participants = raw.participants
    .map((p) => p.trim().split(/\s+/)[0])
    .filter((p) => /^[A-Z][a-z]+$/.test(p) && !/^speaker$/i.test(p) && !NOT_NAMES.has(p.toLowerCase()));
  const isParticipant = (name: string) => participants.some((p) => sameName(p, name));

  // Someone who calls out "Charles, …" is talking to Charles: weak evidence for the neighbouring
  // speaker, and proof that the caller is not Charles.
  // label -> names it addressed (and how often). Diarization sometimes merges one person's words into
  // another's turn, so this counts against a name instead of ruling it out.
  const notThem = new Map<string, string[]>();
  for (const seg of segments) {
    for (const m of seg.text.matchAll(VOCATIVE)) {
      const name = m[1] ?? m[2];
      if (NOT_NAMES.has(name.toLowerCase())) continue;
      // Always safe: the caller is not the person they are calling.
      notThem.set(seg.speaker, [...(notThem.get(seg.speaker) ?? []), name]);
      // As evidence for the other speaker, only names the model lists as participants count
      // ("Well," "Man," "Legos," match the pattern too).
      if (!isParticipant(name)) continue;
      const other = [segments[seg.idx + 1], segments[seg.idx - 1]].find((x) => x && x.speaker !== seg.speaker);
      if (other && /^\d+$/.test(other.speaker)) add(other.speaker, name, seg.idx, "addressed", 1);
    }
  }
  const contradictions = (label: string, name: string) => (notThem.get(label) ?? []).filter((n) => sameName(n, name)).length;
  const contradicted = (label: string, name: string) => contradictions(label, name) > (votes.get(label)?.get(name)?.score ?? 0);
  for (const [label, byName] of votes)
    for (const [name, v] of [...byName]) {
      v.score -= contradictions(label, name);
      if (v.score <= 0) byName.delete(name);
    }

  if (process.env.FANTHOM_DEBUG_NAMES) {
    console.log("participants:", participants.join(", "));
    for (const [label, byName] of votes)
      console.log(`  votes spk${label}:`, [...byName].map(([n, v]) => `${n}=${v.score}`).join(" "));
  }

  // Each label: the name with the most evidence, if it clearly beats the runner-up.
  const candidates: { label: string; guess: SpeakerGuess }[] = [];
  for (const [label, byName] of votes) {
    if (speakers[label]) continue; // a person already named this speaker
    const ranked = [...byName.entries()].sort((a, b) => b[1].score - a[1].score);
    const [top, second] = ranked;
    if (!top || top[1].score < 2 || (second && second[1].score >= top[1].score)) continue; // ties stay unnamed
    candidates.push({ label, guess: { name: top[0], score: top[1].score, idx: top[1].best.idx, evidence: top[1].best.kind } });
  }
  // A name belongs to one speaker: the one with the strongest evidence keeps it.
  const out: Record<string, SpeakerGuess> = {};
  for (const c of candidates.sort((a, b) => b.guess.score - a.guess.score)) {
    const taken = Object.entries(speakers).some(([l, n]) => l !== c.label && sameName(n, c.guess.name)) ||
      Object.values(out).some((g) => sameName(g.name, c.guess.name));
    if (!taken) out[c.label] = c.guess;
  }

  // Fallback for speakers the transcript doesn't name: the model's most frequent suggestion,
  // marked as unverified, and never a name already given to someone else.
  const taken = (name: string, label: string) =>
    Object.entries(speakers).some(([l, n]) => l !== label && sameName(n, name)) ||
    Object.entries(out).some(([l, g]) => l !== label && sameName(g.name, name));
  const suggestions = new Map<string, Map<string, { count: number; idx: number }>>();
  for (const g of raw.speaker_names) {
    const n = /^Speaker (\d+)$/.exec(g.label.trim());
    const label = n ? String(Number(n[1]) - 1) : null;
    const name = g.name.trim().split(/\s+/)[0];
    if (!label || !labels.has(label) || speakers[label] || out[label] || !name || NOT_NAMES.has(name.toLowerCase())) continue;
    if (contradicted(label, name)) continue; // the transcript shows this speaker talking TO that name
    const byName = suggestions.get(label) ?? new Map();
    const key = [...byName.keys()].find((k) => sameName(k, name)) ?? name;
    const entry = byName.get(key) ?? { count: 0, idx: g.idx };
    entry.count++;
    byName.set(key, entry);
    suggestions.set(label, byName);
  }
  // Weak transcript evidence (a single "…joining me, Dan") counts as a suggestion too, for participants only.
  for (const [label, byName] of votes) {
    if (speakers[label] || out[label]) continue;
    for (const [name, v] of byName) {
      if (!isParticipant(name)) continue;
      const sug = suggestions.get(label) ?? new Map();
      const key = [...sug.keys()].find((k) => sameName(k, name)) ?? name;
      const entry = sug.get(key) ?? { count: 0, idx: v.best.idx };
      entry.count += v.score;
      sug.set(key, entry);
      suggestions.set(label, sug);
    }
  }
  for (const [label, byName] of suggestions) {
    const [top] = [...byName.entries()].sort((a, b) => b[1].count - a[1].count);
    if (top && !taken(top[0], label)) out[label] = { name: top[0], score: 0, idx: top[1].idx, evidence: "model" };
  }

  // One speaker left unnamed and one participant left unassigned: pair them, as a guess.
  const unnamed = [...labels].filter((l) => /^\d+$/.test(l) && !speakers[l] && !out[l] && !participants.some((p) => contradicted(l, p)));
  const unused = [...new Set(participants)].filter((p) => !Object.values(speakers).some((n) => sameName(n, p)) && !Object.values(out).some((g) => sameName(g.name, p)));
  if (unnamed.length === 1 && unused.length === 1 && !contradicted(unnamed[0], unused[0])) {
    const idx = segments.find((x) => x.speaker === unnamed[0])?.idx ?? 0;
    out[unnamed[0]] = { name: unused[0], score: 0, idx, evidence: "model" };
  }
  return out;
}

const WINDOW_S = 15 * 60;
const SINGLE_PASS_MAX_S = 20 * 60;
const PARALLEL = 3;

async function askNotesWithRetry(...args: Parameters<typeof askNotes>) {
  try {
    return await askNotes(...args);
  } catch (err) {
    // Malformed JSON or wrong shape: one retry before giving up.
    if (!(err instanceof FormatError || err instanceof z.ZodError)) throw err;
    return askNotes(...args);
  }
}

// Long meetings: small models skim very long inputs, so extract per 15-minute window in parallel
// (line numbers stay global so citations remain checkable), then merge and write one overview.
async function notesForLongMeeting(segments: Segment[], speakers: Record<string, string>, meetingDate: string) {
  const windows: Segment[][] = [];
  for (const s of segments) {
    const w = Math.floor((s.start_s - segments[0].start_s) / WINDOW_S);
    (windows[w] ??= []).push(s);
  }
  const parts = windows.filter((w) => w?.length);
  const results: Awaited<ReturnType<typeof askNotes>>[] = new Array(parts.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, parts.length) }, async () => {
      while (next < parts.length) {
        const i = next++;
        const w = parts[i];
        const part = { n: i + 1, of: parts.length, from: formatTime(w[0].start_s), to: formatTime(w.at(-1)!.end_s) };
        results[i] = await askNotesWithRetry(w, speakers, meetingDate, "2-3", part);
      }
    }),
  );

  const overviewPrompt = `These are summaries of consecutive parts of one meeting, in order:
${results.map((r, i) => `Part ${i + 1}: ${r.raw.overview}`).join("\n")}

Return JSON {"overview": "..."}: a 3-5 sentence summary of the whole meeting, its main topics and outcomes. No new facts.`;
  const { text } = await generateJson(overviewPrompt);
  const overview = z.object({ overview: Text }).parse(parseJson(text)).overview;

  const raw: z.infer<typeof RawNotes> = {
    overview,
    participants: results.flatMap((r) => r.raw.participants),
    speaker_names: results.flatMap((r) => r.raw.speaker_names),
    chapters: results.flatMap((r) => r.raw.chapters),
    action_items: results.flatMap((r) => r.raw.action_items),
    decisions: results.flatMap((r) => r.raw.decisions),
    questions: results.flatMap((r) => r.raw.questions),
  };
  return { raw, model: results[0]?.model ?? "unknown" };
}

export async function writeNotes(segments: Segment[], speakers: Record<string, string>, meetingDate: string) {
  const duration = (segments.at(-1)?.end_s ?? 0) - (segments[0]?.start_s ?? 0);
  const attempt =
    duration > SINGLE_PASS_MAX_S
      ? await notesForLongMeeting(segments, speakers, meetingDate)
      : await askNotesWithRetry(segments, speakers, meetingDate, duration < 5 * 60 ? "2-3" : "3-6");
  const guesses = inferSpeakers(attempt.raw, segments, speakers);
  const allSpeakers = { ...speakers, ...Object.fromEntries(Object.entries(guesses).map(([l, g]) => [l, g.name])) };
  const notes = { ...checkNotes(attempt.raw, segments, allSpeakers, meetingDate), speaker_guesses: guesses };
  return { notes, speakers: allSpeakers, model: attempt.model };
}
