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

## The invariant

The maintainer's standing policy (2026-07-20): a lint or test failure in CI
is a failure of our automation to anticipate it. Every check CI runs is run
locally first. A red CI check is a defect to close, not only a pull request
to fix. Running the checks is not an optimisation; it is the rule. The
saving (a short or empty shepherd round, CI logs kept out of a worker's
context) follows from it.

## Parity is the contract

Enumerate the checks from the project's actual CI: its workflow files under
`.github/workflows/` and the `package.json` scripts they call. Not a sample,
all of them.

A change that passes locally and fails CI is one of two defects:

1. **A coverage gap:** a check CI runs that you did not.
2. **An environment divergence:** the same check behaved differently here (a
   missing tool, another version, a path the slot blocks).

When your job has CI results (`inputs/checks.yay`, and the failed checks'
tails in `inputs/logs/<check>.log`), use them: each failed check should fail
in your local run before your fix and pass after it. One that will not
reproduce locally is a gap or a divergence, not a reason to guess.

The reverse, failing here and passing in CI, is the same defect. A gate that
rejects work CI would accept sends a worker after a phantom.

The fix is always two parts: green the pull request, and close the gap so it
cannot recur. In a slot you can only do the first; write the second as a
`parity gap:` line in your report (what CI ran that you did not, or what
differed, and how you know), so a maintainer can close it.

## Runtime parity

**Node.** A project pins the Node its CI runs, in `.node-version`, `.nvmrc`,
`package.json#volta.node`, or a single-major `engines.node` (an open range
like `>=22` is not a pin). `actions/setup-node` resolves `lts/*` to the newest
LTS major (24 at the time of writing). Type-aware lint, module resolution and
syntax all move between majors, so a check can pass under the wrong Node and
fail in CI (endojs/endo-but-for-bots#1048: green on Node 22, red on CI's
24). Compare `node --version` with the pin. If they differ and no matching
Node is in the box, do not call the run green: report
`not verified: CI runs Node <n>, the slot has <m>`.

**XS.** A `test:xs` suite runs only under the Moddable release the project
pins (`.moddable-version`, or a single `MODDABLE_VERSION` in the workflows).
Never use whatever `xst` is on the path: endo CI pins Moddable 5.0.0 (XS
15.5.1), and a newer XS produced a false hardened262 baseline change. CI
checks out submodules; if the suite needs an uninitialised gitlink, or the
pinned `xst` is not in the box, the XS suite cannot run here: say so. Some XS
suites build another engine with Cargo, so they need a Rust toolchain too.

**Git configuration.** CI has none. Run checks with
`GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null`, so only the
repository's own configuration applies. An inherited `rerere.enabled=true`
made a conflict-rebase test pass on CI and fail locally; `diff.algorithm`,
`merge.conflictStyle`, `rebase.autostash`, `core.autocrlf` and
`url.<base>.insteadOf` do the same kind of damage.

## The checks, in order

```
format, build, lint, zizmor, package-uniformity, root-types, codegen, test, test-xs, docs
```

then a clean-tree check. Run them all, even after one fails, so the report
lists every failure. Err toward the full suite: a wasted check is fine, a
regression that reaches CI is not.

For each, use the first that applies: the command the workflow runs, a
`package.json` script from the table, or skip it and say so.

| Check   | `package.json` script candidates (check variants first) |
| ------- | ------------------------------------------------------- |
| format  | `format:check`, `check:format`, `format-check`, `format` |
| build   | `build`, `compile`, `build:js` |
| lint    | `lint:check`, `lint`, `eslint` |
| codegen | `gen:code-mode-types`, `codegen`, `gen`, `generate`, `build:types:gen`, `build:types` |
| test    | `test`, `test:unit` |
| test-xs | `test:xs` |
| docs    | `docs`, `build:types`, `generate-docs` |

Why each is where it is:

- **build before lint**, as CI orders them. A typed linter on an unbuilt tree
  reports `Parsing error: <file> was not found by the project service` for
  files the build brings in: a failure for an ordering reason. Its tell is a
  lint failure naming files your diff does not touch.
- **codegen must mutate.** Run the project's real generator, not a compile or
  a check: on endojs/endo-but-for-bots `build:types` is `tsc --build`, while
  `build:types:gen` regenerates the composite tsconfigs. A check in this slot
  makes the clean-tree check vacuous; a missed regen once turned CI's
  `build:types:check` red after a new workspace dependency.
- **The clean-tree check**, after everything: if `git status --porcelain`
  shows changes, a generator rewrote a checked-in artefact, which was stale.
  Commit the regeneration (endojs/endo-but-for-bots#714: a rebase staled
  `packages/agentry/src/execute/{git,fs}-types.js` and every CI test job went
  red after approval). A mutating `format` trips it too, which is right:
  commit the formatting.
- **zizmor**, when `.github/workflows/zizmor.yml` exists: run
  `zizmor [--persona <p>] [--min-severity <s>] .` with the `persona` and
  `min-severity` from the `zizmorcore/zizmor-action` step's `with:` block, and
  the tool's defaults where they are absent. If they are not plain values,
  you cannot claim parity; say so. Run it every time, not only when a
  workflow changed: `stale-action-refs` resolves tags over the network and can
  turn red with no change in the diff (endojs/endo-but-for-bots#778). In a
  slot without network that audit cannot run; say so.
- **package-uniformity**, the check CI's lint job runs outside `yarn lint`:
  `yarn test:package-uniformity && node scripts/check-package-uniformity.mjs`.
  The second half scans the real tree and no script wraps it; the self-test
  alone would not have caught a tracked `src/types.d.ts` that broke the naming
  rule (endojs/endo-but-for-bots#1015). Prefer a single script that wraps
  both if the project has one (`lint:package-uniformity`,
  `check:package-uniformity`, `package-uniformity`, `lint:packages`).
- **root-types**, the other check outside `yarn lint`:
  `NODE_OPTIONS=--max-old-space-size=8192 corepack yarn tsc -p tsconfig.json --noEmit`,
  when the root `tsconfig.json` checks JavaScript (`checkJs: true`, read from
  `tsc -p tsconfig.json --showConfig` so `extends` is honoured). A package
  with `checkJs: false` never type-checks its `.js` tests under its own
  `tsc`, so an ill-typed test passes there and fails CI's root program
  (endojs/endo-but-for-bots#1125). The whole-repo program runs out of memory
  at Node's default heap; that is not a type error.
- **test, per workspace.** In a Yarn workspace tree, do not trust a root
  `workspaces foreach` that stops at the first failure: run each workspace's
  `test` (or `test:unit`), and its `test:xs`, and keep going after a failure.
  On npm, pnpm or Bun, use the project's own root aggregator.
- **test-xs is in addition to test**, not another name for it: CI's `test-xs`
  job caught a hardened262 baseline drift the ordinary tests do not exercise
  (endojs/endo-but-for-bots#1077).

**Which package manager:** the root `package.json` `packageManager`, else the
lockfile (`yarn.lock`, `pnpm-lock.yaml`, `package-lock.json`), else Yarn.
`yarn` is often not on the path in a fresh checkout; `npx corepack yarn`
works. A bin call goes through the manager (`corepack yarn tsc`, `npx tsc`).

## Running them

- **Keep failure output out of your context.** Send each check's output to
  `scratch/verify/<check>.log` and read slices (`grep -n -m1 -i error`,
  `tail -40`, `grep -n -B2 -A5 'FAIL\|Error'`). Do not paste a whole log into
  your context or your report.
- **Bound every check.** `timeout 7200` on each, and stop one that has
  printed nothing for twenty minutes. A hung check is an environment fault
  with no verdict on your change; say what it was waiting on.
- **Identical failures from different checks are one environment fault**, not
  several defects. Independent checks do not fail in unison over a real
  change. When the tails match, especially a usage error from the package
  runner rather than an assertion, the checks never ran. Fix the environment
  and rerun before you touch code. (Two checks that resolve to the same script,
  `codegen` and `docs` both on `build:types`, failing twice is one honest
  failure.)

## Environment faults seen before

Each with its tell:

- **`permission denied: <bin>`** (`ava`, `tsc`): `/tmp` mounted `noexec`,
  and Yarn 4 writes a temporary exec shim for every bin call. Point `TMPDIR`
  at an exec-capable directory under `scratch/`.
- **`The project ... doesn't seem to have been installed`**, on every check:
  the package manager's install state (`.yarn/install-state.gz`) is missing.
  Run the manager's install against the existing store.
- **A tool shim on the path that names another checkout** lints or tests a
  tree that is not yours, silently. Run tools through the package manager
  from your checkout.
- **`ENOENT .../endo.sock`** in tests that bind a Unix socket under the
  checkout: the path exceeds the 108-byte `sun_path` limit. CI moves its
  checkout to a short path for this reason. Report it; do not weaken the test.
- **A native module built for another Node ABI** (`NODE_MODULE_VERSION <m>`,
  `better-sqlite3`): rebuild it in your checkout (`yarn rebuild <package>`).

## The minimum, by hand

For a small change, and for each change before the full run:

- the formatter (Prettier drift is the most common review nit);
- lint for the packages you changed;
- the type build (`yarn docs`, `tsc --build`), which catches missing members
  on exported interfaces and broken type imports;
- the tests nearest the change (`cd packages/<name> && npx ava`);
- whether a changeset is owed ([changeset-discipline](../changeset-discipline/SKILL.md));
- a dependency change commits its lockfile in a commit of its own.

Pitfalls:

- workspace commands need `npx corepack yarn workspace <name> exec <command>`
  or `npx corepack yarn workspaces foreach -A run lint`;
- an underscore-prefixed unused name clashes with `no-underscore-dangle`;
  delete it, or `// eslint-disable-next-line no-unused-vars`;
- `/** @type {T} */` binds to the next declaration; keep it adjacent when
  refactoring;
- in endo's `packages/daemon`, a change to `src/help.md` needs
  `node packages/daemon/scripts/generate-help-text-data.mjs` and then
  Prettier on `src/help-text-data.js`. The unformatted diff looks far larger
  than it is.

## The report

Say, in `outbox/report.md`: the checks you ran and their results; the ones
you skipped and why; the Node (and `xst`) you ran under; each failure you
fixed; and any `parity gap:`. "Tests pass" means you ran them and saw it.

## Not built yet

- **A harness:** a `makeVerify(powers)` service in `src/` that discovers and
  runs these checks in a job's checkout, silent on success, recording each
  failure's output by content address, flagging identical failures as one
  environment fault, and refusing to run under the wrong Node. The prior
  garden's was `scripts/jobs/gardening/local-verify.sh`.
- **Pinned runtimes in the box:** the Node majors and Moddable `xst` releases
  the watched projects pin, so a slot adopts the right one rather than
  reporting it missing ([designs/image.md](../../designs/image.md)).

Adapted from the prior garden's `skills/local-verify`, with
`skills/pre-pr-checklist` folded in (its pull request template part went to
`skills/pr-formation`).
