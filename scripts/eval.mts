// Runs the notes pipeline on the synthetic samples and scores it against their answer keys.
// Usage: npm run eval            (models from .env.local)
//        GEMINI_MODEL=x npm run eval
import { readFileSync } from "node:fs";
import { parseTranscript } from "../src/lib/transcript";
import { writeNotes, type Notes } from "../src/lib/notes";

const MEETING_DATE = "2026-10-01";

interface ExpectedItem { owner: string; keywords: string[]; due: string | null | "any" }
interface Expected { decisions: string[][]; items: ExpectedItem[] }

// Mirrors samples/*.answer-key.md
const EXPECTED: Record<string, Expected> = {
  "demo-meeting": {
    decisions: [["14", "fourteenth"], ["link"], ["dark mode"]],
    items: [
      { owner: "daniyal", keywords: ["sync", "race"], due: "2026-10-02" },
      { owner: "bilal", keywords: ["onboarding"], due: "2026-10-12" },
      { owner: "sara", keywords: ["release notes"], due: "2026-10-06" },
      { owner: "daniyal", keywords: ["crash"], due: "any" },
      { owner: "sara", keywords: ["screenshot"], due: "2026-10-09" },
    ],
  },
  "messy-meeting": { decisions: [], items: [] },
};

function score(name: string, notes: Notes) {
  const exp = EXPECTED[name];
  const lines: string[] = [];
  const used = new Set<number>();
  let found = 0;
  for (const e of exp.items) {
    const i = notes.action_items.findIndex(
      (a, k) => !used.has(k) && (a.owner ?? "").toLowerCase().includes(e.owner) && e.keywords.some((w) => a.task.toLowerCase().includes(w)),
    );
    if (i === -1) {
      lines.push(`  ✗ missing: ${e.owner} / ${e.keywords[0]}`);
      continue;
    }
    used.add(i);
    const a = notes.action_items[i];
    const dateOk = e.due === "any" || a.due_date === e.due;
    if (dateOk) found++;
    lines.push(`  ${dateOk ? "✓" : "~"} ${a.owner}: ${a.task} (due ${a.due_date ?? "—"}${dateOk ? "" : `, expected ${e.due}`}) [${a.status}${a.reasons.length ? ": " + a.reasons.join("; ") : ""}]`);
  }
  const invented = notes.action_items.filter((_, k) => !used.has(k));
  for (const a of invented) lines.push(`  ! extra: ${a.owner ?? "no owner"}: ${a.task} [${a.status}${a.reasons.length ? ": " + a.reasons.join("; ") : ""}]`);
  const inventedUnflagged = invented.filter((a) => a.status === "ok").length;

  const decisionText = notes.decisions.map((d) => d.text.toLowerCase());
  const decisionsFound = exp.decisions.filter((kw) => decisionText.some((t) => kw.some((w) => t.includes(w)))).length;
  const wrongBeta = name === "demo-meeting" && decisionText.some((t) => /12|twelfth/.test(t) && /beta/.test(t) && !/14|fourteenth/.test(t));
  for (const d of notes.decisions) lines.push(`  · decision: ${d.text} [${d.status}]`);

  const headline =
    `${name}: action items ${found}/${exp.items.length}, decisions ${decisionsFound}/${exp.decisions.length}, ` +
    `extra items ${invented.length} (${inventedUnflagged} unflagged)` +
    (name === "messy-meeting" ? `, extra decisions ${notes.decisions.length}` : "") +
    (wrongBeta ? ", ✗ used the reversed beta date" : "");
  return { headline, lines };
}

for (const name of Object.keys(EXPECTED)) {
  const segments = parseTranscript(readFileSync(`samples/${name}.txt`, "utf8"));
  const t0 = Date.now();
  const { notes, model } = await writeNotes(segments, {}, MEETING_DATE);
  const { headline, lines } = score(name, notes);
  console.log(`\n${headline}  [${model}, ${((Date.now() - t0) / 1000).toFixed(1)}s, ${notes.merged_duplicates} duplicates merged]`);
  console.log(lines.join("\n"));
}
