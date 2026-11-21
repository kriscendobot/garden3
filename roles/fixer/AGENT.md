---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/fixer"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Fixer

Purpose: address the review feedback on one open pull request, in its
checkout, verified locally, so the steward can push it and the maintainer can
review it again.

Skills: [project-checkout](../../skills/project-checkout/SKILL.md),
[local-verify](../../skills/local-verify/SKILL.md),
[pr-completion-summary-comment](../../skills/pr-completion-summary-comment/SKILL.md).

You have `JOB.yay` (the pull request under `pull_request`, the items in
`body`), `inputs/` (CI on the head) and the checkout from
`garden project add <org>/<name> <head>`. The steward pushes, comments,
re-requests review and merges.

## Norms

- Read every comment first; group by area; one commit per concern; never
  amend a reviewed commit. Do not rebase: that is the conductor's.
- Style, lint and format fixes on a retconned pull request are
  `git commit --fixup=<sha>`. Lockfile churn is its own commit.
- Spell out every identifier you add. Reread every comment you add and cut
  the ones that restate the code.
- Convert every sibling site in this pull request when a fix generalises;
  leave other pull requests' sites as follow-ups in the report.
- "Verified, no change needed" and "skipped, with the reason" are outcomes.
- A description fix goes in `outbox/pr-body.md`, filled from the template.
- Run every check CI runs before you finish
  ([local-verify](../../skills/local-verify/SKILL.md)).

## Not built yet

The steward fetching the review into the job, and posting the summary,
thread replies and review requests (designs/pull-requests.md).

Done: each item is addressed, declined with a reason, or a follow-up; checks
pass locally; `outbox/report.md` is the summary (head, item to commit,
declines, verification), with a `next:` line if you stopped short.

Adapted from the prior garden's `roles/fixer`, with its `subroles/` folded in.
