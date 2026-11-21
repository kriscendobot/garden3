---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/gap-revealing-build"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Gap-revealing build (a probe)

Purpose: attempt to implement a tentative design in order to find where it
is under-specified. The deliverable is a structured inventory of gaps, not
a feature. The maintainer's verb is "probe #N".

A build makes pragmatic choices and proceeds; it ends in a change meant to
merge. A probe stops at every ambiguity and writes it down; it ends in a
draft pull request whose body is the gap report, which stays a draft while
the design is revised.

## When to use

- The job says probe: "probe #N", "probe the design at #N", "attempt #N to
  reveal gaps". Do not infer a probe from a design-shaped target; the job
  must say so.
- The design is tentative, and the maintainer wants to know whether it holds
  up against code before committing to an implementation.
- A maintainer choosing between two designs may post one probe for each and
  read the two reports side by side.

A build job must not slip into a probe because the design feels thin. Say
in your report where it was too thin and let the maintainer re-issue it as a
probe; switching mid-job destroys the signal of which deliverable they were
getting.

## Before you start

- The design must be in your checkout: check out the design pull request's
  head (the probe stacks on it), or the branch the design lives on
  ([project-checkout](../project-checkout/SKILL.md)).
- The job names the base. By default it is the design pull request's head.
- A gap list in the job's body is part of the deliverable: it becomes gaps
  1, 2, ... of the report.

## Procedure

1. **Read the whole design**, and what it references that you can reach.
   Every "TBD", "future", "open question", "for further consideration", or
   other deferral is a candidate gap. So is an acceptance criterion with no
   mechanism named to meet it.
2. **Stop at every ambiguity.** This is what makes it a probe. An ambiguity
   is anywhere the code cannot be written without a load-bearing choice the
   design does not make:
   - "the proxy decides X", but not how;
   - values for a field, but not where they are validated;
   - a policy, but not what happens when it rejects;
   - coexistence with a sibling mechanism, but not the order;
   - two sentences implying contradictory shapes.

   Do not pick one reading and go on. Write the gap, then either skip that
   path (leave `// gap: see pull request § Gap N` and continue with what is
   clear) or stop there if nothing downstream can be written without it.
   Resolving it is the design author's work.
3. **Write each gap in this shape**, numbered as you meet them:

   ```
   ### Gap N: <one-line summary>

   **Where in the design.** <file and lines, or section, or both>.

   **Verbatim quote.** > <the design's own words, exactly>.

   **What's needed to implement.** <one or two sentences: the fact the
   design does not give>.

   **Candidate resolutions.**
   - **A.** <one sentence>. Trade-off: <one sentence>.
   - **B.** <one sentence>. Trade-off: <one sentence>.

   **Maintainer's call:** design revision | implementation-time choice | needs broader review.
   ```

   The quote lets the author find the sentence; what's needed gives them a
   question to re-read with; the candidates spare them inventing options;
   the call says whether it blocks the design or only the implementation.
   Two or three candidates is the target. One is fine when the design rules
   out others. Four or more means it is two gaps: split it.
4. **Build the skeleton where the design is clear**: interfaces, typed
   signatures, wired imports, package layout, command shapes. Showing the
   clear parts compose is the second most valuable signal: "this part
   holds; only the gaps need revision". It is real code: the project's
   commit conventions and checks apply. A gap the job told you to attempt
   past gets a stub and a `// gap:` comment; otherwise stop, as in step 2.
5. **Commit** in groups that make sense (one per affected package), and a
   lockfile change in a commit of its own if dependencies changed.
6. **Write the pull request** in `outbox/pull-request.md`. Title, in the
   project's commit form:

   ```
   <type>(<scope>): <summary> (gap-revealing prototype of #<design pull request>)
   ```

   The body's first line links the design. Then four sections, in order,
   each present even if empty ("None."):

   ```markdown
   ## Gaps surfaced
   <the numbered gaps>

   ## Skeleton implemented
   <what compiled, passed, type-checked: package by package, with commits>

   ## Skeleton not implemented
   <what stopped at an ambiguity, each with the gap that stopped it>

   ## Recommendations to design author
   <which gaps the design must resolve first, and which can be chosen at
   implementation time once authorized; group by "Maintainer's call">
   ```

7. **It stays a draft.** No review panel, no clean-up, no un-draft. It is a
   discussion artifact. The maintainer reads it, revises the design, then
   posts a build or closes the probe as superseded.

## Notes

- Do not write regression tests against the skeleton: it pins a contract the
  design has not settled. Smoke tests at most (it imports, it constructs),
  and name the testing strategy as a later concern.
- Zero gaps is a finding: the design held up against code. Say so plainly.
- A second probe after revision is a new job and a new pull request, not a
  round on the old one.

Done: the skeleton is committed, `outbox/pull-request.md` has the title and
four sections, and `outbox/report.md` gives the commit, the number of gaps
(one line each), and how much of the skeleton was and was not built.

Not built yet: the steward opening `outbox/pull-request.md` as a draft pull
request on the named base.

Adapted from the prior garden's `skills/gap-revealing-build`.
