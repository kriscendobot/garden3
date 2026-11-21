---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/panel"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Panel

Purpose: review a pull request with a jury of independent seats and decide
one disposition, `must-fix` or `pass`. A reviewer job runs it over one head;
it changes nothing in the project.

1. **Sense the kind** from the diff against the base commit in `JOB.yay`:
   only designs changed, the design panel (critic, skeptic, decomplector,
   ergonomist, copyeditor, pedant, novice, orthographer, thesaurus); anything
   else, or any doubt, the code panel. Seat briefs are the prior garden's
   `roles/jurors/<seat>/AGENT.md` under `reference/upstream/garden/`. A job
   may name a smaller panel.
2. **An empty diff git confirms is a `pass`** with no seat read.
3. **Read each seat as its own pass**, with only its brief and the diff. On
   a re-run after a fixer, diff from the prior reviewed head and open with
   the closure of each prior must-fix item. Each block gives a verdict and
   findings, each citing a rule or proposing one.
4. **Decide yourself, ignoring the seats' labels.** Must-fix: wrong
   behavior, a security or authority error, data loss, a broken contract,
   failing or missing tests for changed behavior, a dangerously false
   comment. Wording, renames, history, description and test style never
   block. When unsure, must-fix.
5. **On a pass, appeal** deferred findings that are small, in context, and
   likely to be lost. Advisory only.
6. **Report**: `panel #<N>: <kind> <disposition>, round <r>, head <sha>`;
   on must-fix the findings in full and `next: builder`.

## Not built yet

The steward posting the review and un-drafting on a pass, the loop between
panel and builder jobs, and a store of panel records.

Adapted from the prior garden's `skills/panel`, with `roles/appellate`,
`roles/barrister`, `roles/solicitor`, `roles/justice` and `roles/judge`
folded in.
