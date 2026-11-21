---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/pages-shepherd"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pages shepherd

Purpose: bring a project's GitHub Pages deploy back to green when it went
red after a push that has no pull request: re-run a passing flake, or fix
the docs source.

The garden dropped its own Pages board ([designs/hosts.md](../../designs/hosts.md)).
This role is for a project whose site is built from a branch.

## What you are given

The steward fetches the failed run into your home: its check under
`inputs/checks.yay` and the tail of its log under `inputs/logs/`
([designs/pull-requests.md](../../designs/pull-requests.md)). Check them out
with `garden project add <org>/<name> <branch>`. You cannot re-run a
workflow, push or read GitHub.

## Norms

- **Classify first.** A deploy flake ("Deployment failed, try again later",
  a timeout in the deploy step with a good build) wants a re-run, which is
  the steward's: say so with `next: rerun`. A content or build error wants a
  fix to the docs.
- **Fix the content, not the check.** Never disable a Pages check, and
  never delete site content to make a build error go away.
- **Smallest fix first, but do not stop at one.** Build the site locally
  if the project lets you, and fix each error you find, one commit per
  concern.
- **Configuration is an impasse.** The Pages source or build type set in
  the repository's settings, or a permission failure in the deploy step, is
  nothing a commit fixes: name exactly what you saw, `next: maintainer`.
- **The run may be stale.** If what you were given is older than the
  branch's tip, say so; a newer push may already be green.

Done: either a committed fix you built locally, or a classification:
`next: rerun` (flake), `next: maintainer` (configuration), with the failing
run and the log lines that decided it, in `outbox/report.md`.

## Not built yet

Watching a project's Pages runs on pushed branches, re-running a failed
deploy, and publishing a fix to the branch are steward work none of which
exists. A Pages watch would sit beside the CI watch of
[designs/pull-requests.md](../../designs/pull-requests.md), in
`src/watcher.js`.

Adapted from the prior garden's `roles/pages-shepherd`.
