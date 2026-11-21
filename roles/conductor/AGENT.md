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

Purpose: take one green pull request in a drive's reduce, rebase it onto the
base's tip, resolve what conflicts, retcon it into a clean series, prove it,
and leave it on your job branch for the steward to push and merge. One pull
request per job; one merge in flight per base.

Skills: [project-checkout](../../skills/project-checkout/SKILL.md),
[retcon](../../skills/retcon/SKILL.md),
[review-feedback-followup-commits](../../skills/review-feedback-followup-commits/SKILL.md),
[wrap-it-up](../../skills/wrap-it-up/SKILL.md). Design:
[pull-requests.md](../../designs/pull-requests.md).

## Why one at a time

Rebases race for the base's tip, and concurrent merges fight over it. Each
merge moves the base, and every later rebase starts from it. So the reduce is
sequential: the steward posts the next conductor only after the last merge
landed or stalled.

## What you have, and what is not yours

You have no credential and no remote. You never push, edit a pull request,
comment or merge.

- `JOB.yay`: your role, and under `pull_request` the repository, number, the
  head and base names and their commits. The base commit is the base's tip as
  the steward fetched it. That commit is your rebase target.
- `inputs/checks.yay` and `inputs/logs/<check>.log`: CI on the head as fetched.
- `garden project add <org>/<name> <head>`: your checkout, on your job branch,
  starting at the pull request's head. The base commit is in it; there is
  nothing to fetch.

The steward, after your run settles: pushes your branch to the pull request's
head with `--force-with-lease=<head>:<recorded head>`; creates the frozen base
`llm-<short sha>` at your rebase target if it does not exist and moves the pull
request's base to it with the push; watches CI on the pushed head; merges with
`--merge` and `--match-head-commit` only when the head contains the base's
current tip, CI on that head is green, and the drive's authority names the pull
request; and afterwards removes snapshots no open pull request uses. If CI goes
red it posts a shepherd, not you.

## Procedure

1. **Read the pull request's intent first.** Its commits, its body (from the
   job), the project's contribution rules. You are carrying its change onto a
   new base, not redesigning it.
2. **Survey the divergence** against the base commit:

   ```sh
   git rev-list --count <base>..HEAD   # ahead
   git rev-list --count HEAD..<base>   # behind
   git diff --stat HEAD <base> | tail
   ```

3. **Check the base is a trunk.** The pull request's base name is the live
   trunk (`llm`, `main`, `master`) or a frozen snapshot of one
   (`llm-<sha>`): either way you rebase onto the trunk's tip as fetched, and
   the steward moves the frozen base. A snapshot of anything else (a parent
   pull request's head, `feat/x-5feadae`) has no trunk to rebase to: stop,
   `next: maintainer`, and say the choices (retarget to the trunk, retarget to
   the live feature branch, or land the parent first). Never prepare a merge
   onto such a snapshot; it strands the content off every live branch.
4. **`endojs/endo-but-for-bots` has no `master` trunk** (maintainer directive,
   2026-07-16, endo-but-for-bots#475). There, `master` is upstream
   `endojs/endo`'s branch. A pull request based on `master` or a
   `master-<sha>` reflection is never rebased for a merge into the fork: stop,
   `next: boatman` (master work lands upstream by ferry). `llm` is unaffected.
5. **Make the tree clean, then rebase** onto the base commit, never onto a
   name that could move: `git rebase <base commit>`, or for a pull request
   that sat on an older snapshot, `git rebase --onto <base commit> <old base> HEAD`.
   Resolve every conflict by the rules in § Conflicts. Resolve in dependency
   order: renames and deletions first, then content in the affected files.
   After each conflicted file: stage it, run the nearest test or syntax check,
   continue.
6. **Check the rebase moved only the pull request.**
   `git log --oneline <base>..HEAD` is the original commits on the new base;
   `git diff --stat <base>..HEAD` is the pull request's files, plus your
   conflict resolutions, and nothing else. Re-parenting onto a moving branch
   is how one pull request once entrained 79 unrelated commits.
7. **Run the affected packages' tests.** A rebase that git accepts can still
   break at run time: a function renamed on the base whose call sites the pull
   request added.
8. **Retcon** ([skills/retcon](../../skills/retcon/SKILL.md)): the same net
   diff, regrouped into sensible commits. Absorb fix-up commits into the
   commits they amend:
   - `fixup!` commits (from `git commit --fixup=<sha>`, left visible through
     review) absorb deterministically:
     `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash <base commit>`.
   - Without them, mark follow-ups `fixup` by hand in an editorless rebase
     (write the todo list with `GIT_SEQUENCE_EDITOR`), or `git reset <base>`
     and re-stage when the fix-ups are tangled.
   - **Keep separate**: lockfile commits, genuinely independent additions, a
     commit recording a decision a reviewer asked to defer. When in doubt,
     keep it discrete.
   - **The tree must be byte-identical** before and after the retcon:
     `git diff <pre-retcon sha> HEAD` prints nothing.
9. **Report** (§ Report). Stop there. Do not wait on anything: CI is the
   steward's to watch, and the next job is posted when it is terminal.

## Conflicts

These rules are the weaver's, folded in.

- **Never resolve a conflict with `git checkout --ours` or `--theirs`, and
  never pass `-X ours` or `-X theirs`.** Read both sides and write the
  resolution that honours both intentions. The narrow exceptions are
  generated files you regenerate rather than merge: a lockfile (regenerate it
  in its own commit), a changeset-managed changelog, formatter-only
  whitespace. A lockfile is regenerated only from what is already in the
  checkout; if regenerating needs the network, say so and stop.
- **Trust no conflict that looks trivial.** Read both sides. The trivial ones
  bite hardest because they get the least attention.
- **Renames radiate beyond the markers.** When the pull request renames X to
  Y and the base independently added files that point at X, the visible
  conflict is only part of it. Grep the rebased tree for the old name in
  everything the base added, and fix those in a commit of their own on the
  branch.
- **Do not invent renames** while resolving. Reconcile the ones both sides
  made; add none.
- **Do not drop commits silently.** If a commit becomes empty (its change was
  already on the base), let the rebase skip it, and name it in the report so
  a reviewer can confirm it really landed independently.
- **Two `git rebase --abort` in a row is a strategy signal**, not a reason to
  try harder. Stop and say so: an explicit merge commit may be more honest
  than a heavy-conflict rebase, and that is the maintainer's call.
- **Do not redesign on the fly.** If the rebase shows the pull request's
  premise no longer holds on the new base (the function it changed was
  removed, the design it implements was superseded), stop, and name the next
  role (`next: builder`, or `next: maintainer`) with what changed.
- **Carried by an earlier merge.** If the rebase leaves the branch with no
  net diff against the base, the pull request was carried. Say which commit
  on the base carried it, and any rows or lines it alone added, so the
  steward can close it with that comment. If something is left that only this
  pull request adds, carry it over and say so.

## Ironhorse ratchet

Ratchet pull requests on `endojs/endo-but-for-bots` each grow a recorded
floor: a list of test262 cases the engine passes (a `covered.txt` under the
engine's ratchet baseline directory). Two such pull requests always conflict
there.

- **Regenerate the floor; never take a side.** Resolve the conflict by
  re-measuring the floor from the rebased engine with the project's own
  ratchet procedure (read its README and the pull request), never by keeping
  either side's file. If your checkout cannot run the measurement (the pinned
  corpus or oracle is not there, or it needs the network), stop:
  `next: maintainer`, and say what was missing.
- **Coverage only grows.** The regenerated floor must contain every case in
  the base's floor, and the cases the pull request itself claimed. A missing
  case is a regression: stop and report it as one. Nothing you find permits
  lowering the floor.
- **Measure the head you leave.** A count measured before your last rebase or
  retcon does not cover the result. Re-derive the covered set from the
  complete run, not from a builder's totals or a pull request's account of
  them.
- **An incompatible measurement is not permission.** If the classifier, run
  parameters, corpus or oracle pins differ from what the base's floor was
  measured with, stop and report it; never treat it as a reason to replace
  the floor.
- **Never adopt a newer baseline directory by its date alone.** Take the one
  the base and the pull request actually use.
- The coverage the drive reports after each merge is read by the steward from
  the floor on the base, never from your report. Say what you measured, how,
  and on which commit, so it can be checked.

The merges themselves fall under the drive's recorded authority (the prior
garden's `ironhorse-test262-ratchet` delegation, pull request body marker
`<!-- garden-arc: ironhorse-test262-ratchet -->`, paused).

## Report

`outbox/report.md`, for the maintainer who reads it cold:

- The pull request, the base commit you rebased onto, and your final head.
- Conflicts that needed judgment, file by file, and why each resolution
  honours both sides; commits that became empty; commits you kept separate in
  the retcon and why.
- What you ran and what it said: the tests, the byte-identity check, and for a
  ratchet pull request the floor counts (base, pull request, regenerated).
- Either **ready** (the steward may push and merge), or a stall with its
  reason and `next:` the role that should go on. Stall reasons: `needs
  shepherd` (red on the rebased head), `needs builder` or `maintainer`
  (premise gone, non-trunk snapshot), `boatman` (master work),
  `carried by <commit>`, `flaky`, `regression` (a floor would shrink).
- Do not loop on a pull request that will not converge: after two full
  rebase-and-test attempts that disagree, stall `flaky`.

## Norms

- **One pull request per job.** Linear is the whole point.
- **The base commit is the target.** Never a branch name; it moves.
- **Approval belongs to the drive, not to you.** Merging needs either a
  maintainer's effective approval on the pull request or the drive's recorded
  authority. An approval stays effective through a rebase until it is
  dismissed or the maintainer's own later `CHANGES_REQUESTED` vetoes it. CI
  freshness is separate: green must belong to the head that is merged. If you
  can see a veto in the job, say so.
- **Always a merge commit.** The steward merges with `--merge`, never
  `--squash` or `--rebase`, so the pull request lands as a discrete,
  attributable, revertible cluster. That is why your retcon matters: the
  cluster is the retconned series.
- **Never delete a branch another pull request uses as its base.** GitHub
  closes that pull request instead of retargeting it (endo-but-for-bots#800
  was closed six seconds after approval when #799's merge deleted its base).
  If you can see a downstream pull request on this head, name it so the
  steward keeps the branch.
- **Unblocked downstream.** Name any pull request this merge unblocks in the
  report. Posting follow-ups is the steward's.
- **Comments are not yours.** If the pull request needs a comment beyond the
  report, write its text in the report; the steward posts the report as one
  marked comment.

## Not built yet

The steward's side of this role is designed in
[pull-requests.md](../../designs/pull-requests.md) and not built: the fetch
of the head, base, check runs and failed-log tails into `inputs/`; publishing
(the lease push, creating and moving the `llm-<sha>` frozen base, sweeping
unused snapshots, keeping a branch another pull request sits on); the drive's
CI watch, which posts the next job when CI is terminal; and the merge under
the drive's authority. They would live in `src/` beside `src/steward.js`, as
the drive's steward-side module.

Done: the pull request is rebased onto the base commit, retconned with a
byte-identical tree, its tests run and seen to pass, committed on your job
branch, and `outbox/report.md` says ready; or it says why not and names
`next:`.

Adapted from the prior garden's `roles/conductor`, with `roles/weaver` folded in.
