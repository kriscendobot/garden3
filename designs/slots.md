---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Slots: an account and a home per job

Jobs must not read each other's files, and must not leave anything behind.
Code: `src/slots.js`, `src/project.js`, `src/dispatch.js`, `rust/warden`.

## The choice

The maintainer asked for an account per plot, and wondered about one per job.
Decided: **one account per running job, from a fixed pool**, and not a fresh
account per job:
`slot01`..`slotNN`, created by the entrypoint, each alone in its own group.
Dispatch takes a free slot, builds its home from nothing, runs the job as that
account, carries the work out, and razes the home. This gives the isolation of
an account per job (no two jobs ever share a uid at the same time, and a job
finds nothing of its predecessor) without creating and deleting accounts, and
it subsumes an account per plot: a plot has no home of its own, only a branch.
(A uid is reused by later jobs. Clearing kills every process of the account
and removes what it owns in its home and the temp directories; that is the
whole of the separation between one job and the next in a slot.)

## A slot's life

1. **Clear** (`warden clear`): every process of the slot's account is killed,
   until none remain; the home is removed without following links.
2. **Export the shed**: `git archive` of the deployed shed commit, unpacked
   into the home. Files only. There is no `.git`, so the job cannot reach the
   garden's object store through its home.
3. **Lay the plot over it**: the tracked files of `plot/<name>` replace the
   shed's copy of each genome path outright ([plots.md](plots.md)).
4. **Tombstones** (`warden plant`): at `repositories`, `board`, `archive`,
   `journal`, `library`, `gate`, `plots`, `slots`, `.garden-state` and `.git`
   the home holds a read-only **regular file**. A `mkdir`, `git clone` or
   `git worktree add` at any of those paths fails at once, and the file says
   what to do instead. `worktrees/`, `scratch/` and `outbox/` are made.
5. `JOB.yay` (the record) and `.slot.yay` (what was laid down, for harvest).
6. **Own** (`warden own`): the home is given to the slot's account, mode 0700.
   The slots directory is 0711 and root's, so a job can reach its own home and
   list nothing.
7. **Run** (`warden run`): the worker's command, as the slot's account, in its
   own process group, with exactly the environment dispatch names (the clock,
   where things are; no key), until its deadline ([wrap-it-up.md](wrap-it-up.md)).
8. **Harvest**: work is carried out (below).
9. **Clear** again. Also every slot at boot and at each quiescence.

The slot is cleared on every path out of dispatch, including a run that could
not start.

## Project checkouts

A job gets a project with `garden project add <org>/<name> [<ref>]`: one
checkout per project, under `worktrees/<org>/<name>/`, on a new branch
`job/<id>/<generation>`, the generation being that of the job's claim
([deadlines.md](deadlines.md)). A second `add` for the same project is refused.

The garden's bare repositories are kept as in the tower,
`repositories/<org>-<name>.git`, one per upstream, fetched only by the steward.
The tower gives each job a linked `git worktree` of the bare repository. That
needs write access to the shared repository (its `worktrees/` directory, and
its object store on every commit), which a job running as another account must
not have. So the checkout is its own small repository that borrows the shared
one's objects read-only (`git clone --shared`, an alternates file) and keeps
everything the job writes in its home. It has no remote: the job holds no
credential and pushes nothing.

At harvest the steward saves uncommitted work as one commit on
`wip/<id>/<generation>`, then fetches exactly that and `job/<id>/<generation>`
from the checkout into the bare repository, with hooks disabled and no submodule recursion. A job therefore
cannot write another job's branch or the project's own. Publishing those
branches to GitHub is the steward's, with the bot's key ([keys.md](keys.md)).

Also harvested: genome files the job changed (to its plot's landing), and
plain files left in `outbox/` (its report, its hand-off).

## The warden

The services run as the unprivileged `steward`. What needs root is in one small
Rust program, installed root-owned and setuid, called with a SHON request and
answering in YAY ([services.md](services.md)). It acts only on `<root>/slotNN`,
follows no symbolic link, refuses uid 0 and the caller's own uid, and never
runs a job without a deadline. The entrypoint writes `/etc/garden/warden.yay`,
which confines it to the one slots directory and the slot accounts' uid range,
so being able to call the warden is not being root.

## Ported from

- The tower: `WORKTREES.md` (`repositories/<org>-<name>.git`,
  `worktrees/<org>/<name>/<job>/`, `scratch/<job>/`), the worker's
  `setsid timeout --signal=TERM --kill-after` and its `<base>-wip` save,
  `worker-auth.py`'s stripped environment, the reaper's `scratch_gc`.
- The prior garden: `run-sandboxed.sh` (one key, everything else unset).

## What changed

- The tower runs every job as one user in one home, and removes job worktrees
  by convention only (no script removes them; scratch is collected a day
  later). Here removal is the mechanism: there is nowhere for leftovers to be.
- Checkouts borrow objects instead of being linked worktrees (above).
- Jobs do not push. In both priors a worker pushed to the bot's fork itself.

## Status

Implemented and tested in `sim` mode (no accounts) through the real warden:
home contents, tombstones, one checkout per project, harvest of commits, wip,
genome and outbox, hooks not run, razing (`test/slots.test.js`,
`test/dispatch.test.js`, `rust/warden/tests`). **Not run:** `users` mode. The
warden's three root-only acts (killing another account's processes, re-owning a
home, running as another account) are tested only to refuse cleanly when not
root. Design only: the steward publishing harvested branches and acting on
`outbox/` requests for GitHub.

## Open questions

1. **`git clone --shared` against linked worktrees.** The checkout breaks if
   the bare repository prunes objects under it (`gc.pruneExpire never` is set
   for that reason). Is the borrowed checkout an acceptable reading of "a
   single worktree for each project"?
2. **The bare repositories are world-readable** inside the box, since they
   mirror public projects. A private project needs a different arrangement.
3. **A setuid helper.** The alternative is a root daemon on a socket; the
   helper is smaller and has no listener. The policy file is what bounds it.
4. **Jobs cannot act on GitHub directly** (comment, open a pull request). The
   plan is requests in `outbox/` that the steward carries out. Is that
   acceptable latency for review conversations?
