---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/panel-review"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Panel review

Purpose: review a change from many narrow perspectives at once, and turn
what they find into one review in which every finding has a source and a
disposition, so the maintainer sees how each point will be handled.

A panel is a set of **seats**, each a perspective with its own brief. This
skill is the substance of a panel round: the block each seat returns, the
rule every finding must cite or propose, how findings are bucketed and
disposed, and the shape of the review that results. It extends the
[reviewer](../../roles/reviewer/AGENT.md) role; the reviewer's norms hold.

## When to use

- The job asks for a panel review of a pull request or a branch.
- A maintainer asks for a review of a stale pull request. Same procedure,
  often with fewer seats.

## Seats

The prior garden ran two default panels. Their seat briefs are under
`reference/upstream/garden/roles/jurors/<seat>/AGENT.md`; read the ones your
job names.

- **Code panel**, for a change that touches source: assessor, typist,
  stylist, packager, archivist, prover, curator, migrator, locksmith, warden,
  saboteur, breaker, purist, spec-keeper, wire-watcher, engine-realist,
  integrator, duality-auditor, benchmarker, changeset-auditor, surfacer,
  scribe, pruner, gateway, corner-prober, fast-checker, releaser,
  transplanter, coverage-auditor, orthographer, thesaurus.
- **Design panel**, for a change to documents only: critic, skeptic,
  decomplector, ergonomist, copyeditor, pedant, novice. The orthographer and
  the thesaurus sit here too.
- **A smaller panel** of three to six seats is fine for a small change, and
  a maintainer may name a custom one (for example, the novice on a code
  panel when a JSDoc rewrite wants a new reader's eye). The aggregation below
  is the same whatever the size.
- **Cheap seats first.** Some seats have a mechanical check that says
  whether there is anything for them: the coverage-auditor (new lines with no
  coverage), the orthographer (British spellings introduced), the thesaurus
  (stock phrases introduced). Run the check; spend the seat only if it finds
  something.
- **Evidence restores a seat.** If you trimmed the panel but the diff adds a
  code-comment banner, seat the archivist anyway.

Which panel: by the diff's paths. Documents only is the design panel;
anything else is the code panel.

## A seat's block

Each seat returns this, and nothing before it. Do not re-title it: the
aggregate already heads it with the seat's name.

```
**Verdict:** approve / request-changes / comment-only

**Findings:**
- (concrete and actionable, file:line where it applies) [rule: <path>] OR [proposed-rule: <one sentence>]

**Notes (out of scope but worth flagging):**
- ... [rule: <path>] OR [proposed-rule: ...]
```

- Under about 400 words.
- "comment-only" is for taste. Anything that warrants a code change is
  "request-changes".
- A seat may call a nit "request-changes"; the aggregator grades severity
  itself (below).
- Read-only. A seat changes nothing in the checkout.

## Cite or propose

Every finding either cites a standing rule or proposes one. Many recurring
maintainer complaints map to rules already written down, but seats do not
reliably read them; this makes them.

- **`[rule: <path>]`**: the standing rule the finding enforces, by the file
  that documents it: a skill or role in your home, or a section of the
  project's `CLAUDE.md`, `AGENTS.md` or `CONTRIBUTING.md`. The citation goes
  into the review beside the finding.
- **`[proposed-rule: …]`**: no rule exists yet. Propose it in one sentence.
  List every proposed rule in your report under `## Proposed rules`. If it
  belongs to your own plot's roles or skills, you may write it there; that
  survives you. Otherwise a maintainer decides.
- A finding with **neither** is dropped at aggregation, with the reason "no
  rule cited and no rule proposed; it cannot be acted on systematically".

Before writing findings, a seat reads its brief's own lessons and the
project's rules that touch its surface.

The citation and the disposition are independent: a finding can be
`[rule: …]` and `must-fix-loop`, or `[proposed-rule]` and `acknowledge`. One
says where it comes from; the other says what happens to it.

## Aggregation

Group findings into three buckets, then give each a disposition.

- **Must fix before merge**: a "request-changes" finding in a real-defect
  class: wrong behavior, a security or authority error, data loss, a broken
  contract, failing or missing tests for changed behavior, or a comment
  false enough to invite an unsafe change. Default: `must-fix-loop`.
- **Should fix in this change**: nit-class findings, and taste or clarity
  points raised by at least two seats independently. Default: `summary-fix`.
  Nit-class means: comment or JSDoc wording that does not change behavior,
  identifier spelling or style renames, commit-history tidiness, pull
  request description completeness, test-style preferences. These never
  block, whatever the seat called them.
- **Out of scope**: useful, not for this round. Default: `follow-up`.

Merge duplicates. Seats overlap on purpose; two seats flagging the same
thing is the signal to promote it to should-fix. Where seats disagree, show
both views, pick the side more consistent with the project's own rules, and
say that you did.

## Dispositions

| Disposition | Means | Where the work goes |
| --- | --- | --- |
| `must-fix-loop` | Blocks. A fixer works until none remain. | A fixer job on the same branch. |
| `summary-fix` | Small; no new panel needed; does not block. | All of them together, in one fixer pass. |
| `follow-up` | Useful, out of scope. | The follow-up list in the report, revisited at merge. |
| `acknowledge` | A real observation; no work warranted. | The review body records why. |
| `drop` | Wrong on a second read, or a disagreement settled for the change as it is. | A one-line reason in the report, so the panel's work is not lost silently. |

### The rubric, in order

1. **Start from the bucket's default.**
2. **Demote on weak signal.** A `summary-fix` from one seat, comment-only,
   with no concrete change, becomes `acknowledge`. So does a one-seat
   `follow-up` that is only informational.
3. **Demote on contradiction.** A finding the panel disagrees on, where the
   side against the change has the stronger reason by the project's
   conventions, becomes `drop`, with a line saying why.
4. **Drop what fails a second read.** A `must-fix-loop` that fails a
   thirty-second sanity check (see Pitfalls: "shadowing") becomes `drop`.
5. **Bundle the summary-fixes** into one fixer pass.
6. **Keep follow-ups per pull request**, across rounds, not per round.

The rubric is conservative: a finding nobody judged keeps its bucket's
default.

### A change by someone else

When the pull request's author is not the garden (its author is not the
garden's bot login, `kriscendobot`):

1. **The garden's own prose conventions are dropped**: em-dash style, no
   Latin shorthand, American spelling, stock-phrase ("Botese") rewrites.
   They apply to what the garden writes. The reason: "garden convention; not
   in scope on an external author's change". The orthographer and thesaurus
   still run and report, so the record shows what was seen; the drop happens
   here. External authors follow the project's own rules.
2. **Proposed rules are for the garden**, not asks of the author. They go in
   your report's `## Proposed rules`, not in the review.
3. **Everything else applies as usual**: correctness, security, public API,
   test coverage.

Lesson: a design panel once tagged 120 em-dashes as `summary-fix` on an
outside contributor's design pull request (`endojs/endo-but-for-bots#467`);
the maintainer dropped the sweep, and this calibration followed.

## Follow-ups

A follow-up filed before merge is premature: the maintainer may close the
pull request, reshape it, or fix the point directly. Merge is when it
matters. The maintainer's words: "arrange for the follow-up to be revisited
automatically when the PR is merged or its mirror is merged upstream."

Write the round's follow-ups into the report under `## Follow-ups`, one
entry each:

```
- [ ] <the finding>
  Seats: <seat>[, <seat>...]
  Round: <N>
  When merged: <file an issue on <repo> | open a follow-up change with <scope> | amend <design path>>
```

Not built yet: a follow-up ledger per pull request that the steward keeps
and, when the pull request (or its upstream mirror) merges, turns into a
posted job.

## The review

Write the review into `outbox/report.md` (or the outbox file your job
names). You post nothing; the steward does.

- **The verdict follows the dispositions**, not the raw buckets: any
  `must-fix-loop` is request-changes; otherwise any `summary-fix`,
  `follow-up` or `acknowledge` is a comment; only a clean or wholly dropped
  panel approves. State it on the first line.
- **Group by perspective** where seats agreed; do not list seat names
  beyond the perspective heading.
- **Each finding carries its disposition first and its rule last:**

```
- **[must-fix-loop]** `packages/foo/src/bar.js:42`: `harden(x)` missing on the returned object. [rule: <project>/CLAUDE.md § harden on exports]
- **[summary-fix]** `packages/foo/src/bar.js:18`: JSDoc parameter type drift (`string` should be `string | undefined`). [rule: ...]
- **[follow-up]** Adjacent refactor in `packages/baz/src/quux.js`; worth doing after merge. [rule: ...]
- **[acknowledge]** `frob` over `frobnicate` is deliberate family consistency per `designs/naming.md`. [rule: ...]
- **[drop]** The shadowing claim on line 31 is wrong; the names are in different scopes. [rule: skills/panel-review/SKILL.md § Pitfalls]
- **[summary-fix]** `packages/random/README.md`: "About this document" pads with no benefit to the reader. [proposed-rule: omit README boilerplate below the reader's needs]
```

- **Two tiers.** The verdict, its round, and the must-fix findings stay
  plain and visible. Each seat's full block goes inside a `<details>`, its
  `<summary>` carrying the seat and its verdict, for example
  `<summary><b>assessor</b>: request-changes</summary>`. GitHub renders
  Markdown inside `<details>` only when a blank line follows `</summary>`.
- **Name what produced each block.** If seats ran as separate agents or at
  different models, say so inside each seat's block, not once for the whole.
- **The review is public prose.** The garden's own prose rules apply to it.
  Sweep it before you finish.

Not built yet: posting the report as a formal GitHub review (request
changes, comment, approve) rather than a comment, so the pull request's
review decision moves. A plain comment does not flip it.

## Before the round

Read the pull request's state from what the job was given (`JOB.yay`,
`inputs/`). If it is closed or merged, or no longer a draft and the job did
not name it for a standalone review, stop and say so: re-reviewing a pull
request already out of draft is out of discipline.

## Pitfalls

- **A failed read-only round can leave residue.** A seat may write a scratch
  reproducer despite its brief. After any failed round, compare the checkout
  with its clean state and remove only what the panel made. Never carry an
  unexplained edit into a fix.
- **A "shadowing" finding may be invented.** Re-read the lines and confirm
  they are in the same lexical scope before promoting it.
- **A package forked from a sibling misses the sibling's recent fixes.** Diff
  the new package against the commits its peer gained since the fork.
- **A design and its whole implementation in one change** asks more of the
  panel: did the design say enough to build, and where did the builder fill
  gaps? Add a section "Out of scope but worth flagging (design feedback)".
- **Self-authored pull requests.** GitHub refuses request-changes from the
  pull request's own author. The verdict then lives in the body: keep a
  heading "Must fix before merge" for anything blocking.

Adapted from the prior garden's `skills/panel-review`.
