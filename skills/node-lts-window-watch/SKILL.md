---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/node-lts-window-watch"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Node LTS window watch

Purpose: move a project's Node pins (the runtime it ships and its CI
versions) with Node's LTS window, in one pull request, and surface loudly when
the project cannot move.

## Norms

- You have no network. The window and the plan come in `JOB.yay` (and the two
  upstream documents in `inputs/` when they are provided). Without them, stop.
  Do not reconstruct Node's schedule from memory.
- The window is the active LTS major plus the maintenance majors. Odd majors
  are never LTS.
- The shipped runtime goes to the active LTS at its latest patch. CI matrixes
  cover the window plus the current major. CI single pins follow the shipped
  major. A project's `.node-lts-window.json` overrides these.
- Find every pin surface: download scripts, `.nvmrc`, workflow `node-version`
  pins and matrixes. Change them together, in one branch.
- Never edit a frozen matrix (one marked `# pinned` or `# policy-frozen`).
  Never rewrite `engines.node`; report it instead. Never advance to a major
  that has been active LTS for less than 30 days.
- The report is the draft's body. It holds the window, one line per surface
  (current -> desired, and why), the source URLs, and what was not changed.

Not built yet: the weekly sensor that computes the plan and posts the job
(a `src/` module run by the steward).

Adapted from the prior garden's `skills/node-lts-window-watch`.
