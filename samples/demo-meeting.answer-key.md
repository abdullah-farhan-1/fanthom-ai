# Answer key: demo meeting ("Shared Lists" weekly sync)

Ground truth for `demo-meeting.txt` / `demo-meeting.wav`. Use it to check what the app extracts.

**Meeting date:** Thursday 1 October 2026 (relative dates below resolve against this)
**Speakers:** Sara (PM), Daniyal (engineer). **Mentioned, absent:** Bilal (designer)

## Decisions (3)

| # | Decision | Notes / trap |
|---|---|---|
| D1 | Beta launches **Wednesday 14 October 2026** | Monday 12 Oct was proposed first, then **reversed**. Extracting 12 Oct is wrong. |
| D2 | Invites use **option B, a shareable link** (not email) | Email may come later; not a decision. |
| D3 | **Dark mode is cut** from version one | Revisit after the beta; not an action item. |

## Action items (5)

| # | Owner | Task | Due | Notes / trap |
|---|---|---|---|---|
| A1 | Daniyal | Fix the sync bug (race condition on reconnect) | Fri 2 Oct 2026 | "This Friday" is relative. |
| A2 | Bilal | Finish onboarding screens for the link flow | Mon 12 Oct 2026 | **Owner is absent** from the meeting. |
| A3 | Sara | Write beta release notes | Tue 6 Oct 2026 | "Next Tuesday" is relative. |
| A4 | Daniyal | Set up crash reporting | Before beta (≤ 14 Oct) | **No explicit date**, only relative to D1. |
| A5 | Sara | App store screenshots | Fri 9 Oct 2026 | **Owner changed**: first asked of Daniyal, then Sara took it. Daniyal is wrong. |

## Must NOT be extracted as action items

| Item | Why |
|---|---|
| "Someone should look into pricing" | **No owner, no date**, explicitly parked. Acceptable only as an open question / flagged for review. |
| Referral programme | Explicitly "let's not commit". An idea, not a task. |
| Add email invites later | Conditional future idea. |
| Sara telling Bilal about onboarding | Part of A2, not a separate task. |

## Other things to check

- Small talk (internet, cricket match) should not appear in the summary.
- The recap at the end repeats everything; items should not be duplicated.
- Each item should cite the transcript line(s) it came from.
