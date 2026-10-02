import type { Segment } from "./types";

interface Utterance {
  start: number;
  end: number;
  speaker: number;
  transcript: string;
}

// Transcribes audio/video at a URL Deepgram can fetch (a short-lived signed Supabase URL).
export async function transcribeUrl(url: string): Promise<{ segments: Segment[]; duration: number }> {
  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    diarize: "true",
    utterances: "true",
    punctuate: "true",
  });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Transcription failed (Deepgram ${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const utterances: Utterance[] = data.results?.utterances ?? [];
  const segments = mergeTurns(utterances.filter((u) => u.transcript.trim()));
  if (!segments.length) throw new Error("No speech was found in this recording.");
  return { segments, duration: round(data.metadata?.duration ?? segments.at(-1)!.end_s) };
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

function round(n: number) {
  return Math.round(n * 100) / 100;
}
