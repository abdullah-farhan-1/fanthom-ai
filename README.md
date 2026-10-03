# Fanthom

**A Fathom-style AI meeting notetaker where every AI claim can be checked.** Upload a recording (or paste a transcript) and get a synced transcript, summaries in five templates, action items, decisions, chapters, shareable clips and search across every meeting. Anything the AI says points back to the moment it came from, and anything it can't back up is flagged for a person to review.

- **Live:** https://fanthom-ai-cyan.vercel.app (no sign-in)
- **Walkthrough video (5 min):** https://drive.google.com/file/d/1Pub8vx8tawDC7vcS6HiM4-z3pynQ0YKj/view
- **Built for:** the 8x Software Engineer assignment, "Clone: Fanthom AI", in a 24-hour window
- **AI capture log:** [`.agent-logs/`](.agent-logs/) and [`CAPTURE-TEST.md`](CAPTURE-TEST.md)

---

## Try it in two minutes

1. Open **[AMI EN2001a](https://fanthom-ai-cyan.vercel.app/meetings/97d3ca41-6575-49e7-8acc-76738d8e048f)**, the protected sample (87 minutes, 5 people). Drag the waveform, click a chapter, switch the summary template, open **Action items**.
2. Open **Piers Morgan vs 20 Woke Liberals** (112 minutes, 19 speakers): the long, many-speaker case. Hover a speaker's **cited** / **guess** tag to see where the name came from.
3. Search for a word across all meetings, then click a result to jump to that moment.
4. In any meeting, open **Clips**, clip the current moment and open the link in a private window: only that clip is shared.
5. **New meeting** → upload audio/video (up to 50 MB) or paste a transcript.

---

## What I built, mapped to the brief

| The brief asked to try in Fathom | In Fanthom |
|---|---|
| Notetaker joins the call and records | **Faked, as the brief allows:** upload a recording, or paste a transcript (Fathom exports and "Name: text" transcripts parse). Uploads go straight from the browser to storage, with progress and cancel. |
| Watch the playback against the transcript | Custom player with a **conversation waveform** (each bar coloured by who spoke, sized by how much was said), chapter ticks, clip and action-item markers, drag to scrub, ±15 s, speed. The transcript follows playback; click any line to jump. |
| Read the AI summary, switch templates | Overview + **General, Sales call, 1:1, Stand-up, User interview** templates. Each is generated on first use, then cached (~0.2 s). Every bullet links to its moment. |
| Pull the action items | Owner, due date (resolved from the meeting date: "next Tuesday" → a real date), source line. **Checked against the transcript** (see below), with Keep / Remove for flagged items and a done checkbox. |
| Highlight a moment mid-call | **Clips:** clip the moment you're at; markers appear on the waveform. |
| Search across meetings | Postgres full-text search over every line (word forms match: "decide" finds "decided"), with a whole-word fallback for very common words, and deep links to the exact second. |
| Share a clip with someone not on the call | Public `/share/<id>` page that plays **only that clip** with its transcript; the rest of the meeting stays private. |
| The eight-person, one-hour call | Long meetings are processed in 15-minute windows (more complete notes), chapters scale with length, speakers get talk-time and rename, and speaker separation was measured on an 87-minute, 5-person meeting with hand-annotated ground truth (below). |
| Seed it with real data | Six real meetings: two of my own Meet calls (shared with consent), the AMI corpus meeting, a 112-minute Piers Morgan debate, a three-person science debate and an English lesson. |

Also: decisions and open questions, chapters, speaker rename, meeting rename, likes, sorting (date / length / liked / title), delete with confirmation, a protected sample meeting, loading and error states throughout.

### What I left out, on purpose

- **The recording bot and calendar sync.** The brief allows faking capture; a reliable bot for Zoom/Meet/Teams is a project of its own. Upload exercises the same pipeline.
- **Login.** The brief needs the link to open for someone not signed in. Row-level security is already on for every table, so per-user policies are the main step to add Supabase Auth.
- **CRM / Slack sync and live transcription.** Not needed to judge the product.
- **Uploads above 50 MB.** That's the Supabase free-plan limit; an hour of speech as MP3 is ~30 MB. The dialog explains this before uploading.

---

## How it works

```
Browser ── signed upload URL ──▶ Supabase Storage (private bucket)
   │
   ▼  POST /api/meetings  (responds immediately)
Route handler ─ after() ─▶ Deepgram nova-3 (diarized words)
                            └─▶ speaker turns ─▶ Gemini notes (15-min windows if long)
                                                 └─▶ checks against the transcript ─▶ Postgres
UI polls status (Transcribing → Writing notes → ready), with retry on failure
```

- **Stack:** Next.js 16 (App Router, TypeScript) on Vercel · Supabase (Postgres + Storage) · Deepgram nova-3 · Gemini `3.5-flash-lite` (fallback `3.1-flash-lite`) · Tailwind 4 + shadcn/ui.
- **Big files never touch the server:** the browser PUTs straight to a signed storage URL (Vercel caps request bodies at 4.5 MB).
- **Processing runs after the response** (`after()` from `next/server`), so uploads return instantly; an 87-minute meeting finishes in under a minute on Vercel.
- **Data:** `meetings`, `segments` (one row per speaker turn, with a generated `tsvector` for search), `summaries` (per template, cached), `highlights` (with public share ids). Schema: [`supabase/schema.sql`](supabase/schema.sql).
- **Model choice was measured, not assumed:** `3.8-flash` returned 503 "high demand" on most calls during setup and took ~23 s even for one word; `3.5-flash-lite` scored the same on the eval in ~3 s.

---

## The quality layer

The idea I pitched in my application: treat AI output like a fast junior colleague's work, reviewed before it's trusted. So the model must **cite** a transcript line for every action item and decision, and plain code checks it:

| Check | Catches |
|---|---|
| The quote exists in the cited line (or its neighbours) | Invented items |
| The owner is a speaker or someone named in the meeting | Invented people |
| The due date matches its wording ("Friday" must be a Friday) and isn't before the meeting | Date arithmetic mistakes |
| Near-duplicates merged (e.g. from a recap) | Repeated items |
| Lenient parsing per item: one malformed item is dropped and logged, not the whole meeting | Model output drifting run to run |

Items that fail are **shown, not hidden**, with a ⚠️ and the reason, and **Keep / Remove** buttons.

**Speaker names follow the same rule.** A name shown as **cited** is backed by the transcript (someone says "I'm Evan", or another speaker greets them by name); hover shows the line. Everything else is a **guess**, marked as such, or left as "Speaker N" to rename. A speaker who greets "Charles, …" counts against being Charles.

### Evaluation

Two scripts score the pipeline against ground truth. Responses are cached, so re-runs are free and deterministic.

**`npm run eval`:** notes on two scripted meetings with answer keys ([`samples/`](samples/)):

| Meeting | Result |
|---|---|
| Planning meeting with traps (a date changed mid-meeting, an absent owner, a reassigned task, a recap that repeats everything) | **5/5** action items with the right owner and date, **3/3** decisions, **0** invented |
| Rambling chat with no outcome | **0** invented items or decisions |

**`npm run eval:speakers`:** who said what, and who is who:

| Dataset | Speech attributed to the right person | Speakers found | Wrong names |
|---|---|---|---|
| AMI EN2001a: 87 min, 5 people, **hand-annotated word timings** | **99.3%** (92.4% before the change below) | 5 / 5 | n/a (anonymous) |
| Synthetic 5-person meeting built for naming traps | **88.4%** (75.7% before) | 4 / 5 | **0** (3 correct) |
| My two Meet calls, against Fathom's per-participant transcript | 88–89% (Fathom's whole-second timestamps cap this) | 2 / 2 | **0** |
| Piers Morgan, 112 min, 19 people | (no full reference) | **19 / 19** | **0**; host correctly "Piers", no duplicate names |

The biggest single improvement came from measuring: building speaker turns from Deepgram's **per-word** speaker labels instead of its utterances cut attribution errors on AMI from 7.6% to 0.7%.

---

## How I used AI

I built this with **Claude Code (Claude Opus 5.5)**. Every prompt and final response is in [`.agent-logs/`](.agent-logs/), committed alongside the code it produced; [`CAPTURE-TEST.md`](CAPTURE-TEST.md) shows how capture was set up and verified.

How I worked: understand the problem first, then build in small verified steps. Changes were type-checked and linted before each commit, and features were checked in a real browser (screenshots and scripted Chrome runs, including `npm run e2e` against the live site) and against the evals above.

The log keeps the wrong turns, because they're the useful part:
- **Speaker names were wrong, and I fixed them case by case until I stopped and measured.** The host of the debate was named "Chris" (a person he mentioned). Patching it broke another meeting. I then built the ground-truth evaluation and tuned against all datasets at once.
- **Strict validation failed whole meetings.** One malformed field from the model rejected everything; parsing is now lenient per item.
- **A docs lookup gave a wrong hook field name** (`user_prompt`); the raw hook input showed `prompt`.
- **CSS that "worked" but didn't:** an unlayered style silently beat every hover state, and a blurred header trapped a `position: fixed` overlay. Both were found in the browser, not by reading code.

**Before the clock started** I prepared only infrastructure: the Next.js skeleton, API keys, the deploy pipeline and two synthetic test meetings. This was done in a session that wasn't captured, because the capture setup only arrives with the brief. It's visible in the git history before `CAPTURE-TEST.md`. All product work came after the brief, with capture on.

---

## Known limits

- **Similar voices can merge.** Deepgram occasionally merges two similar voices into one speaker (one of five in the synthetic test); names are then left unassigned rather than guessed.
- **Names are only cited when someone says them.** Otherwise they're guesses or "Speaker N".
- **Checks prove an item *came from* the transcript, not that it was *understood* correctly.** A misread intent with a real quote passes.
- **Single shared workspace (no auth).** Anyone with the link can add or delete meetings, except the protected sample.
- **Free tiers:** 50 MB uploads (Supabase); Gemini's free tier may use prompts to improve its models, so production would use a paid tier.
- **English only.** Mixed-language speech isn't handled.

---

## Run it locally

```bash
npm install
cp .env.example .env.local      # Gemini, Deepgram and Supabase keys
# Supabase → SQL Editor: run supabase/schema.sql, then create a private bucket "recordings"
npm run dev
```

| Script | What it does |
|---|---|
| `npm run check` | Live check of every service and key |
| `npm run eval` | Notes eval against the answer keys |
| `npm run eval:speakers` | Speaker attribution and naming eval (needs the audio files; see the script header) |
| `npm run e2e` | Drives Chrome through a real upload (`BASE=<url>` to target the live site) |

---

## Credits and data

- **AMI Meeting Corpus** (EN2001a audio and word annotations), © University of Edinburgh, **CC BY 4.0**: https://groups.inf.ed.ac.uk/ami/corpus/
- **My own Meet calls**, shared with the other participant's consent.
- **Public videos** (Piers Morgan "Surrounded", a debate and an English lesson) were uploaded for demonstration only.
- **Synthetic test meetings:** voices by [Piper](https://github.com/rhasspy/piper) and Gemini TTS; scripts and answer keys in [`samples/`](samples/).
