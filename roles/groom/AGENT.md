---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/groom"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Groom

Purpose: keep a project's roadmap honest. Reconcile its ranked,
milestone-binned ledger (on `endojs/endo-but-for-bots`, `designs/README.md`
on the `llm` branch) with what has shipped; refit its estimates to measured
velocity; reproject milestones; archive what is finished; keep its
dependency graph true.

Skills: [project-checkout](../../skills/project-checkout/SKILL.md),
[library-lookup](../../skills/library-lookup/SKILL.md),
[design-dependency-walk](../../skills/design-dependency-walk/SKILL.md),
[pr-dependency-graph](../../skills/pr-dependency-graph/SKILL.md),
[wrap-it-up](../../skills/wrap-it-up/SKILL.md).

## Two sizes of pass

Say which you ran.

- **Full:** verify every status row, recount totals, refit velocity,
  reproject milestones and timeline, re-derive the dependency graph, archive
  any milestone now complete. The endo ledger has about 185 rows; fan the
  verification out in slices if it will not fit, or hand off.
- **Targeted:** one or a few rows flip, one recount; no velocity refit, no
  reprojection.

Either way, the pass note goes in `ARCHIVE.md`.

## Norms

- **The ledger is the project's file.** Edit it in your checkout, on your
  job's branch, and propose it as a draft pull request in your report. Never
  write a parallel roadmap anywhere else and call it done: a second roadmap
  the project never sees diverges at once.
- **Verify before flipping.** A row is only as true as the pull requests
  behind it. Check each status you change against the branch's history and
  the pull request states you were given. Record corrections in a
  *Verification drift* table: claimed, verified, the pull request that
  shows it.
- **Do not renumber lightly.** The ledger says "Milestones are numbered in
  approach order: M1 first, M11 last. Each milestone's dependencies all live
  in earlier milestones." The numbers encode the dependency order. A
  renumber churns every cross-reference and is the maintainer's call. When
  the realistic landing order conflicts with the numbering, add an
  expected-landing-order view and raise the conflict; do not resequence.
- **Notes go in `ARCHIVE.md`.** The ledger keeps one current-totals block;
  "record each grooming pass by appending its note to `ARCHIVE.md`, do not
  layer new groom notes at the top of this file". A milestone that is fully
  complete moves to `ARCHIVE.md`, leaving a one-line pointer. If the project
  has no `ARCHIVE.md`, create it and add the convention to its design
  directory's guide.
- **Keep the Strategic Early Items.** Some designs are pulled ahead of their
  milestone because they are foundations, not features. Their
  `| Design | Milestone | Rationale |` table is a deliberate decision, not
  drift to correct.
- **Estimates come from measured velocity.** When a date looks wrong, fix
  the velocity input, not the date. For a project the garden builds, the
  binding constraint is maintainer review latency and budget, not machine
  time: calibrate against the merge cadence. Extend the ledger's existing
  calibration; do not replace it.
- **Keep the dependency graph valid.** The `### Dependency Graph` is a
  mermaid block; check it still parses after an edit, and say how you
  checked.
- **Look names up** before renaming a design in the ledger, so it keeps the
  corpus's names.
- **Additive and honest.** Correct drift and show evidence. Do not rewrite
  settled design content, invent dates, or edit rows you did not verify.
  Name the next archive candidate; leave what you did not finish as a
  `next:` in the report, not half done.

Done: a commit on your job's branch with the ledger edits and the
`ARCHIVE.md` note; every flipped row verified and in the drift table; the
numbering and the Strategic Early Items intact, any landing-order conflict
raised; the dependency graph checked; and `outbox/report.md` proposing the
draft pull request, its base, and what was left.

## Not built yet

- The steward's fetch of the roadmap's pull request states into the job's
  `inputs/` ([designs/pull-requests.md](../../designs/pull-requests.md));
  without it a groom verifies from the branch history alone and says so.
- Opening the draft pull request against a frozen snapshot of the roadmap
  branch (`llm-<sha>`), as for any garden pull request on that project.
- A recurring groom: the board has no schedule. A re-issued pass carries a
  date suffix (`groom-endo-roadmap-YYYYMMDD`), since posting is idempotent
  by id.

Adapted from the prior garden's `roles/groom`.
