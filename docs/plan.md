# Fanthom: build plan (v2, after reading the brief)

A Fathom-style AI meeting notetaker. v1 of this plan was written before the brief was opened; this version re-scopes it to what the brief asks for and how it is judged.

## What the brief changes

- **Judged on:** speed (how much working product), product judgement (what came first, what was left out), UX/UI.
- **Use cases it names:** playback against the transcript, AI summary, **switching templates**, action items, **highlighting a moment mid-call**, **searching across meetings**, **sharing a clip** with someone not on the call, and **the 8-person, one-hour call** ("the case that actually matters").
- **The capture bot can be faked.** The meeting comes in by upload (audio or video) or pasted transcript, and that replaces the bot.
- **Seed it with real data.** No empty meetings list.
- **Hand in:** a live link that opens without signing in, a public repo with `.agent-logs/`, and a walkthrough of 5 minutes or less with camera on (plus a 1-minute intro video for the form).

## 1. Scope, in build order

| # | Feature | Why at this position |
|---|---|---|
| 1 | **Ingest:** upload audio/video or paste a transcript → Deepgram (speaker labels, timestamps) → segments saved | Nothing else works without it |
| 2 | **AI notes:** summary + action items + decisions/questions from Gemini, checked against the transcript (quality layer, simple version) | The core value of Fathom |
| 3 | **Meeting page:** player + transcript synced (click a line → seek; playing → highlight the current line), speaker names, notes beside it | Fathom's main screen; where reviewers spend time |
| 4 | **Templates:** switch the summary between General / Sales / 1:1 / Stand-up. Generated on demand and cached per template | Named in the brief; cheap with cached generations |
| 5 | **Search across meetings:** full-text search over every segment, results jump to the moment | Named in the brief; Postgres full-text makes it cheap |
| 6 | **Highlights and clips:** select transcript lines or mark "now" during playback → highlight; a highlight gets a **public share link** that plays only that clip with its transcript | Named in the brief; the share page is a strong demo moment |
| 7 | **Long, many-speaker meetings:** speaker list with talk time, rename speakers (Speaker 3 → "Maria"), chapters/topics with timestamps, transcript that stays fast for an hour | The case the brief says matters |
| 8 | **Seed data:** real meetings (own recorded calls + a long public multi-speaker meeting) processed and in the list | Required by the brief |
| — | **Out:** recording bot, calendar sync, CRM/Slack, auth/multi-user, live transcription | Faked or not needed to judge the product; listed in README as next steps |

Order rule: get 1→3 working end to end on the live URL before starting 4.

## 2. Architecture

```
Browser ── direct upload ──▶ Supabase Storage (private "recordings")
   │
   ▼  POST /api/meetings {title, date, media path | transcript text}
Route handler: insert meeting (status=processing) → respond immediately
   └─ after():  Deepgram (signed URL) → segments  →  Gemini notes → validate → status=ready
UI polls GET /api/meetings/[id] until ready | failed
```

- Big files never pass through Vercel functions (4.5 MB body limit): the browser uploads to Supabase with a signed upload URL.
- `after()` (next/server) runs the pipeline after the response; route `maxDuration` set high enough for an hour of audio.
- Pages that read the database use `export const dynamic = "force-dynamic"` (Cache Components is off).
- Single workspace, no login: all database access is server-side with the secret key; RLS is on with no policies, so the publishable key cannot read anything.

## 3. Data (`supabase/schema.sql`)

- **meetings:** title, date, source (`audio` | `video` | `transcript`), media path, duration, status, error, speaker names, AI notes (jsonb), model used
- **segments:** one row per utterance: meeting, index, speaker, start/end seconds, text, generated `tsvector` for full-text search
- **summaries:** one row per (meeting, template): content, model
- **highlights:** meeting, start/end seconds, title/note, public `share_id`

## 4. Quality layer (kept, simplified)

Plain code checks on Gemini output against the segments. Items that fail are shown with a ⚠️ badge and a reason, not hidden:
1. Cited segment exists and its text supports the item (quote fuzzy-matches)
2. Owner is a known speaker or a name in the transcript
3. Due date is consistent with its wording and the meeting date
4. Duplicates (e.g. from a recap) merged
5. Zod-validated shape; malformed → retry once, then `failed` with a reason

Eval: `npm run eval` runs both synthetic samples against their answer keys (catches regressions; result goes in README).

## 5. Gemini

- Primary is chosen by a quick eval in block 1. Default to `gemini-3.5-flash-lite` (reliable, ~1 s); 3.8 Flash was overloaded about half the time and slow even when up.
- Retry with backoff on 429/5xx, then the fallback model. The model used is stored with the result.
- Transcript lines are numbered so items can cite them. One call for the whole meeting (an hour is ~10k words, well inside the context window).

## 6. Schedule (Lahore time, deadline Sat 3 Oct 4:16 pm)

| Block | When | Goal |
|---|---|---|
| A | now – 8 pm | Schema, ingest pipeline (paste + upload), notes + validation, model pick. Deployed. |
| B | 8 – 11 pm | Meeting page: player + synced transcript + notes; meetings list |
| C | 11 pm – 1 am | Templates, search, highlights + share page |
| — | sleep | |
| D | 8 – 10 am | Long-meeting UX (speakers, chapters), seed real data |
| E | 10 – 12 | Polish, error states, README, eval line |
| F | 12 – 1:30 pm | Walkthrough + intro video, final checks, submit |

Commit after every working step (logs go in with the code).
