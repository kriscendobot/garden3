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

## Lessons

- If `garden project add` fails with "dubious ownership", write
  `[safe]\n\tdirectory = *` into your home's `~/.gitconfig` and retry.
- endo-but-for-bots: corepack's yarn may fail as ESM; copy the cached
  `yarn.js` to a `.cjs` file and run it with node. Without `node_modules/.bin`,
  run ava, prettier and changesets as `node <package path>/<bin>`.
