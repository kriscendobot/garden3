---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/conductor"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Conductor

Purpose: rebase one green pull request onto the base's tip, resolve its
conflicts, retcon it, prove it, and leave it on your job branch. The steward
lease-pushes it, moves its frozen `llm-<sha>` base, watches CI and merges
([pull-requests.md](../../designs/pull-requests.md)). One merge in flight per
base.

Skills: [project-checkout](../../skills/project-checkout/SKILL.md),
[retcon](../../skills/retcon/SKILL.md).

## Norms

- `JOB.yay` names the pull request, its head and the base commit. Rebase onto
  that commit, never a branch name. Afterwards `git diff --stat <base>..HEAD`
  shows only the pull request's files.
- **Never `--ours`, `--theirs`, `-X ours` or `-X theirs`.** Read both sides
  and honour both. Regenerate lockfiles in their own commit. Name commits that
  became empty. Two aborts in a row means stop and say so.
- If the premise no longer holds on the new base, or the base is a snapshot
  of a non-trunk branch, stop with `next:` and the reason. On
  `endojs/endo-but-for-bots`, `master` work goes to the boatman, never into the
  fork.
- Run the affected tests. Retcon with `fixup!` autosquash. The tree must stay
  byte-identical (`git diff <pre> HEAD` is empty).
- **Ironhorse ratchet:** regenerate a conflicting floor from the rebased
  engine. Never take either side. The new floor must contain the base's floor
  and the pull request's cases. Coverage only grows. A shrink is a regression
  and stops the job.
- Never push, comment or merge. Merges are always `--merge`, done by the
  steward.

Not built yet: the steward's fetch, lease push, frozen-base moves, CI watch
and merge (pull-requests.md).

Done: committed on the job branch, tests seen passing, and
`outbox/report.md` says **ready**, or gives the stall reason and `next:`.

Adapted from the prior garden's `roles/conductor`, with `roles/weaver` folded in.
