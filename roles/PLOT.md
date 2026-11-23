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
- endojs/endo setup in a slot: if `garden project add` hits git's "dubious
  ownership", add that one repository to `safe.directory`. Run yarn with
  `COREPACK_HOME=/tmp/...`, because the slot's own `package.json` makes the
  cached yarn load as ESM and crash. After install there is no
  `node_modules/.bin`, so call `node <pkg>/node_modules/ava/entrypoints/cli.js`
  (and the same for eslint and tsc), or put small wrappers on `PATH`. Set the
  commit identity in the checkout to `garden <garden@garden.invalid>`.
