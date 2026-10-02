import type { Segment } from "./types";

const WORDS_PER_SECOND = 2.5; // ~150 wpm, used only when a pasted transcript has no timestamps

// Accepts the common pasted shapes:
//   "Sara: text"                     speaker on the same line
//   "[00:01:23] Sara: text"          bracketed timestamp
//   "00:01:23 - Sara" + text below   timestamp/speaker header line (Fathom / Zoom style)
//   "Sara  0:42" + text below        speaker then timestamp
// Lines without a speaker continue the previous segment.
export function parseTranscript(raw: string): Segment[] {
  const lines = raw.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const segments: { speaker: string; start: number | null; text: string }[] = [];
  let pending: { speaker: string; start: number | null } | null = null;

  for (const line of lines) {
    if (!line) continue;
    const header = parseHeader(line);
    if (header) {
      pending = header;
      continue;
    }
    const inline = /^(?:\[?(\d{1,2}(?::\d{2}){1,2})\]?\s*[-–]?\s*)?([A-Za-z][\w .'-]{0,40}?):\s+(.+)$/.exec(line);
    if (inline) {
      segments.push({ speaker: inline[2].trim(), start: inline[1] ? toSeconds(inline[1]) : null, text: inline[3] });
      pending = null;
    } else if (pending) {
      segments.push({ ...pending, text: line });
      pending = null;
    } else if (segments.length) {
      segments.at(-1)!.text += ` ${line}`;
    } else {
      segments.push({ speaker: "Speaker", start: null, text: line });
    }
  }

  // Fill missing times by estimating from word counts.
  let clock = 0;
  return segments.map((s, idx) => {
    const start = s.start ?? clock;
    const end = start + Math.max(1, s.text.split(/\s+/).length / WORDS_PER_SECOND);
    clock = end;
    return { idx, speaker: s.speaker, start_s: round(start), end_s: round(end), text: s.text };
  });
}

function parseHeader(line: string): { speaker: string; start: number | null } | null {
  // "00:01:23 - Sara Ahmed" or "0:42 Sara"
  let m = /^\[?(\d{1,2}(?::\d{2}){1,2})\]?\s*[-–]?\s*([A-Za-z][\w .'-]{0,40})$/.exec(line);
  if (m) return { speaker: m[2].trim(), start: toSeconds(m[1]) };
  // "Sara Ahmed  0:42" or "Sara Ahmed - 00:01:23"
  m = /^([A-Za-z][\w .'-]{0,40}?)\s*[-–]?\s+\[?(\d{1,2}(?::\d{2}){1,2})\]?$/.exec(line);
  if (m) return { speaker: m[1].trim(), start: toSeconds(m[2]) };
  return null;
}

function toSeconds(stamp: string) {
  return stamp.split(":").map(Number).reduce((acc, n) => acc * 60 + n, 0);
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatTime(seconds: number) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
