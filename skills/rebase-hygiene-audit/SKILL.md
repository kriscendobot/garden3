---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/rebase-hygiene-audit"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Rebase hygiene audit

Purpose: across a project's open pull requests, say which are cleanly stacked
on their base and which need a rebase, a re-pin or a person. Read-only: it
names candidates; it rebases nothing.

## Per pull request

In the project checkout, with the base and head commits the steward fetched
(`inputs/`, or the job's `body`):

```sh
behind=$(git rev-list --count <head>..<base>)
ahead=$(git rev-list --count <base>..<head>)
merges=$(git rev-list --count --merges <base>..<head>)
if git merge-tree --write-tree <base> <head> >/dev/null 2>&1
then conflicts=clean; else conflicts=conflicts; fi
```

## Categories

- **green**: `behind` is 0 and `merges` is 0.
- **needs-rebase**: behind, and `merge-tree` is clean. A rebase would land.
- **needs-rebase-with-conflicts**: behind, and it conflicts. Someone must
  resolve it.
- **has-merge-commits**: the author merged the base in instead of rebasing.
  A long-lived feature branch with intentional merges reads this way too:
  flag it as an anomaly, not a rebase candidate.
- **base-missing**: the base branch no longer exists (a stacked pull request
  whose parent merged or closed).
- **unpinned-base**: the pull request targets a floating trunk (`master`,
  `llm`, `main`) where the project pins a frozen `<base>-<sha>` snapshot.
  It drifts with the trunk and is reviewed at the wrong merge base. The fix
  is to pin the base, not a plain rebase (`endojs/endo-but-for-bots` #719,
  #836).
- **wide-entrained-delta**: `ahead` is far larger than the intended change:
  a rebase onto a moving branch dragged in unrelated commits (#831's "79
  commits entrained"). A candidate to restack from a pinned base.
- **inconclusive**: the facts could not be read. Never report it as green;
  say what failed.

A Dependabot pull request hundreds of commits behind should be recreated by
Dependabot, not rebased by hand.

## Report

A summary table by category at the top, then each group with its pull
requests. End with two or three sentences of recommendation. Each
needs-rebase or unpinned-base row is a candidate job (a conductor or rebase
job, named by number); the report lists them, it does not act.

## Not built yet

The audit's inputs: a job cannot list pull requests or fetch their refs. The
steward would list the open pull requests with their base and head names,
fetch the refs into the project's repository in batches (about fifty refs per
fetch, never `--all` per pull request), and write the list into the job's
`inputs/`. A recurring audit would be a steward-side `makeRebaseAudit(powers)`
in `src/rebaseAudit.js` that computes the categories itself and posts the
candidate jobs ([designs/pull-requests.md](../../designs/pull-requests.md)).

Adapted from the prior garden's `skills/rebase-hygiene-audit`.
