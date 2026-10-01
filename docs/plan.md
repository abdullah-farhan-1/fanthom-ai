# Fanthom: build plan

A Fathom-style AI meeting notetaker with a **quality layer**: every AI-extracted item is checked against the transcript before it is trusted.

> **Re-read the brief first.** This plan was written before the brief was opened. When the clock starts, read the brief end to end, mark anything it requires that is missing here, and adjust scope before writing code.

## 1. Scope

| Priority | Feature |
|---|---|
| **Must** | Upload audio **or** paste a transcript |
| **Must** | Transcript view: speakers, timestamps, searchable |
| **Must** | AI summary, decisions, action items (owner, due date), open questions |
| **Must** | Quality layer: checks 1–6 (§4), each item `ok` or `needs_review` with a reason |
| **Must** | Review actions on flagged items: Approve / Edit / Remove |
| **Must** | Meetings list (home) and meeting detail page |
| **Must** | Deployed live link, README, 2–3 min walkthrough video |
| **Must** | Eval script against both answer keys (§5) |
| Should | Click an item → jump to its line in the transcript (and audio time if audio) |
| Should | Audio player synced to the transcript |
| Bonus | Check 7: second AI pass, "was this decision changed later?" |
| Bonus | Ask across meetings (chat), share link |
| **Out** | Bot that joins Zoom/Meet/Teams, calendar, CRM/Slack sync, auth. Listed in README as next steps. |

## 2. Architecture

```
Browser ──upload──▶ Supabase Storage (private bucket "recordings")
   │                         │ signed URL
   ▼                         ▼
POST /api/transcribe ──▶ Deepgram nova-3 (diarize, utterances) ──▶ transcript lines
   │
POST /api/extract ──▶ Gemini (structured JSON) ──▶ validate (src/lib/validate.ts) ──▶ Supabase row
   │
UI polls meeting status: uploaded → transcribing → analyzing → ready | failed
```

- **Big files never go through Vercel functions** (4.5 MB body limit). The browser uploads directly to Supabase Storage using a signed upload URL; the API only passes the file path.
- **Two short API steps, not one long one**, so each stays well inside Vercel's function time limit. Set `maxDuration` on both routes.
- **Paste-transcript path** skips Deepgram. Parse `Speaker: text` lines into the same transcript shape.
- This is Next.js 16. **Read the relevant guide in `node_modules/next/dist/docs/` before writing route handlers or pages** (see AGENTS.md).

## 3. Data

### Supabase: one table, `meetings`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `title` | text | user-entered or "Untitled meeting" |
| `meeting_date` | date | needed to resolve "this Friday"; default upload date |
| `source` | text | `audio` \| `transcript` |
| `audio_path` | text null | path in `recordings` bucket |
| `status` | text | `uploaded` \| `transcribing` \| `analyzing` \| `ready` \| `failed` |
| `error` | text null | human-readable failure reason shown in UI |
| `transcript` | jsonb | `[{ i, speaker, start, end, text }]` |
| `result` | jsonb | validated extraction (below), including review edits |
| `model` | text | which Gemini model produced `result` |
| `created_at` | timestamptz | |

One table with jsonb is enough for a one-day build. Note in README: production would normalise items into their own table.

### Extraction shape (Zod schema in `src/lib/schema.ts`)

```
summary          string, 3–5 sentences, no small talk
decisions[]      { text, quote, line, confidence }
action_items[]   { task, owner | null, due_text | null, due_date | null (ISO), quote, line, confidence }
open_questions[] { text, quote, line }
```

After validation every decision and action item also carries:
`status: "ok" | "needs_review"`, `reasons: string[]`, `review: "approved" | "edited" | "removed" | null`.

## 4. Quality layer (`src/lib/validate.ts`)

Plain code, no AI. The transcript is the source of truth.

| # | Check | Rule | Fail reason shown to user |
|---|---|---|---|
| 1 | Quote exists | Fuzzy-match `quote` against transcript line `line` (±2 lines); normalise case, punctuation, filler words | "Quote not found in transcript" |
| 2 | Quote supports item | Key words of the task/decision (and owner, if any) appear in or near the quoted line | "Quote doesn't mention this task" |
| 3 | Owner is real | Owner is a speaker or a name that appears in the transcript (fuzzy, so "Balal" ≈ "Bilal") | "Owner X not found in meeting" |
| 4 | Date matches its words | Resolve `due_text` from `meeting_date`; must equal `due_date`; not before the meeting | "Due date doesn't match 'next Tuesday'" |
| 5 | No duplicates | Merge items with near-identical task + owner (the recap) and keep the earliest quote | (merged silently, count shown) |
| 6 | Shape | Zod parse; on failure retry once, then mark meeting `failed` with the reason | "AI response was malformed" |
| 7 | *(bonus)* Still true at the end | Lite model, per decision: "Was this changed or reversed later in the meeting?" | "May have been changed later" |

Rules:
- A missing owner or date is **not** a failure of the AI, but it is flagged `needs_review` ("No owner assigned").
- An **empty result is valid.** Never pad.
- Flagged items are **shown, not hidden**: greyed with a ⚠️ badge, the reason, and Approve / Edit / Remove.

## 5. Evaluation (`npm run eval`)

Runs both samples through the real pipeline and scores against the answer keys.

| Sample | Pass criteria |
|---|---|
| `demo-meeting` | 3/3 decisions, 5/5 action items with correct owner and date, 0 invented, beta date = 14 Oct (not 12), screenshots owner = Sara |
| `messy-meeting` | 0 decisions, 0 action items (or all flagged), off-topic talk not in summary |

Print one line per sample and put the result in the README. Run against both Gemini models to pick the primary.

## 6. Gemini and reliability

- **Model choice: settle in the first 30 minutes.** Run extraction on `demo-meeting.txt` with `gemini-3.8-flash` (thinking `low`) and `gemini-3.5-flash-lite`. Pick the primary by eval score and latency.
  - Known: 3.8 Flash was overloaded (503) in ~4 of 6 calls during setup; lite answered every time in ~1 s.
- Retry with backoff on 503/429/5xx (3 tries: 2 s, 5 s, 10 s), then fall back to `GEMINI_FALLBACK_MODEL`. Record which model was used.
- Use structured output (JSON schema) **and** still validate with Zod. Never trust the response shape.
- Transcript lines sent to Gemini are numbered (`[12] Sara: ...`) so it can cite `line`.
- Every failure ends in a visible state with a retry button: no silent failures, no infinite spinners.
- Keep one demo meeting **already processed** in the database so the reviewer's first click never depends on Gemini being up.

## 7. UI

1. **Home `/`**: meetings list (title, date, status, item counts, ⚠️ count) + "New meeting" (upload or paste, title, meeting date).
2. **Meeting `/meetings/[id]`**: two columns.
   - Left: summary, decisions, action items (✅ / ⚠️ badges, reasons, review buttons), open questions.
   - Right: transcript (speaker, timestamp, search). Clicking an item scrolls to and highlights its line.
   - Header: status steps (Uploading → Transcribing → Analyzing → Ready), model used, "X items need review".

Clean, calm, Fathom-like. shadcn/ui + Tailwind. Desktop first, readable on mobile.

## 8. Sprint schedule (adjust after reading the brief)

| Block | Hours | Goal |
|---|---|---|
| 0 | 0:00–0:30 | Read brief, adjust this plan, `npm run check`, spar on the plan with a second LLM |
| 1 | 0:30–2:30 | Paste-transcript → Gemini → Zod → validate → saved row. Model choice + first eval run |
| 2 | 2:30–4:00 | Audio path: direct upload → signed URL → Deepgram → transcript |
| 3 | 4:00–7:00 | UI: list, detail, badges, review actions, click-to-line |
| 4 | 7:00–8:30 | Edge cases, error states, retries, eval passing on both samples |
| 5 | 8:30–9:30 | Deploy check on live URL, seed demo meeting, README |
| 6 | 9:30–10:30 | Walkthrough video, final pass, submit |
| Buffer | ~4 h | Hard internal deadline 4 h before the window closes |

Commit after each block with a clear message. Keep AI chat logs.

## 9. README outline (for reviewers)

1. What it is + live link + video link
2. How to use it (upload or paste; try the demo meeting)
3. Architecture diagram (§2)
4. **Quality layer**: the checks, why, and the eval result line
5. **How I used AI**: understand first, spar on the plan, build with Claude Code, review every change, test edge cases
6. Known limits: speaker labels can be wrong (8–30% on samples); checks prove an item *came from* the transcript, not that it was *understood* correctly; free-tier Gemini may use prompts for training
7. Next steps: meeting bot, calendar, CRM sync, auth, normalised tables
