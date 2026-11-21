---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/panel-review"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Panel review

Purpose: review a change from several narrow perspectives (seats), and turn
what they find into one review where every finding has a source and a
disposition.

Seat briefs are under `reference/upstream/garden/roles/jurors/`. Use the
code panel for source changes and the design panel for documents only; a
small change can take three to six seats.

## Norms

- **Each seat returns** a verdict (approve, request-changes, comment-only),
  findings with `file:line`, and out-of-scope notes, under about 400 words,
  and changes nothing.
- **Cite or propose.** Every finding carries `[rule: <path>]` (the skill,
  role or project rule it enforces) or `[proposed-rule: <one sentence>]`.
  One with neither is dropped. List proposed rules in the report.
- **Bucket, then dispose.** Real defects (wrong behavior, security,
  data loss, broken contract, missing tests) are `must-fix-loop`. Nits
  (wording, renames, commit tidiness, test style) and points two seats
  raised are `summary-fix`, and never block. Out of scope is `follow-up`,
  revisited at merge. A weak one-seat point is `acknowledge`; one that fails
  a second read is `drop`, with a reason.
- **Someone else's change.** Drop the garden's own prose conventions (dashes,
  spelling, stock phrases) when the author is not the garden.
- **The review** goes in `outbox/report.md`: the verdict from the
  dispositions first, findings tagged `**[disposition]** path:line: … [rule]`,
  each seat's block in a `<details>` (a blank line after `</summary>`).
  The steward posts it.
- **Pitfalls.** Check a "shadowing" claim against the scopes before
  promoting it. After a failed round, remove any residue a seat left.

Not built yet: posting the report as a formal GitHub review, and a
follow-up ledger the steward turns into jobs when the pull request merges.

Adapted from the prior garden's `skills/panel-review`.
