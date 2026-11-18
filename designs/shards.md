---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Shards: one branch, one purpose

The garden's mutable records are split across branches so that writers which
have nothing to do with each other never contend, and so that no branch has to
be cloned in full to be used.

## The layout

| Branch | Root worktree | Holds | Written by | Churn |
| --- | --- | --- | --- | --- |
| `main` (default) | `main/` | a README and the setup wizard | maintainers | very low |
| `shed` | the root | designs, roles, skills, `src/`, `rust/`, capabilities, config | maintainers, by pull request | low |
| `board` | `board/` | the job board, and the quiescence document | every host, by compare-and-swap | high |
| `archive` | `archive/` | jobs that have left the board | every host | high, append-only |
| `journal` | `journal/` | daily digests, steering config, weekly budget statements | every host, rarely | low |
| `library` | `library/` | the context library | librarian jobs | low |
| `plot/<name>` | `plots/<name>/` | one plot's genome | the steward's landing only | medium |
| `host/<name>` | none | one host's usage rows and status | that host alone | high, single writer |
| `clients` | `clients/` | signed orders for client hosts | maintainers, signed | low |
| `gate` | `gate/` | the maintainer's out-of-box root: boatman, keys, cutover | maintainers | low |

`main` is what a visitor and a new host see first; the garden itself is the
`shed`. No two of these branches share history. The root worktrees are views
for people; services never commit in them ([WORKTREES.md](../WORKTREES.md)).

## How a write lands

`src/shard.js`. A writer keeps its own clone of the one branch it writes, under
`.garden-state/clones/<owner>/<branch>`. To change the branch it syncs to the
remote tip, re-derives its change from the tree it finds, commits, and pushes
without force. The remote accepting a fast-forward is the compare-and-swap; a
rejected push means someone else moved the branch, and the writer starts again
from the new tip. A claim that loses moves on to the next candidate rather
than retrying the same job.

Two branches cannot move in one commit. Where an operation spans two (a
completion writes the archive and leaves the board), the idempotent write goes
first and is keyed by job id, so a crash between the two is finished by the
next attempt or by the sweep. This is the tower's atomicity rule.

## Shallow, always

The prior garden's `journal2` reached 142,839 commits and its clones had to be
seeded shallow from the host's own root repository to be usable at all. Here:

- every clone and every fetch is `--depth 1 --single-branch --no-tags`;
- the fetch is forced (`+refs/heads/b`), and a sync is a hard reset to the
  remote tip, so nothing local survives one;
- **nothing reads history.** The prior garden's readers that walked the log
  (creation times from `git log --diff-filter=A`, reputation replay) are why
  its clones had to be deepened again. Every fact a reader needs is in a file:
  `posted_at`, `claim.at`, `completed_at`, the hand-off log.

Because of the last two points a branch that is rewritten to a fresh root at a
quiescence ([quiescence.md](quiescence.md)) is adopted by a stale clone like
any other move, and a clone holds one commit however long the garden runs.

## Ported from

- The tower: `scripts/jobs/common.sh` (`ensure_clone`, `sync_clone`,
  `commit_and_push`, `retry_land`), `scripts/tower/bootstrap-branches.sh`,
  `divergence/branch-routing.md` (the split of the garden's one journal branch
  into `jobs`, `journal`, `library`, and the atomicity rule).
- The prior garden: `scripts/jobs/common.sh` (`GARDEN_JOURNAL_SEED_DEPTH`,
  `journal_seed_from_root`, the full-jitter `backoff`), `claim-job.sh` (move on
  after a lost claim).

## What changed

- More shards than the tower's four: the archive is apart from the board, each
  host has a single-writer branch, each plot a branch, and there are `clients`
  and `gate`.
- The remote is GitHub, not a local hub, so there is no server-side hook and no
  `denyNonFastForwards`: truncation needs a forced push, and the plot wall is
  enforced by the only code that holds a credential ([plots.md](plots.md)).
- The prior garden's local-seed and deepen machinery is not ported; with depth
  1 and no history readers it has nothing to do.

## Status

Implemented and tested: `src/shard.js`, `scripts/shards/bootstrap.sh`,
`test/boardService.test.js` (races, stale clones, shallowness),
`test/bootstrap.test.js`.

## Open questions

1. **Per-host branches on GitHub.** `host/<name>` grows a branch per host. Is
   that acceptable in the branch list, or should they live under a ref
   namespace outside `refs/heads/`?
2. **Plot names.** Plots are named for trees (`alder`, `birch`) rather than
   numbered, to keep clear of the prior garden's numbered branches. Any names
   work; say if numbers are preferred.
3. **The name `gate`.** For the branch holding the maintainer's out-of-box
   root. `porch` and `landing` were the alternatives.
