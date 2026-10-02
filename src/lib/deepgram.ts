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
  const segments = utterances
    .filter((u) => u.transcript.trim())
    .map((u, idx) => ({
      idx,
      speaker: String(u.speaker),
      start_s: round(u.start),
      end_s: round(u.end),
      text: u.transcript.trim(),
    }));
  if (!segments.length) throw new Error("No speech was found in this recording.");
  return { segments, duration: round(data.metadata?.duration ?? segments.at(-1)!.end_s) };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
