import type { Segment } from "./types";

interface Utterance {
  start: number;
  end: number;
  speaker: number;
  transcript: string;
}

interface Word {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  speaker?: number;
}

export interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: { utterances?: Utterance[]; channels?: { alternatives?: { words?: Word[] }[] }[] };
}

export const DEEPGRAM_PARAMS = {
  model: "nova-3",
  smart_format: "true",
  diarize: "true",
  utterances: "true",
  punctuate: "true",
};

export type TurnMethod = "utterances" | "words";

// Raw Deepgram call. `source` is either a URL Deepgram fetches, or the audio bytes themselves.
export async function requestTranscription(source: { url: string } | { bytes: Uint8Array; contentType: string }): Promise<DeepgramResponse> {
  const isUrl = "url" in source;
  const res = await fetch(`https://api.deepgram.com/v1/listen?${new URLSearchParams(DEEPGRAM_PARAMS)}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": isUrl ? "application/json" : source.contentType,
    },
    body: isUrl ? JSON.stringify({ url: source.url }) : (source.bytes as BodyInit),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Transcription failed (Deepgram ${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Transcribes audio/video at a URL Deepgram can fetch (a short-lived signed Supabase URL).
export async function transcribeUrl(url: string, method: TurnMethod = DEFAULT_METHOD): Promise<{ segments: Segment[]; duration: number }> {
  const data = await requestTranscription({ url });
  const segments = segmentsFromResponse(data, method);
  if (!segments.length) throw new Error("No speech was found in this recording.");
  return { segments, duration: round(data.metadata?.duration ?? segments.at(-1)!.end_s) };
}

// Measured with npm run eval:speakers: on AMI EN2001a (hand-annotated, 5 speakers, 87 min) speaker
// attribution is 99.3% from word-level turns vs 92.4% from utterances.
export const DEFAULT_METHOD: TurnMethod = "words";

export function segmentsFromResponse(data: DeepgramResponse, method: TurnMethod): Segment[] {
  if (method === "words") {
    const words = data.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
    return turnsFromWords(words);
  }
  return mergeTurns((data.results?.utterances ?? []).filter((u) => u.transcript.trim()));
}

// Deepgram splits a speaker's turn at short pauses ("Life" / "is going good."). Join consecutive
// utterances from the same speaker into one turn, but keep turns under ~45 s so playback sync stays precise.
const MAX_GAP_S = 1.5;
const MAX_TURN_S = 45;

function mergeTurns(utterances: Utterance[]): Segment[] {
  const out: Segment[] = [];
  for (const u of utterances) {
    const speaker = String(u.speaker);
    const last = out.at(-1);
    if (last && last.speaker === speaker && u.start - last.end_s <= MAX_GAP_S && u.end - last.start_s <= MAX_TURN_S) {
      last.text += ` ${u.transcript.trim()}`;
      last.end_s = round(u.end);
    } else {
      out.push({ idx: out.length, speaker, start_s: round(u.start), end_s: round(u.end), text: u.transcript.trim() });
    }
  }
  return out;
}

// Turns from per-word speaker labels: a new turn starts whenever the speaker changes, so voices that
// Deepgram's utterances merge get separated. Short blips (<= 2 words) of another speaker between the
// same speaker on both sides are treated as noise and absorbed.
function turnsFromWords(raw: Word[]): Segment[] {
  const words = raw.filter((w) => w.speaker !== undefined).map((w) => ({ ...w, speaker: String(w.speaker) }));
  for (let i = 1; i < words.length - 1; i++) {
    let j = i;
    while (j < words.length && words[j].speaker === words[i].speaker) j++;
    const runLen = j - i;
    const prev = words[i - 1].speaker;
    if (runLen <= 2 && j < words.length && words[j].speaker === prev && words[i].speaker !== prev) {
      for (let k = i; k < j; k++) words[k].speaker = prev;
    }
    i = j - 1;
  }
  const out: Segment[] = [];
  for (const w of words) {
    const text = w.punctuated_word ?? w.word;
    const last = out.at(-1);
    if (last && last.speaker === w.speaker && w.start - last.end_s <= MAX_GAP_S && w.end - last.start_s <= MAX_TURN_S) {
      last.text += ` ${text}`;
      last.end_s = round(w.end);
    } else {
      out.push({ idx: out.length, speaker: w.speaker, start_s: round(w.start), end_s: round(w.end), text });
    }
  }
  return out;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
