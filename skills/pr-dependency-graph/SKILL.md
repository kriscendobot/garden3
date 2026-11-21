---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pr-dependency-graph"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pull request dependency graph

Purpose: read which pull requests block which into a graph, ask it
questions, and order a set of pull requests so that each comes after what
it depends on, deterministically, stopping at a cycle rather than guessing.

## The input

A pull request is named `<owner>/<repo>#<n>`. Each declares, as YAY:

```yay
repo: "endojs/endo-but-for-bots"
number: 160
blocked_by: [ { repo: "endojs/endo-but-for-bots" number: 128 reason: "needs the new parser" } ]
blocks: [ ]
```

Where these come from is the caller's: a drive's record, or what the
steward fetched into `inputs/`. Read records with `parse` from `src/yay.js`.

## The graph

1. An entry `A.blocked_by` naming `B` is the edge `B -> A` (B blocks A).
   `A.blocks` naming `C` is `A -> C`. `blocked_by` is the canonical side;
   reciprocity is welcome, not required, and its absence is not a warning.
2. One edge per `(from, to)`. On a conflict the `blocked_by` side's reason
   wins.
3. Cross-repository edges are ordinary.
4. Given a set to restrict to, drop the nodes outside it and every edge
   touching them.

Nodes sort by `(repo, number)`. The record: `nodes`, `edges` (each `from`,
`to`, `reason`) and `warnings`.

Queries:

- **blockers of** a pull request: one hop back.
- **blockees of**: one hop forward.
- **all blockers**: breadth first backward, excluding itself, ordered by
  layer, then `(repo, number)`.
- **cycles**: every elementary cycle, each starting at its smallest member.

## Ordering

To order a set:

1. Keep only edges with both ends in the set.
2. Kahn's algorithm: start with every pull request with no blocker in the
   set, smallest `(repo, number)` first; take the smallest; release its
   blockees; insert each newly free one in order; repeat.
3. If every pull request came out, that is the order. Two runs on the same
   input give the same order.
4. If some did not, they are in cycles. Do not fall back to input order.
   Return the prefix and the cycle members, and stop the work that needed
   the order.

A pull request whose blockers are all outside the set (merged, elsewhere)
has none inside it, and comes first, by the tie-break.

Do not reorder the caller's list in place; use the order to select.

## A cycle is a declaration bug

Not a sort bug. A maintainer, or whoever writes the declarations, removes
the contradicting edge and says why. Until then report it: the cycle's
members in `outbox/report.md`, with `next: maintainer`.

## Pitfalls

- **Merged pull requests** may still have declarations. The graph does not
  know state: combine it with what is still open.
- **A self-loop** is a one-member cycle. Report it; do not drop it.
- **Disconnected components** are normal; the tie-break interleaves them.

## Not built yet

A place for the declarations and their reader. A drive
([designs/pull-requests.md](../../designs/pull-requests.md)) is where the
order is wanted: its reduce should take green pull requests in dependency
order. The graph, its queries and the ordering would be a pure module in
`src/` beside the drive, with tests; the declarations would be part of the
drive's record on the board, read from pull request bodies by the steward.

Adapted from the prior garden's `skills/pr-dependency-graph`, with
`skills/pr-dependency-topo-sort` folded in.
