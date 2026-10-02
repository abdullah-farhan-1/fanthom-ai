import { z } from "zod";
import { generateJson } from "./gemini";
import { TEMPLATES, type TemplateKey } from "./templates";
import { formatTime } from "./transcript";
import type { Segment } from "./types";

// ---------- What the model must return ----------

const Cited = { idx: z.number().int(), quote: z.string() };

const RawNotes = z.object({
  overview: z.string(),
  speaker_names: z.array(z.object({ label: z.string(), name: z.string(), idx: z.number().int() })).default([]),
  chapters: z.array(z.object({ title: z.string(), idx: z.number().int() })).default([]),
  action_items: z
    .array(
      z.object({
        task: z.string(),
        owner: z.string().nullable(),
        due_text: z.string().nullable(),
        due_date: z.string().nullable(),
        ...Cited,
      }),
    )
    .default([]),
  decisions: z.array(z.object({ text: z.string(), ...Cited })).default([]),
  questions: z.array(z.object({ text: z.string(), idx: z.number().int() })).default([]),
});

const RawSummary = z.object({
  sections: z.array(
    z.object({ heading: z.string(), bullets: z.array(z.object({ text: z.string(), idx: z.number().int().nullable() })) }),
  ),
});

// ---------- What we store after checking ----------

export interface Check {
  status: "ok" | "needs_review";
  reasons: string[];
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
}
export type Summary = z.infer<typeof RawSummary>;

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

async function askNotes(segments: Segment[], speakers: Record<string, string>, meetingDate: string) {
  const prompt = `You are an AI meeting notetaker. The meeting took place on ${dateLine(meetingDate)}.

Transcript (one line per utterance):
${transcriptBlock(segments, speakers)}

Return JSON with exactly these keys:
{
  "overview": "2-4 sentence summary of what the meeting was about and its outcome. No small talk.",
  "speaker_names": [{"label": "Speaker N exactly as shown", "name": "real name", "idx": line where the name is evident}]  // only when a generic "Speaker N" label's real name is clearly stated or addressed in the transcript,
  "chapters": [{"title": "short topic title", "idx": first line of the topic}]  // 2-8 chapters in order; fewer for short meetings,
  "action_items": [{"task": "imperative, specific", "owner": "name as it appears in the transcript, or null", "due_text": "the words used for the deadline, or null", "due_date": "YYYY-MM-DD resolved from the meeting date, or null", "idx": 0, "quote": "..."}]  // explicit commitments or assignments, not ideas or maybes. First-person commitments count and are owned by the speaker ("I'll send it", "I can have the fix in by Friday"). If the meeting ends with a recap, check every task in it is in this list. Cite the line where the commitment was first made,
  "decisions": [{"text": "what was agreed", "idx": 0, "quote": "..."}],
  "questions": [{"text": "open question left unresolved", "idx": 0}]
}

${RULES}`;
  const { text, model } = await generateJson(prompt);
  return { raw: RawNotes.parse(JSON.parse(text)), model };
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

${RULES}`;
  const { text, model } = await generateJson(prompt);
  const summary = RawSummary.parse(JSON.parse(text));
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

  const decisions: Decision[] = raw.decisions.map((d) => {
    const reasons = citationProblems(d.idx, d.quote, segments);
    return { ...d, status: reasons.length ? "needs_review" : "ok", reasons };
  });

  return {
    overview: raw.overview,
    chapters: raw.chapters.filter((c) => c.idx >= 0 && c.idx <= max).sort((a, b) => a.idx - b.idx),
    action_items: kept,
    decisions,
    questions: raw.questions.filter((q) => q.idx >= 0 && q.idx <= max),
    merged_duplicates: merged,
  };
}

// Speaker names the model found, applied only to generic numeric labels that exist.
function inferredSpeakers(raw: z.infer<typeof RawNotes>, segments: Segment[], speakers: Record<string, string>) {
  const labels = new Set(segments.map((s) => s.speaker));
  const out: Record<string, string> = {};
  for (const { label, name } of raw.speaker_names) {
    const n = /^Speaker (\d+)$/.exec(label.trim());
    const key = n ? String(Number(n[1]) - 1) : null;
    if (key && labels.has(key) && !speakers[key] && name.trim()) out[key] = name.trim();
  }
  return out;
}

export async function writeNotes(segments: Segment[], speakers: Record<string, string>, meetingDate: string) {
  let attempt;
  try {
    attempt = await askNotes(segments, speakers, meetingDate);
  } catch (err) {
    // Malformed JSON or wrong shape: one retry before giving up.
    if (!(err instanceof SyntaxError || err instanceof z.ZodError)) throw err;
    attempt = await askNotes(segments, speakers, meetingDate);
  }
  const newSpeakers = inferredSpeakers(attempt.raw, segments, speakers);
  const allSpeakers = { ...speakers, ...newSpeakers };
  return { notes: checkNotes(attempt.raw, segments, allSpeakers, meetingDate), speakers: allSpeakers, model: attempt.model };
}
