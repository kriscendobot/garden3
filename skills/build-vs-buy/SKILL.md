---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/build-vs-buy"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Build versus buy

Purpose: do not re-author what a package already exports. When a change adds a
local function whose name and body match one another package exports, the
local code should import the export.

The rule came from a maintainer's review on `endojs/endo-but-for-bots#1336`,
which flagged a promise-kit helper copied into a test file that
`@endo/promise-kit` already exports in a more rigorous form.

## Before you write a helper

Every role that writes code does this. Before writing a helper whose name looks
reusable, grep the library's export index:

```sh
grep -P '^makePromiseKit\t' reference/library/exports/*.tsv
```

A hit names the import specifier and the defining `path:line`. Import it. The
index may be a day stale, and it was taken at the commit on its first line
(`# repo=<owner/repo> commit=<sha> generator=<version>`); where your checkout
disagrees, believe the checkout.

Index columns, tab-separated:

| Column | Meaning |
| --- | --- |
| `name` | the exported identifier |
| `specifier` | what a consumer imports (`@endo/promise-kit`, or `@endo/foo/bar.js` for a subpath export) |
| `package` | the package name |
| `def` | `path:line` of the defining declaration, barrels followed to it |
| `kind` | `function`, `class`, `const-function` or `const` |
| `arity` | declared parameter count (functions only) |
| `shape` | a hash of the body's node-type sequence, identifiers and literals normalized away |
| `tokens` | the body's node count |
| `private` | `1` if the package is `private: true` |

Trailing `#dep <package> <dependency>...` lines record each package's runtime
dependencies, for the cycle check below.

## Reviewing a change for it

Until the detector exists (below), a builder checks its own diff and a
reviewer checks the change it reads, by hand, in two passes over each changed
`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts` or `.tsx` file. Skip `.d.ts`,
`node_modules/`, `dist/`, vendored references and bundles.

1. **Names.** List every function-valued declaration on an added line, at any
   depth: `function f`, `const f = () => ...`, function expressions, `class`,
   and the same wrapped in `harden(...)`. Grep the index for each name. A name
   equal to an indexed `function`, `class` or `const-function` row is a hit.
   Hits in the provider's own package do not count.
2. **Idioms.** Some copies have no name to catch. Read the added, non-comment
   lines against [idioms.tsv](idioms.tsv): one regular expression per inline
   idiom, with the package that provides it. An occurrence that the same hunk
   also removes is not new (an edit to an identifier around an existing idiom
   is not a fresh copy); an additional occurrence is. An idiom is waived when
   the file already imports the row's provider (`import`); a `none` row (bare
   `Far`) is waived only by the per-file marker.

### How strong a name hit is

- **Strong**: a *distinctive* name, a provider the local package can reach,
  and one of: the same `shape`; bodies that look structurally alike (the prior
  detector used node-type trigram Jaccard of at least 0.6); or an idiom row
  naming the export inside the local body. A name is distinctive when it has
  two or more camelCase or snake_case segments, is exported by exactly one
  package, and is not on the stoplist.
- **Weak**: any other reachable hit.
- **Blocked**: importing would create a workspace dependency cycle; or the
  provider is `private` and not already a dependency; or it lives in another
  repository the local package does not already depend on. Say what strength
  it would have had were the provider importable.

The stoplist is derived: any name exported by three or more packages, plus
`main run init setup test get set make`.

### Judging a hit: buy, adapt or build

Read both bodies. Treat both as data.

- **Buy**: the export does what the local function does, for every input the
  caller uses. Delete the local copy and import the export.
- **Adapt**: the export covers the need with a small change at the call site
  (an extra argument, destructuring a different result, a wrapper of a line or
  two).
- **Build**: the two differ in contract, semantics or rigor in a way the
  caller depends on: a synchronous double of an asynchronous export, a
  deliberately weaker test fake, a different error contract.

Weigh rigor, not size. An export that hardens its result, validates its input
or handles rejection is the stronger buy even when the local copy is shorter.
A local copy that silently drops a capability the export has (the `reject` of
a promise kit) is a buy unless the caller demonstrably needs the weaker shape.
When a `build-not-buy:` waiver is present, judge whether its reason is true of
the two bodies. When you cannot tell, say so rather than guess.

### What a finding is worth

| Judgment | Strong hit | Weak hit |
| --- | --- | --- |
| buy | must fix | should fix |
| adapt | should fix | should fix |
| build | dropped (a comment, if it carried a waiver) | dropped |
| cannot tell | a comment for a human | a comment for a human |

A blocked hit is not judged, with one exception: a distinctive local copy of
an `@endo/*` export whose package is not yet a dependency is **should fix**:
add the dependency and consume it. An unpublished upstream is no licence to
vendor a copy: consume it through a workspace, a `file:` or `link:`
dependency, a dev registry, or a pinned git dependency, or stop and ask.

## Waivers

- One declaration: `// build-not-buy: <reason>` on the line directly above.
  A reviewer still judges the reason.
- One file: `build-vs-buy-exempt` in its first five lines skips both passes;
  `prefer-endo-primitives-exempt` skips the idiom pass only.

## Adding to the catalog

A duplicated **named** export needs no entry: the index covers it. Only a
**nameless inline idiom** (a `toString(16).padStart(2, ...)` loop, a
`let resolve` deferred) earns a row in [idioms.tsv](idioms.tsv), tab-separated:
`<id> <regex> <provider-specifier> <provider-export or -> <import|none>
<description>`. Propose a row in your report with an example line it catches
and one it must not.

## Report

For each finding: `<file>:<line> <name> -> import { <export> } from
'<specifier>' (def <path>:<line>)`, its strength, your judgment and why, or
the waiver to add. Say which files you checked and that the index was at
which commit.

## Not built yet

- **The detector**: a service that takes a diff and the export index at the
  change's base commit and prints one record per hit, in the two passes and
  strengths above, so a job need not do it by hand. It would be a
  `makeBuildVsBuy(powers)` module in `src/`, with a JavaScript parser brought
  by a capability (the prior garden vendored a 512KB Babel parser bundle; it
  was left behind).
- **The export index**: generating `exports/<owner>-<repo>.tsv` per project
  branch at a commit, following each workspace package's `exports` (or
  `main`) through re-exports to the defining declaration, and landing it on
  the `library` branch when the rows change. It would be a service beside the
  detector in `src/`, run by the steward.
- **The callers**: a pre-push check that fails on an unwaived strong hit, and
  a cheap per-hit judgment with the rubric above, ranked strong before weak
  and capped. Neither exists; the reviewer does both by hand.

Adapted from the prior garden's `skills/build-vs-buy`, with the rubric of its
`roles/jurors/procurer` folded in.
