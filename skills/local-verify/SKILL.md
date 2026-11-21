---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/local-verify"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Local verify

Purpose: before your work leaves the slot, run in your checkout every lint
and test the project's CI runs, under the runtime CI uses, so that a silent
local run means a green CI run.

- **Parity is the contract.** List the checks from `.github/workflows/` and
  the `package.json` scripts they call: all of them. A local pass and a CI
  failure (or the reverse) is a coverage gap or an environment divergence;
  write it in your report as a `parity gap:` line. Each failed check in
  `inputs/checks.yay` should fail locally before your fix and pass after.
- **Same runtime.** Match the Node major the project pins (`.node-version`,
  `.nvmrc`, Volta, `engines`) and the Moddable `xst` it pins; never a bare
  host `xst`. Run with `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null`.
  If the right runtime is not in the box, say "not verified".
- **Order:** format, build, lint, zizmor, package-uniformity, root-types,
  codegen (a real generator), test (each workspace), test-xs, docs; then
  `git status --porcelain` must be clean, or commit the regeneration. Run all,
  even after a failure.
- **Logs go to `scratch/verify/`**; read slices, never whole logs. Identical
  failures from different checks are one environment fault: fix it and rerun.
- Lockfile changes in their own commit; decide whether a changeset is owed.

Report what ran, what passed, what you skipped and why, and the runtime used.

## Not built yet

A `makeVerify(powers)` harness in `src/` that runs these checks in a job's
checkout, and pinned Node and `xst` in the box.

Adapted from the prior garden's `skills/local-verify`, with
`skills/pre-pr-checklist` folded in (its pull request template part went to
`skills/pr-formation`).
