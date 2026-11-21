---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pr-creation-flow"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pull request creation flow

Purpose: the order of stages a pull request the garden opens goes through
before a maintainer sees it, and the rule that the chain runs to its end
rather than stopping at the first draft. The chain as a whole is **the
gauntlet** ("run the gauntlet on #N": resume from wherever the pull request
sits and carry it until review passes and it leaves draft).

Here each stage is its own job, and everything that touches GitHub is the
steward's ([designs/pull-requests.md](../../designs/pull-requests.md)). A job
commits on its branch and says, in `outbox/report.md`, what it did and
`next:` the stage owed. How to do each stage lives in that stage's role or
skill; this file is the map.

## The stages

```
build      a builder commits the change; the steward publishes the branch
   |       and opens THE draft pull request
   |  in concert (default), before, or after
   v
assayer    tests for this change's contribution, same branch
   |
   v
cleaner    coverage on the touched packages, dead code removed, CI green
   |
   v
panel      the review: code panel or design panel; on must-fix, a fixer
   |       job commits and the panel runs again (the panel-fixer loop)
   v
appellate  advisory: promote small, in-context deferrals before leaving draft
   |
   v
ready      the steward marks the pull request ready for review
```

Roles and skills:
[builder](../../roles/builder/AGENT.md),
[assayer](../../roles/assayer/AGENT.md),
[cleaner](../../roles/cleaner/AGENT.md),
[fixer](../../roles/fixer/AGENT.md),
[panel](../panel/SKILL.md) and [panel-review](../panel-review/SKILL.md)
(the seats, the disposition rubric, the loop, the appellate pass).

### Variants

- **Tiny change.** Documentation only, a lockfile-only churn, a one-file
  format sweep, or a single-line fix whose test is already in the diff: no
  coverage surface, so the cleaner is skipped and the panel follows the build.
- **Design only.** Every changed path is under the project's design
  directory: build, design panel, fixer loop, ready. No assayer or cleaner.
  The design panel's seats are critic, skeptic, decomplector, ergonomist,
  copyeditor, pedant and novice. A design pull request is usually opened by a
  designer's job, not a builder's; it runs the same chain.
- **No must-fix on the first panel.** No fixer; the appellate pass, then
  ready.
- **After a maintainer's review.** `CHANGES_REQUESTED` starts a fixer, CI to
  green, and a fresh request to the maintainer, but **not** a fresh cleaner or
  panel unless the maintainer asks. The pull request stays out of draft.

## Draft discipline

**Every pull request the garden opens is opened as a draft**, whatever opens
it: a build, a probe, a design, a stacked pull request, one a maintainer
asked for. This is the most load-bearing rule here (maintainer, 2026-07-27).
Opening one ready for review is a defect: a ready pull request reads as "the
bot's chain already finished", so cleaner, panel and fixer are skipped and an
unreviewed change lands in the maintainer's queue. Draft is enforced by GitHub
(no requested reviewers, no merge button), which is why it is the signal and
not a label. When in doubt, draft: a needless draft costs nothing.

**Only the end of the panel moves a pull request out of draft**: when the
loop ends with no in-scope must-fix and the appellate pass is done. A probe
([gap-revealing-build](../gap-revealing-build/SKILL.md)) is opened draft like
everything else and is meant to stay draft.

If a pull request was opened ready by mistake, say so in the report; the
first correction is to return it to draft.

## One job, one pull request

A job may run more than once (a host dies, a job is released again, a hand-off
resumes it). Whatever opens the pull request must find an existing one before
creating one, two ways: by the head branch, and by a marker
`<!-- garden-job: <id> -->` in the body. Exactly one found: adopt it. None:
open one, draft. More than one: stop and list them for a maintainer; never
pick one and carry on, because the other keeps burning CI. A lookup that
failed or may have been cut short is inconclusive: create nothing. A retry is
cheap; a duplicate pull request is not.

The prior garden learned this when one job, claimed four times, opened
`endojs/endo-but-for-bots#865` and `#871` for one change; the two diverged,
one went red on every leg and drew shepherd jobs, and it was closed by hand.
The marker is what relates two runs that share nothing else.

## Designs and implementations are separate pull requests

Maintainer, 2026-05-14: "We don't carry designs onto the master branch. The
designs should be based on llm. The implementations should be based on master,
for those designs."

- A **design** pull request goes to the project's roadmap branch on the bot's
  fork (today `llm` on `endojs/endo-but-for-bots`); its diff is
  `designs/<slug>.md`; it runs the design-only variant.
- An **implementation** pull request goes to the project's natural base
  (today `master`), from a separate build job, and runs the whole chain.
- Carrying one upstream later is a maintainer's call
  ([pr-handoff](../pr-handoff/SKILL.md)).

Combining them makes the maintainer review prose beside source, dilutes each
panel, and stops the implementation traveling alone.

Pull requests on a fork use a **frozen base**, `<base>-<short sha>`, so
concurrent pull requests do not see each other's rebases
([frozen-base-branch](../frozen-base-branch/SKILL.md)).

## Where the assayer goes

By default **in concert with the build**: production change and tests on one
branch, in commits touching disjoint files. Two other orders when the change
calls for them:

- **Before** (test first): tests that fail against current code, then the
  change. Fits a contract fully specified in the issue or design.
- **After** (regression coverage): the change first, then tests pinning what
  it fixes. Fits a bug fix whose contract is the bug report. Weaker: the test
  is written against code that already passes
  ([regression-evidence](../regression-evidence/SKILL.md)).

## Where the cleaner goes

Between build-and-assayer and the panel, so the panel reads the final shape.
It widens coverage on the touched packages
([coverage-driven-testing](../coverage-driven-testing/SKILL.md)), commits on
the same branch, and sees CI green (or only documented, pre-existing red). It
does not leave draft, and it is not a reviewer. If the pull request conflicts
with its base, it commits nothing and says a rebase is owed
([conflict-resolution](../conflict-resolution/SKILL.md)).

## The next stage owed

Read the pull request's state, not anyone's account of it, top to bottom; the
first match is the stage owed. The steward reads it to post the next job; a
job given the state under `inputs/` uses it for its `next:` line.

1. **Conflicting with its base?** A rebase is owed first. Read again after.
2. **Already out of draft?** Done: it is in the maintainer's queue.
3. **Panel passed, nothing pushed since, still draft?** The move to ready
   was missed: owed now, and note the lapse.
4. **Panel verdict has must-fix and no fixer commit since?** A fixer.
5. **Fixer committed since the last verdict, panel not run since?** The
   panel again.
6. **Cleaner committed, CI green, no panel verdict yet?** The panel.
7. **Built, open, no cleaner yet?** The cleaner (or, by variant, straight to
   the panel or the design panel).

A panel verdict is a formal review in the panel's shape (in scope and out,
must-fix and should-fix). A plain comment is not one and advances nothing.

## The chain is the point

A draft that nobody advances is the failure this skill exists for: the
garden opens drafts it never finishes, and the work never closes. Every stage
ends with `next:`. If the state matches none of the cases above, that is a
missing case: say so in the report rather than guess.

No maintainer go-ahead is needed to advance a garden-authored draft through
its own chain. One is needed for carrying work upstream, replying on review
threads, and posting top-level comments.

## State on the pull request

- **Draft or ready** is load-bearing. Labels, if any, are for dashboards; no
  decision is made from a label.
- **A terminal exception is visible on the pull request.** When the review
  budget runs out or the chain halts, one comment says the rounds run, the
  head, CI, the unaddressed must-fix count, and the maintainer's next decision
  (or why it halted). More rounds are a maintainer's go-ahead.

## Pitfalls

- **A second pull request for one job.** See "One job, one pull request".
- **A stage other than the panel's end leaving draft.**
- **The loop spinning on out-of-scope findings.** The loop ends at "no
  in-scope must-fix", not "every complaint addressed".
- **The cleaner committing onto a conflicting head.**
- **A push rewinding someone's newer commits.** A stage may start long after
  another pushed fixes; a plain force-push from a stale tree discards them
  (`endojs/endo-but-for-bots#792`: a green head rewound, CI red, the arc
  stalled until restored by hand). Never force a pull request's head. The
  steward pushes with a lease on the head it recorded when the job began, so
  a push that raced anything fails instead.
- **A maintainer's `CHANGES_REQUESTED` does not return a pull request to
  draft.**

## Report

A job in this chain names the pull request, its stage, what it committed and
how it verified it, and `next:` the stage owed. At the end: the panel kind,
the number of fixer rounds, and that it left draft.

Not built yet: the steward's publishing (pushing a job's branch, opening the
draft by find-or-create with the marker, marking it ready) and the drive that
posts each next stage ([designs/pull-requests.md](../../designs/pull-requests.md)).

Adapted from the prior garden's `skills/pr-creation-flow`.
