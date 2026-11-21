---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/panel-hints"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Panel hints

Purpose: from a pull request's diff alone, say which narrow review lenses
("seats") have something to look at. Seat briefs are the prior garden's
jurors, under `reference/upstream/garden/roles/jurors/<seat>/AGENT.md`.

**Bias toward firing.** Any one signal seats a lens; only the absence of every
signal leaves it out. A quiet seat costs one review; a missing one costs a
miss. The set is a default a reviewer may widen; trimming it needs a reason.

## Procedure

Against the pull request's base commit (`JOB.yay`, `pull_request`):
`git diff --name-only <base>...HEAD` for paths, and
`git diff <base>...HEAD -U0 | grep -E '^\+[^+]'` for added lines.

1. **Kind.** Every changed file a design document (`designs/*.md`,
   `DESIGN*.md`, at any depth): the seven-seat design panel, `critic`,
   `skeptic`, `decomplector`, `ergonomist`, `copyeditor`, `pedant`, `novice`.
   Otherwise a code panel. The test is exact.
2. **Code panel, always:** `assessor`, `typist`, `stylist`, `packager`,
   `archivist`, `prover`, `saboteur`, `integrator`, `corner-prober`, and
   (signal outside the diff) `scribe`, `releaser`, `coverage-auditor`.
3. **By path:** `curator` (exports, `index.*`, `*.d.ts`), `surfacer` (two
   surface files in one package, or a new package), `migrator` (dependencies,
   several packages, a changeset), `changeset-auditor`, `benchmarker`,
   `gateway` (root config, workflows, lockfile), `pruner` (over 30 added
   Markdown lines), `fast-checker` (tests), `breaker` (exo and interface
   files, or a sibling family such as `hex`/`base64`).
4. **By added content:** `warden` (harden, globals, `ses`), `locksmith`
   (owner or caller equality, allowlists, capability flow), `purist` (a
   hand-rolled SHA-256, codec or `insist`), `spec-keeper` (`Reflect`, `.call`,
   loose `M.any()` guards), `wire-watcher` (digests, krefs, `syscall.`),
   `engine-realist` (weak references, durability, engine arms),
   `duality-auditor` (encode/decode-shaped names), `procurer` (any JS or TS
   source), `pruner` (a prose comment of three lines or more), `curator` (a
   streaming or sync twin, a path-segment surface), `archivist` (a definite
   claim about a named entity, on a design panel too).
5. **Platform arm** (a `browser`, `xs`, `endor`, ... condition key, file or
   stub `test:<platform>`): `coverage-auditor` must look whatever coverage
   says, since coverage runs on Node.
6. **Cross-panel:** `pedant` and `copyeditor` for over 30 added Markdown lines
   outside `designs/`; `decomplector` for a touched design or a new channel,
   formula type or retention resource.

Signals outside the diff (a related design's open review, the description
against the template, the same must-fix two rounds running) are checked by
hand when the evidence is in `inputs/`, and said to be unchecked when not.

Report the panel kind, each seat with the first match that seated it, and the
suppressed list.

## Not built yet

A `makePanelHints(powers)` service in `src/panelHints.js` that makes this
choice in code, and the steward's fan-out of one review job per seat beside
the pull-request seam in `src/steward.js`.

Adapted from the prior garden's `skills/panel-hints`.
