---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/design-dependency-walk"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Design dependency walk

Purpose: before building a design a maintainer named, follow its chain of
dependencies to the next unit of work that can actually start, and check
that the designs beside it carry no live direction against it.

A design is built on others (vertical) and composes beside others
(horizontal). The walk follows the first and gates on the second. It does
not return a buildable verdict while either is unmet.

## Verdicts

- **reconcile-or-redirect**: a related open design pull request carries an
  outstanding changes-requested review from a maintainer. Overrides the
  rest.
- **start-here**: every dependency of the design (or of the one the walk
  redirected to) has shipped. Build it on the project's base.
- **stack-on-prs**: the design depends on open implementation pull
  requests. Build on the base merged with their heads; name each number and
  head commit.
- **start-with-dep**: the walk reached a dependency with no design work
  started and no pull request. Build that first; the seed waits.
- **no-actionable-design**: everything in the chain is blocked (a cycle, a
  maintainer decision, a missing design). Say why.

Write the verdict as YAY in `outbox/`, beside the report:

```yay
design_path: "designs/timer.md"
note: "depends on clock.md, merged in #612; nothing open beside it"
stack_prs: [ ]
verdict: "start-here"
walked_chain: [ "designs/timer.md" ]
```

## 0. The designs beside it

A design document is a snapshot; a related design pull request's live
review is the maintainer's current direction. Take the related set from
what the seed declares (its `## Related` or `## See also`, its roadmap
group) and from the job's body. Relatedness is declared, never invented.

- A related pull request whose latest maintainer review requests changes,
  not since approved or dismissed, is **attention**: the verdict is
  reconcile-or-redirect. Either show, in the eventual pull request's body,
  that the implementation composes with every outstanding direction, or
  stop and wait behind the related design. Say which, explicitly; never
  infer independence silently.
- When the build does go ahead, put
  `<!-- garden-related-design: <n>,<n> -->` in the proposed pull request
  body, so a reviewer re-checks the same set.

The lesson: a build once asserted its slice was independent of the
adjacent design pull request from the design document alone, while that
pull request already carried a review replacing the seam the build stood
on. Four review rounds later the maintainer closed the build for
reconstruction.

## 1. The seed's dependencies

Read the seed from the project's roadmap branch, in your checkout
([project-checkout](../project-checkout/SKILL.md)). Its `## Dependencies`
(or `## Depends On`) bullets name other designs, by path, preferably. No
such section: start-here.

## 2. Classify each dependency

First match wins:

1. **merged**: a merged pull request references the dependency's design.
   Satisfied.
2. **in flight**: an open pull request references it. Record its number and
   head commit.
3. **unstarted**: the design exists on the roadmap branch; no open or
   merged pull request references it. Recurse.
4. **no design**: the document does not exist. A dangling reference: report
   it, `no-actionable-design`.

## 3. Aggregate

- All merged: start-here.
- In flight and merged only: stack-on-prs.
- Any unstarted: recurse into it first; it is the immediate blocker, even
  when others are in flight.
- Any missing design: no-actionable-design.

## 4. Recurse

- **Cycles.** Keep the walked chain. A dependency already in it is a cycle:
  name every member, `no-actionable-design`.
- **Already being built.** If another job on the board is building the
  dependency (`garden board read`, or what the job was given), do not start
  a second build: stack on its pull request, or, if it has none yet, wait
  and say so.
- **Recurse** with the dependency appended. Its start-here or stack-on-prs
  makes the seed's verdict start-with-dep on it; its start-with-dep
  propagates; its no-actionable-design means try the next unstarted
  dependency, newest roadmap change first, then by path. Only when all are
  unactionable is the seed.

## Pitfalls

- **Slug-only references** ("depends on timer") are ambiguous when slugs
  repeat. Resolve by the package directory; if still ambiguous, report it
  as a missing design. Do not guess.
- **Closed without merging** is not shipped.
- **A stale open pull request** still counts as in flight. Adopting it is
  separate work.
- **Another repository.** The walk assumes one repository. A cross-repo
  dependency is reported as a missing design.
- **A closed seed is not dead.** A pull request named by an old number may
  have been closed and split into a replacement stack. Follow its closing
  comments to the live pull requests and work against those. The job may
  name the wrong fork for the same reason; check where the live stack is.

## Not built yet

The fetch the walk needs: pull requests referencing each design (state,
head, body) and the latest reviews on the related design pull requests,
written into the job's `inputs/` by the steward
([designs/pull-requests.md](../../designs/pull-requests.md)). A job reads
no GitHub itself. Without it the walk can classify only from the project's
history in the checkout (merge commits naming pull requests), and must say
that it could not see open pull requests or reviews.

Adapted from the prior garden's `skills/design-dependency-walk`.
