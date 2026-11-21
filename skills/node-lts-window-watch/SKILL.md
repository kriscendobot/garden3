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

Purpose: keep a project's Node.js version pins (the runtime it ships and the
versions its CI tests against) aligned with Node's supported LTS window, in one
small pull request, and surface loudly when the project cannot move.

Pin surfaces drift apart silently. One project shipped a literal `v20.18.1`
to every user from a download script while its CI workflow carried three
version matrices and four single pins, each with a different opinion about
which majors were supported. Done by hand, this work only happens after
something breaks. As a skill it is planned, and the same inputs always give
the same plan.

## The split

- **A sensor** reads the window on a cadence and plans the edits. On no
  motion it does nothing. On a plan it posts a job, with the plan as its
  body. It is a steward-side service (§ Not built yet).
- **The job** (yours) applies the plan in the project's checkout, commits,
  verifies, and reports. The steward publishes the branch as a draft pull
  request; CI and review follow as for any other.

This specializes the dependency cadence for the Node runtime. It does not
replace a merge-time upgrade embargo or a general major-version scout: its
sensor (Node's release schedule and dist index) is one an npm registry query
does not cover.

## Inputs

You have no network. The window comes to you:

- `JOB.yay`'s body: the plan, and the window it was computed from (today, the
  active LTS major, the maintenance majors, the current major, the latest
  patch of each, and when each source was read).
- `inputs/`: the two upstream documents as the steward fetched them, when it
  provides them: Node's `dist/index.json` (every release, with its `lts`
  field and date) and the `nodejs/Release` `schedule.json` (each major's
  `start`, `lts`, `maintenance` and `end`).
- Your checkout: the pin surfaces are read from its files, never from a cache.

If neither the plan nor the documents are there, you cannot compute the
window. Say so and stop; do not guess Node's schedule from memory.

## The window

From the schedule, on the plan's date:

- **Active LTS**: the largest major with `lts <= today < maintenance`.
- **Maintenance LTS**: majors with an `lts` date and
  `maintenance <= today < end`. Odd majors never get an `lts` date, so they
  are never in the window, even in their maintenance phase.
- **Window**: the active LTS plus the maintenance majors.
- **Current**: the largest major with `start <= today`.
- **Latest patch** of each: the largest version for that major in the dist
  index.

## The posture

The default, per surface:

- **The shipped runtime** (the app bundle): the current active LTS, at its
  latest patch. When a new major becomes active LTS, advance at the start of
  its active window, after the embargo; when the shipped major drops to
  maintenance, advance at once.
- **CI matrices** (the versions tested): every major in the window, plus the
  current major. Drop a major when its end date passes; add one when it
  enters the window.
- **CI single pins** (lint, depcheck, docs, release builds): the shipped
  major, as `<major>.x`.

A project overrides this in `.node-lts-window.json` at its root:

```json
{
  "app-bundle-policy": "active-lts",
  "ci-matrix-policy": "window-plus-current",
  "embargo-days-for-new-lts": 30,
  "frozen-matrices": [
    {"file": ".github/workflows/ci.yml", "anchor": "test-async-hooks"}
  ]
}
```

`app-bundle-policy` is `active-lts` (default), `active-lts-minus-1`, or a
literal major. `ci-matrix-policy` is `window-only`, `window-plus-current`
(default) or `window-plus-next`. `embargo-days-for-new-lts` defaults to 30.
`frozen-matrices` names matrices by the job that holds them.

## Pin surfaces

| Surface | Where | Looks like | How to change it |
| --- | --- | --- | --- |
| Shipped runtime | a download script (`packages/*/scripts/download-node.mjs`) | `process.argv[2] \|\| 'vX.Y.Z'` | swap the whole `vX.Y.Z` |
| Shipped runtime | `**/.nvmrc`, `.node-version` | `22`, `22.11` or `v22.11.0` | keep the file's precision |
| Shipped runtime | `package.json` `engines.node` | a semver range | report only (§ Pitfalls) |
| CI single pin | `.github/workflows/*.yml`, a step's `node-version` | `'22.x'` | the shipped major, `.x` |
| CI matrix | `.github/workflows/*.yml`, `matrix.node-version` | a list of `'<major>.x'` | add and drop majors to match |
| Frozen matrix | as above, with a `# pinned` or `# policy-frozen` comment, or named in `frozen-matrices` | | never touched; listed in the report |

A matrix that deliberately lists a non-LTS version exists for a documented
reason. On `endojs/endo-but-for-bots` the `test-async-hooks` job's matrix is
policy-frozen.

## Procedure

1. **Read the window** from the job (or compute it from `inputs/`, as above).
   Check the plan's date and sources; a plan older than a schedule transition
   is stale.
2. **Inventory** the checkout's pin surfaces from the table. Grep, do not
   assume one project has one pin.
3. **Plan**, per non-frozen surface: the desired value from the window and
   the policy. Emit nothing for a surface already right. Compare the job's
   plan with yours. If they differ, believe the checkout and say why.
4. **Embargo.** Do not advance to a major that has been active LTS for fewer
   than `embargo-days-for-new-lts` days. Its first weeks carry the most risk:
   fresh CVEs in the new V8, and registry caches that are not yet settled.
5. **Apply** in place: a literal swap for a shipped pin, the matching
   precision for `.nvmrc`, an anchored change for a single pin, and for a
   matrix a narrow rewrite that keeps its comments, sorts versions ascending,
   uses the file's own whitespace, and adds no comments. That is the YAML the
   formatter will accept unchanged.
6. **Commit**, all surfaces in one branch so a reviewer sees the policy applied
   consistently: for example `chore: advance Node pin to v22.11.0` and
   `chore: drop Node 20 from CI matrix`.
7. **Verify** what you can offline: run the
   [pre-push gates](../pre-push-gates/SKILL.md) and the project's tests on
   the Node you have, and say which Node that was. If the box does not have
   the new major, say so: CI on the draft is then the first run on it.
8. **Report** (below).

## Report

`outbox/report.md` is also the draft pull request's body:

```
# Node.js LTS window

Window on <date>: active <n>, maintenance <m...>, current <c>.

## Plan
<one line per surface: file:line, current -> desired, why>

## Sources
- https://nodejs.org/dist/index.json (read <time>)
- https://raw.githubusercontent.com/nodejs/Release/main/schedule.json (read <time>)

## Not changed
<frozen matrices with their reason; engines.node ranges; anything else>
```

Cite the sources so a reviewer can check them.

## Impasses

The skill's value over a hand-written upgrade is that it fails loudly when the
project cannot move.

1. **CI on the draft.** A test that fails only on the new major is the
   project saying it is not yet portable. A shepherd's attempt at it becomes
   a cost report: how many places broke, in which packages, with what class
   of error.
2. **The "not changed" list.** A frozen surface or an `engines.node` range
   appears in every run's report. If the same line is still there week after
   week, that is a signal in itself.

The pull request stays a draft until CI is green or a maintainer accepts the
impasse.

## Cadence

| Trigger | Sensor | Job |
| --- | --- | --- |
| Weekly (Mondays) | plans; posts on a non-empty plan | applies it |
| A maintainer asks | the job is posted by hand (`garden board post`) | the same |
| A schedule transition (active to maintenance, maintenance to end) | caught within a week | the same |
| A security release in the window | the next run plans a patch bump | the same |
| A new active LTS | held for the embargo, then planned | the same |

Weekly, because Node's schedule moves in discrete steps and an upgrade pull
request costs review. A daily run would report no motion six days in seven.

## Pitfalls

- **Do not bump `engines.node` blindly.** The range is the project's stated
  intent, not a pin. Report it; advancing its floor is the project's decision.
- **Do not edit a frozen matrix.**
- **Do not propose a major younger than the embargo.**
- **One project, one pull request.** The download script and the CI matrices
  move together.
- **The formatter after the apply.** Write matrix YAML the formatter leaves
  alone, or the gate rewrites your edit.

## Not covered yet

Docker base images (`FROM node:<major>`), advancing an `engines.node` floor,
consistency of per-package `engines.node`, Renovate or Dependabot settings for
Node itself, download caches of another shape. Each is a new row in the
surface table when a project needs it.

## Not built yet

The sensor. It wants a steward-side module in `src/` (a
`makeNodeLtsWatch(powers)`) that fetches Node's `dist/index.json` and
`schedule.json` on the weekly cadence, computes the window and each watched
project's plan from its bare repository, and posts a job with the plan as its
body and the two documents in its `inputs/`. It remembers which window
transition it already posted, on the board, so a week with no motion posts
nothing.

Adapted from the prior garden's `skills/node-lts-window-watch`.
