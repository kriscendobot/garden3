---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/frozen-base-branch"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Frozen base branch

Purpose: keep each fork-side pull request's base on a frozen snapshot of the
trunk, `<base>-<short sha>`, so its review never drifts with the trunk and no
other pull request's merge moves it.

Design: [pull-requests.md](../../designs/pull-requests.md) § Rebasing in this
project.

The maintainer, 2026-05-22: the pull requests on endo-but-for-bots, "or any
fork of upstream for any repository, are suffering from the drift of the base
branch... put the agents that continue work on a pull request in control of
both the base and head branch names, to reduce coordination issues with other
PRs."

## Who does what

A job has no remote, so it never creates, moves or deletes a branch on
GitHub. The split:

- **The job** works against the base commit it was given (`JOB.yay`, under
  `pull_request`), rebases onto a new base commit when that is its job (a
  conductor), checks that the result carries only its own commits, and says
  in its report which base commit its branch now sits on.
- **The steward** creates the snapshot branch at that commit, pushes the
  head under a lease, moves the pull request's base to the snapshot,
  unfreezes before merging, and removes snapshots no open pull request uses.

A shepherd or fixer commits on top of the head and never touches the base.

## Scope

- **Fork-side pull requests** the garden opens: on the bot's forks and on
  endojs/endo-but-for-bots.
- **Not** upstream pull requests: one carried upstream (to `endojs/endo`,
  say) targets upstream's natural branch, because the maintainer reviews
  against it. Not branches that are not pull requests.

## Never a floating base

A hard rule, not advice: a fork-side pull request is opened or rebased onto
a pinned `<base>-<sha>`, never onto a bare `master`, `llm` or `main`. That
includes a design pull request against the roadmap branch (`llm` on
endojs/endo-but-for-bots): it takes `llm-<sha>` like any other. The two
failures this prevents, from three pull requests where the maintainer said
the standing instruction "may need to be reinforced":

1. **Floating base.** The pull request drifts with the trunk and is reviewed
   against the wrong merge base. On endojs/endo-but-for-bots#836: "pin the
   llm branch base to llm-xxxx by hash"; on #719, a stray `package.json`
   came along because the pull request predated the convention.
2. **Entrained delta.** A rebase onto a moving branch drags in commits
   outside the intended change. On #831: "79 commits entrained, many
   irrelevant ... may need a restart from scratch."

The checks, which a job runs before it reports (and the steward before it
publishes):

- the base is a `<base>-<sha>` snapshot, not a bare trunk name;
- `git diff --stat <base commit>..HEAD` lists only the files the change is
  about;
- `git rev-list --count <base commit>..HEAD` is about the number of commits
  the change should have. The prior garden flagged more than 40 as a wide
  entrained delta; treat a surprise here as a stop, not a push.

## Naming

```
<base>-<7-character short sha>
```

`master-abc1234`, `llm-abc1234`, `main-abc1234`: the trunk the snapshot was
taken from and `git rev-parse --short=7` of the captured tip. Two pull
requests opened at the same tip share one snapshot; that is fine while each is
unfrozen before merging (below).

On endojs/endo-but-for-bots there is no `master` (maintainer, 2026-07-16,
#475). A `master-<sha>` there snapshots **upstream `endojs/endo` master**, and
such a pull request lands by being carried upstream, never by a merge into the
fork. Its `llm` trunk is unaffected.

## The job's part

### Rebasing onto a new base (a conductor)

1. Your checkout is at the pull request's head. `JOB.yay` names the old base
   commit and the new one (the trunk's tip as the steward fetched it).
2. If the new commit's short sha equals the old one's, there is nothing to
   do; say so.
3. Rebase only your commits: `git rebase --onto <new base commit> <old base commit>`.
   Rebase onto the commit, never onto a branch name: there is no remote.
4. Resolve conflicts against the new base, reading both sides.
5. Run the checks above, then every check CI runs
   ([local-verify](../local-verify/SKILL.md)).
6. Report the new base commit and the snapshot name `<base>-<sha7>` the
   steward should create and move the pull request to.

### Lessons for the job

- **After a rebase onto a base with dependency changes, reinstall before
  verifying.** A tree installed for the old head lacks newly pinned packages,
  and every JavaScript check fails with the same `Couldn't find ... in the
  currently installed pnpm map` error. `corepack yarn install --immutable`
  reconciles it without touching tracked files (offline, against the cache
  the garden provides; if it needs the network, report it).
- **An autostash conflict that is not yours.** An install can reformat a
  tracked file (on endojs/endo-but-for-bots, `packages/hex-test/package.json`),
  so the checkout is dirty before you start. `git rebase` stashes it, replays
  your commits, and fails to pop the stash. The rebase succeeded: check
  `git log` and `git diff <base>...HEAD`, restore the file with
  `git checkout HEAD -- <file>`, and do not commit the installer's edit.
- **On a design pull request on a fork with no roadmap branch**, the
  snapshot is what makes the diff exactly the design file rather than the
  fork's drift behind upstream.

## The steward's part (designed, not built)

### Create at open

Capture the trunk's tip once and use that commit for everything after, so a
later fetch cannot move the snapshot:

```sh
BASE_SHA=$(git rev-parse <trunk tip as fetched>)
FROZEN_BASE="<base>-$(git rev-parse --short=7 "$BASE_SHA")"
git push <fork> "$BASE_SHA:refs/heads/$FROZEN_BASE"   # reuse it if it exists
```

Then push the head and open the pull request with `--base "$FROZEN_BASE"`,
finding the job's existing pull request by its marker first, so a repeat
does not open a second.

### Rebase: move base and head together

Create the new snapshot at the conductor's base commit, push the head with
`--force-with-lease=<head>:<recorded head>`, then move the pull request's
base to the new snapshot. Other pull requests are untouched: their bases
still name their own snapshots. The old snapshot stays until close.

### Unfreeze before merge

Mandatory before any merge. A pull request whose base is a snapshot has its
base moved back to the live trunk (`llm`, `main`, `master`) first; otherwise
the merge lands on the snapshot and the trunk never receives the change
(maintainer, endojs/endo-but-for-bots#418). After unfreezing, the merge
follows designs/pull-requests.md: only when the head contains the trunk's
tip and CI on that head is green. Merging onto a snapshot is a violation; a
snapshot is for review. Two open pull requests sharing a snapshot show why:
merging one into it advances the shared ref and silently changes the other's
comparison.

### Sweep on close

On merge or close, remove the snapshots the pull request used (every base it
had, from its `base_ref_changed` events, plus its current one; never a live
trunk). For each:

1. Immediately before deleting, ask the authoritative REST list
   (`pulls?state=open&base=<ref>`), never search, whose index lags new pull
   requests. Any other open pull request on the base, or with the ref as its
   head, keeps it. A failed read keeps it.
2. Record the ref's commit, then delete it.
3. GitHub has no compare-and-swap on ref deletion, so a pull request can land
   on the base in between and be auto-closed with `base_ref_deleted`. After a
   short settle, look for one; if found, recreate the ref at the recorded
   commit and reopen it.

That race happened: a pull request opened on an existing snapshot was closed
eight seconds later by a sweep whose check read the lagging search index. Its
tell is a pull request closed seconds after opening, unmerged, with a
`base_ref_deleted` event and no human close.

### Stacked pull requests

Each pull request in a stack gets its own snapshot. A dependent's base is a
snapshot of its parent's head, `<parent head>-<sha7>`. Rebasing the parent
does not move the dependent: it keeps reviewing against the old snapshot
until it is rebased itself, onto a new snapshot of the parent's current head.

## Pitfalls

- **CI workflows keyed on `master`** see `master-abc1234` as the base. They
  may need a pattern such as `^(master|master-[0-9a-f]{7})$`.
- **A template that names the base**: override with the snapshot.
- **GitHub's "Update branch" button** merges the snapshot into the head,
  which is what we want; a "rebase" merge type targets the snapshot too.
- **Branch clutter** on the fork is bounded by the sweep.

## Not built yet

The steward's half: creating snapshot branches, pushing heads under a lease,
moving a pull request's base, unfreezing before merge, and the race-safe
sweep. They belong to the drive in designs/pull-requests.md, beside
`src/steward.js`. Until then, a job does its part and its report names the
snapshot the steward should make.

Adapted from the prior garden's `skills/frozen-base-branch`.
