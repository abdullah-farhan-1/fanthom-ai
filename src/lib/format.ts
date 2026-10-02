// Display helpers shared by server and client components.
export { formatTime } from "./transcript";

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${Math.max(1, m)} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

// Deepgram labels are "0", "1", ...; pasted transcripts already carry names.
export function speakerLabel(label: string, speakers: Record<string, string>) {
  return speakers[label] ?? (/^\d+$/.test(label) ? `Speaker ${Number(label) + 1}` : label);
}

// Action-item owners may be written as "Speaker 2" before the speaker was renamed.
export function ownerLabel(owner: string | null, speakers: Record<string, string>) {
  if (!owner) return null;
  const m = /^Speaker (\d+)$/.exec(owner.trim());
  return m ? (speakers[String(Number(m[1]) - 1)] ?? owner) : owner;
}

// AI prose mentions generic labels ("Speaker 2 will…"); show the current names instead.
export function withNames(text: string, speakers: Record<string, string>) {
  return text.replace(/\bSpeaker (\d+)\b/g, (match, n) => speakers[String(Number(n) - 1)] ?? match);
}

// Speaker colours for a dark UI. Lime is reserved for the brand/playhead, so speakers never use it.
const PALETTE = [
  "bg-cyan-400", "bg-violet-400", "bg-indigo-400", "bg-pink-400", "bg-emerald-400",
  "bg-orange-400", "bg-sky-400", "bg-fuchsia-400", "bg-teal-300", "bg-rose-400",
];
const TEXT = [
  "text-cyan-300", "text-violet-300", "text-indigo-300", "text-pink-300", "text-emerald-300",
  "text-orange-300", "text-sky-300", "text-fuchsia-300", "text-teal-200", "text-rose-300",
];

export function speakerColor(order: number) {
  return { dot: PALETTE[order % PALETTE.length], text: TEXT[order % TEXT.length] };
}

export function initials(name: string) {
  const parts = name.replace(/^Speaker /, "S").split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
}
