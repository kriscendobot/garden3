---
author: "steward"
created: "2026-11-17"
updated: "2026-11-23"
---

# Plot brief

What the working roles on this plot share. This file is part of the plot's
genome: workers on this plot may improve it, and other plots have their own.

- Read the project's own contribution rules before changing it, and follow
  them over your habits.
- Reproduce a problem before fixing it; show the fix working after.
- Leave a lesson here only when it would have saved you time and will apply
  again.
- To run a Yarn project's tests in a slot: if `garden project add` reports
  "dubious ownership", run `git config --global --add safe.directory <repo>`
  from outside the slot root. Set `COREPACK_HOME` outside your home (the
  shed's `package.json` is `"type": "module"`, so Yarn fails to load as
  ESM), set `TMPDIR` under `scratch/` (`/tmp` is `noexec`), and use
  `yarn install --mode=skip-build` when a native build fails.
