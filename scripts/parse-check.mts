// Quick look at how a transcript file parses: npx tsx scripts/parse-check.mts <file>
import { readFileSync } from "node:fs";
import { parseTranscript, formatTime } from "../src/lib/transcript";

const segments = parseTranscript(readFileSync(process.argv[2], "utf8"));
const speakers = [...new Set(segments.map((s) => s.speaker))];
console.log(`${segments.length} segments, speakers: ${speakers.join(" | ")}, ends ${formatTime(segments.at(-1)?.end_s ?? 0)}`);
for (const s of segments.slice(0, Number(process.argv[3] ?? 4))) {
  console.log(`  [${s.idx}] ${formatTime(s.start_s)}-${formatTime(s.end_s)} ${s.speaker}: ${s.text.slice(0, 90)}`);
}
