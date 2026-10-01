# Answer key: messy meeting (website chat, no outcome)

Ground truth for `messy-meeting.txt` / `messy-meeting.wav`. This meeting tests that the app **does not invent** structure.

**Meeting date:** Thursday 1 October 2026
**Speakers:** Hina, Omar

## Decisions: **none**

Nothing was agreed. "Let's think about it and talk again" is not a decision.

## Action items: **none**

| Tempting phrase | Why it is not an action item |
|---|---|
| "Maybe we hire someone" | Hedged idea, no owner, no commitment |
| "Someone in finance would know" / "We could ask" | Immediately dropped: "maybe not yet" |
| "Let's think about it and talk again" | No owner, no date, no task |

## Expected app behaviour

- Summary says, in effect: discussed refreshing the homepage (old photos, unclear budget); **no decisions or action items**.
- An honest empty state ("No action items found") beats a padded list. Open questions are fine to surface:
  - Should the homepage be redesigned, and by whom?
  - What is this quarter's budget?
- Off-topic talk (landlord parking, coffee machine, noodle place) should not appear in the summary.
- Any extracted item here is a **false positive** and should be counted as an error.
