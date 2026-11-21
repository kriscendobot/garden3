---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/pre-push-gates"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Pre-push gates

Purpose: before you leave a branch for the steward to push to a pull request,
run the deterministic checks a maintainer would otherwise have to ask for.
Fix what fixes itself into the commit you were about to make, and fix the rest
by hand, so the first thing a reviewer sees has none of it.

The prior garden ran these as one script before every push. Here no script
exists yet (§ Not built yet), so you run the stages yourself, in the checkout
`garden project add` gave you, and say in the report what you ran.

## When

- Before the last commit of any job that changes a pull request: a builder's
  first version, a fix-up round, a shepherd's repair, a conductor's retcon.
- A rebase or test-only job runs them when it changed source.
- Not for read-only jobs. They change no tree.

## The stages, in order

Run each once. Record each stage's result. The worst result is the gate's
result. A stage that auto-fixes does not count as a failure unless the fixer
itself fails.

1. **Choose the package runner.** Read the root `package.json`
   `packageManager` (npm, Yarn, pnpm, Bun). Without it, go by the root
   lockfile; with neither, Yarn. npm forwards extra arguments after `--`
   (`npm run lint -- --fix`).
2. **`format`** (auto-fix), if the project has a `format` script. Stage what
   it changed into the commit you are assembling.
3. **Build before lint**: the first of `build`, `compile`, `build:js` that
   exists. A typed linter on an unbuilt tree reports
   `Parsing error: <file> was not found by the project service`, which is an
   ordering failure, not a real one. Do not stage what the build produced. A
   failing build is reported, and lint still runs, so both results show.
4. **`lint --fix`** (auto-fix), if there is a `lint` script. Stage its fixes.
   If the project's lint does not take `--fix`, run its own lint and fix by
   hand.
5. **The probes** (§ Probes), against the change: added lines in
   `<base>...HEAD` once committed, or the staged diff before. Every probe
   runs, so the report lists every finding, not only the first.
6. **The comment advisory** (non-blocking): for each added multi-line prose
   comment, decide whether it states an invariant or rationale the code does
   not show. If it only narrates the adjacent code, delete it.
7. **`typecheck`** (not auto-fixable), if there is a script. A failure here is
   terminal: fix the type error and run the gate again.

The stages do not converge by retrying. If `format` and `lint --fix` fight,
that is a project bug: report it, do not loop.

### Bounds

Run each project-script stage with a wall-clock bound and watch its memory.
A stage that runs out of time or memory (a heap abort, an out-of-memory kill)
is **resource-exhausted**: stop the gate there. Do not retry with a larger heap
or a longer bound: that is how a whole-repository `lint:fix` starves the host.
Narrow the stage (lint only the changed packages or files) or report the bound.
Keep enough of your own clock to write the report
([wrap-it-up](../wrap-it-up/SKILL.md)).

## Probes

Each probe looks only at what the change **adds**, prints a pass or one line
per finding, and has a per-file escape marker for a file that must break the
rule (the marker in the file's first five lines). Until the probes exist as
code, check them by reading the diff and grepping.

- **`no-inline-import-jsdoc`.** No added `import('...')` or `import("...")`
  type inside a JSDoc block in a `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts` or
  `.tsx` file: any tag (`@param`, `@returns`, `@type`, `@typedef`,
  `@satisfies`, `@template`) or a bare `{import('...')}`. Strings and ordinary
  comments do not count. Fix: a top-of-file `@import` tag and a bare type
  name. Marker: `inline-import-exempt`. (Maintainer review on PR #75;
  repeated in `endojs/endo-but-for-bots#721`.)
- **`typedefs-belong-in-dts`.** No changed `**/src/**/*.js` is a types-only
  module: one that declares `@typedef` or `@callback` and, with comments and
  an empty `export {}` stripped, has no runtime code. It should be a
  hand-written `.d.ts`, pointed to by the `types` export condition. Narrow on
  purpose: a file with runtime code and a private, single-use inline
  `@typedef` never matches. ("Typedefs in .d.ts, please.",
  `endojs/endo-but-for-bots#58`, `#442`.)
- **`typist-friendly-code-points`.** No added line of a changed `.md` carries
  a code point a typist cannot type: arrows, `…`, curly quotes, `≤` `≥` `≠`,
  `×`, `−`, no-break space (auto-fixable: substitute and stage), and `•`,
  check and ballot marks (fix by reading). Fenced code, and an inline span
  that quotes the glyph alone, are exempt. The em dash is not here: its
  rewrite is judgment ([em-dash-style](../em-dash-style/SKILL.md)). Marker:
  `typist-code-points-exempt`. Rule:
  [typist-friendly-code-points](../typist-friendly-code-points/SKILL.md).
- **`spell-out-identifiers`.** No added identifier in a source file has a
  whole camelCase, PascalCase or snake segment on the abbreviation list:
  `dir`, `cmd`, `temp`, `tmp`, `arg`, `args`, `subdir`, `cfg`, `ctx`, `idx`,
  `msg`, `btn`, `impl`, `mgr`, `num`, `str`, `val`, `resp`, `req`, `addr`,
  `db`, `err`, `ctor`, `prop`, `ok`, `c`, `n`, `id`, `ms`, `p`. Strip strings
  and comments first; match whole segments, so `directory`, `interval`,
  `mkdtempSync` and `tmpdir` pass. A name the pre-change tree declares ambient
  in a `.d.ts` (a host binding the change cannot rename) is exempt; one the
  change declares itself is not. A fresh name that copies an abbreviated
  neighbor still fails (`openTestDb` beside an existing `openTestDb`). A bare
  `args` binding cannot become `arguments` (strict mode forbids it): choose a
  descriptive name. Marker: `spell-out-exempt`. (`endojs/endo-but-for-bots`
  #650, #609, #684, #1329, #1336, #1538, #1588.)
- **`prefer-endo-primitives`.** No added hand-rolled primitive where an Endo
  package exists, unless the file already imports it: Node or WebCrypto
  SHA-256 (`@endo/sha256`), constructing `TextEncoder` or `TextDecoder`
  (`@endo/bytes`), `atob`, `btoa` or Buffer base64 (`@endo/base64`), a
  byte-to-hex `toString(16).padStart(2, ...)` loop (`@endo/hex`),
  `Uint8Array.from(... charCodeAt(...))` (`@endo/ascii`), an `insist*`
  declaration (`@endo/errors`), a `let resolve` / `let reject` deferred
  (`@endo/promise-kit`). Any added bare `Far(...)` fails regardless: use
  `makeExo` with an interface guard from `@endo/exo`. Marker:
  `prefer-endo-primitives-exempt`. (Six misses across
  `endojs/endo-but-for-bots` #671, #755, #824, #836, #877, #882; `Far` and a
  copied promise kit in #1336.)
- **`build-vs-buy`.** No added declaration re-authors a function another
  workspace package exports: a distinctive name exported by exactly one
  package, with a body of the same shape. Fix: import it. Waiver:
  `// build-not-buy: <reason>` above the declaration; marker
  `build-vs-buy-exempt`. Check with the library's export index
  (`reference/library/exports/`, [library-lookup](../library-lookup/SKILL.md))
  and a grep of the workspace's `package.json` `exports`. (kriskowal on
  `endojs/endo-but-for-bots#1336`, a copied `makePromiseKit`.)
- **`no-plain-reexport`.** No newly introduced plain re-export
  (`export … from '…'`: named, renamed, `default as`, `export *`,
  `export * as ns`) without a `@deprecated` JSDoc immediately above it naming
  the original to import instead; importers move to the original. Barrels and
  `index.js` are not exempt; type-only re-exports and `.d.ts` are skipped.
  Only re-exports the change introduces count (after minus before). Marker:
  `reexport-policy-exempt`. (erights on `endojs/endo-but-for-bots#475`.)
- **`no-nul-bytes`.** No changed text file carries a literal NUL. One NUL
  makes git call the file binary, and GitHub then hides its whole diff from
  review. Whole-file check. Fix: a textual escape (`\0`, `\x00`,
  `String.fromCharCode(0)`, `Buffer.from([0])`). Skips known binary
  extensions, vendored and `node_modules/` paths, and files the repository
  marks `-diff` or `binary` in `.gitattributes`.

Rules with no probe are checklist or review rules, not gates: ASCII banners
(the prior garden's `no-comment-banners`), source ASCII, sentence-per-line
markdown, filename stutter, `SECURITY.md` uniformity, test entry points. Do
not report them as mechanically checked.

### Why no broad `@typedef` probe

A scanner can see that `@typedef` occurs; it cannot decide whether the type is
exported, reused, a package data shape, or a legitimate private single-use
type. Failing every occurrence blocks valid code; warning on every one is
noise. So only the unambiguous whole-file shape is gated, and the rest is
review's (`endojs/endo-but-for-bots#388`).

### A lesson without a probe

An `eslint-disable` comment naming a rule that never fires on that line (a
`guard-for-in` disable above a `for...of`) suppresses nothing and misleads the
next reader. When you write a disable comment, check the rule name against
ESLint's actual output first (`endojs/endo-but-for-bots#468`).

## Composition

- Lockfile changes still ship in their own commit, as the project's rule
  says. The gate does not stage a lockfile its fixers touched; split it.
- The gate is the deterministic subset of reviewing your own change. What
  needs judgment (does the body describe behavior, not the diff) is still
  yours, and review's.
- After the gate, run the project's full checks (tests, docs) read-only, as
  [PLOT.md](../../roles/PLOT.md) asks, and report what they said.

## Adding a probe

A probe earns its place on a clear, narrow yes-or-no signal. Anything that
needs the change's intent is review's. When a maintainer repeats an ask that
is mechanical, add it here: the rule, what it checks, the escape marker, and
the review that asked for it.

## Report

Name each stage and its result in `outbox/report.md`, the probe findings you
fixed, and any you could not run. A gate you did not run is not a gate that
passed.

## Not built yet

The gate driver and its probes as code. It wants a `makePrePushGates(powers)`
module in `src/` (the stages in order, the bounds, one probe per rule, each a
pure function over a diff and the post-change files), run by the steward on a
harvested branch before it publishes one, and offered to jobs as a command in
their home.

Adapted from the prior garden's `skills/pre-push-gates`.
