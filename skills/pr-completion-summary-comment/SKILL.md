---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pr-completion-summary-comment"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pull request completion summary

Purpose: after work that answers feedback on a pull request, leave one
summary the steward posts as a single top-level comment, so the conversation
carries a coherent account of what was done.

It is required, not optional. Replies on each thread and a silent push are
not enough: the maintainer then has to walk the diff again to learn what
happened (on endojs/endo-but-for-bots#474: "there simply wasn't a summary
posted after the fact ... I expect feedback on the PR in general").

## When

After any job that changes a pull request already under review: a fixer
answering a review, a shepherd that greened CI, a conductor that resolved a
non-trivial conflict, a builder pushing follow-up work. Not for opening a
pull request: its description is its opening summary.

## Where

You cannot comment. Write the summary as `outbox/report.md` (or its first
section, if the report also carries notes for the steward). The steward
posts it as one comment carrying a marker with the job id, so a repeat is
recognised rather than posted twice.

## What it carries

- **Head commit:** the exact commit it describes.
- **What changed:** each item addressed and how, mapped to its commit when
  there is one per concern. Behaviour, not diff.
- **What was declined and why:** out of scope, deferred to a follow-up,
  verified-no-change-needed with the proof. Silence on a declined item reads
  as an oversight.
- **Verification:** tests, lint, types: green, red with the reason, or not
  run. Say what you ran.

The floor is a short item-to-commit list and a one-line verification.

## Keep it scannable

A long summary (a many-item map, command output, a diff excerpt) goes in
`<details>` blocks, collapsed. One thing is never collapsed: a visible
status line saying whether the loop goes on or has settled:

- the round, when this is one of several fix rounds;
- CI: green, red, or pending (after a push it is pending: the steward runs
  CI after you);
- what comes next: another review round, or converged.

Leave a blank line after `</summary>`, or GitHub shows the Markdown inside as
literal text.

```markdown
**Fix round 6** · CI: pending · next: review round expected
Head `abc1234`. Addressed 4 of the round's 5 must-fix items; 1 declined (out of scope).

<details><summary>Item-to-commit map (5 items)</summary>

- `def5678`: ...
</details>

<details><summary>Verification output</summary>

... lint and test output ...
</details>
```

## Pitfalls

- **Thread replies only:** both are needed.
- **Omitting declines** hides the decision the maintainer most needs to see.
- **Backticks:** keep the summary in a file; the steward posts the file, so
  nothing passes through a shell's quoting.

## Not built yet

- **Posting:** the steward turning `outbox/report.md` into one marked
  comment after a settled run, and finding the marker first
  (designs/pull-requests.md § The seam; designs/deadlines.md § Side effects).
- **Provenance per section:** when a summary stitches together sections from
  different jobs, a footnote per section naming the model that wrote it.

Adapted from the prior garden's `skills/pr-completion-summary-comment`.
