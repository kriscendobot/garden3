---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/design-to-pr-pipeline"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Design to pull request pipeline

Purpose: keep one builder at a time opening the first pull request for each
design that has none, until every design is accounted for.

The maintainer's framing: "Notice that new designs have landed and keep one
builder busy drafting the initial PR at a time, until all designs are
accounted for. That entails linking the design to a PR on the llm branch."

Two halves: an inventory (which designs are uncovered), and a build job per
uncovered design, one in flight at a time. A job given the inventory as data
can do the first half; the second is a job like any other.

## What counts as covered

A design at `<path>` on the roadmap branch (for `endojs/endo-but-for-bots`,
`llm`; designs under `designs/` and `packages/*/designs/`) is covered when:

1. an **open** pull request references the design's path in its title, body,
   head branch or a commit message, as a load-bearing reference ("implements
   `designs/<slug>.md`"); or
2. a **merged** pull request does; or
3. the design's own metadata names a pull request (`Status: PR #N`) that is
   open or merged.

A pull request **closed unmerged** does not cover it: the attempt was
abandoned, and the design is owed again. Name the closed one, so a maintainer
can decide whether to revive it rather than start fresh.

Match the **canonical path**, not the slug. Slugs are English nouns ("timer");
a checklist naming "timer" among twenty items is not a tracking pull request.

## The inventory

1. List the design files on the roadmap branch, in the project checkout
   (`git ls-tree -r --name-only <roadmap> -- designs 'packages/*/designs'`).
2. For each, decide coverage from the pull request list the job was given
   (see below).
3. The uncovered set, newest first by the design's last change on the
   roadmap branch (`git log -1 --format=%cI <roadmap> -- <path>`), path as the
   tiebreak. The first is next.
4. **One in flight.** If a draft-initial-pull-request job is already on the
   board, nothing more is owed now.
5. Otherwise one build job for the head of the set, with an id derived from
   the design's slug so a repeat is a no-op. The steward posts it
   (`garden board post`, [job-board](../job-board/SKILL.md)); a job names it as
   the `next:` line of its report.
6. Report the result either way: "N designs uncovered; posted for <slug>",
   "N uncovered; one in flight for <slug>", or "0 designs uncovered".

## The build job

It differs from an ordinary build in two ways:

- **Its base is the roadmap branch**, not `master`: the tracking pull request
  lives beside the design.
- **It is a stub.** One of: (a) the design's acceptance criteria restated as
  a checklist in the body; (b) a one-line README addition naming the design;
  (c) a skeleton (signatures and types, no implementation) that compiles and
  runs the design's tests, failing. (a) is cheapest; (c) is most useful when
  the criteria are precise. Its body names the design's path, so the next
  inventory counts it covered.

## Not built yet

The pull request list. A job cannot query GitHub; the steward would fetch
the open, merged and closed pull requests that mention each design into the
job's `inputs/`, and open the stub as a draft pull request after the run. The
recurring inventory itself is a steward-side producer, a
`makeDesignInventory(powers)` module in `src/designInventory.js` on the
steward's tick, posting at most one build job at a time.

Adapted from the prior garden's `skills/design-to-pr-pipeline`.
