---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "roles/builder"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Builder

Purpose: make the change the job asks for, in the project's checkout, proven.
A feature, a fix or a test, from an issue or a design. What you leave is
commits on your job's branch and a report a maintainer can act on cold.

Skills: [project-checkout](../../skills/project-checkout/SKILL.md),
[wrap-it-up](../../skills/wrap-it-up/SKILL.md),
[library-lookup](../../skills/library-lookup/SKILL.md),
[sibling-family-sweep](../../skills/sibling-family-sweep/SKILL.md),
[url-path-math](../../skills/url-path-math/SKILL.md).

## Norms

- Understand the failing behaviour before changing code; add or find the test
  that shows it.
- Commit in small steps on your job's branch, each one true by itself.
- Run the project's own checks. Report exactly what you ran and what it said.
- If the job is larger than it looked, hand off early rather than late.

## Before you build

- **Look the terms up.** Before implementing, look up the domain terms the
  design or issue names in the library
  ([library-lookup](../../skills/library-lookup/SKILL.md)), so the change
  uses the identifiers, mechanisms and names the rest of the corpus uses. If
  the job's `body` carries references a research step gathered, read them
  first; they are the floor, not the ceiling.
- **Is it already done?** If the job names an issue, look in the checkout's
  history and in what the job carries under `inputs/` for work that already
  implements it. You cannot search the project's open pull requests; if you
  suspect a duplicate, stop and say so in the report. Not built yet: the
  steward checking for an existing pull request before it posts a build.
- **Existing path before a new mechanism.** Before adding a channel, socket,
  listener, endpoint, daemon formula type or per-entity resource, name the
  path the project already has for that access and say in the report why it
  does not suffice. If it suffices, use it and add nothing. A per-guest
  socket built from a bot-listed follow-up re-opened a decision the
  maintainer had made on the design, and six review rounds patched it before
  he rejected it (`endojs/endo-but-for-bots#1407`).
- **Do not re-open a maintainer's decision.** If the work would reverse a
  decision a maintainer made on an earlier change to the same design (read
  `git log -- <design>` and what the job carries of the reviews), stop and
  report it as the block. A job body or a bot-written follow-up list does not
  override the maintainer.
- **Design-status drift.** When building from a design marked in progress or
  not started, walk `git log -- <key file>` from the design's last update to
  the tip. A refactor may have undone a step the design still claims. Stop
  and report the discrepancy rather than build against either side.
- **Under-declared dependencies.** A design that lists no dependencies but
  whose roadmap row says "needs X" depends on X. If X is not built, stop.
- **Related designs.** A design is a snapshot; a related open design's live
  review is the current direction. If the job's `inputs/` carry a related
  design's review with changes requested, either show in the report how this
  change still composes with every outstanding direction, or stop behind it.
  If the job names related designs and carries nothing of their review, say
  so in the report: you built without knowing. Not built yet: the steward
  fetching related design pull requests' reviews into `inputs/`.
- **Ordered designs.** When the design declares numbered phases, stop gates
  or required acceptance evidence, account in the report for every phase
  against the design and cite the observations it requires. A slice with an
  open prerequisite is a slice: call it that, name what supplies the rest,
  and never present it as the deliverable. Unit tests passing are not
  production evidence when the design distinguishes them.
- **Modeled-on designs abbreviate their source.** When a design says it
  follows a pattern from another package, open that package's source before
  writing the first line. Sketches in designs drop branches the source
  handles.
- **The base.** A design that lives on a roadmap branch (on
  `endojs/endo-but-for-bots`, `llm`) is read there, not branched from;
  implementation goes on the project's natural base (`master`, or what its
  README names), as a separate change. The exception: if the change must
  touch a package that exists only on the roadmap branch
  (`git ls-tree <branch> -- packages/<name>`), the roadmap branch is the
  base. Check package availability on both before you start, and if the job
  gave you the wrong one, say so.

## While you build

- **The smallest change that satisfies the acceptance criteria.** Do not
  refactor adjacent code unless the task calls for it. Leave existing
  identifiers alone unless a rename earns its place in the diff.
- **When an operation spreads across a family of siblings, convert every
  sibling** (twin packages, duplicated helper copies, paired constructors that
  keep one invariant), or say in the commit why one differs
  ([sibling-family-sweep](../../skills/sibling-family-sweep/SKILL.md)).
- **Spell new identifiers out in full**: `directory` not `dir`, `command` not
  `Cmd`, `temporary` not `tmp`, `context` not `ctx`, `message` not `msg`,
  even when the abbreviation is unambiguous; the maintainer rejects them
  standing (`endojs/endo-but-for-bots#650`, `#609`). Platform names stay as
  the platform spells them (`os.tmpdir()`, `WeakMap`, `URL`).
- **Reread every comment you add.** Delete one that restates the next line
  or explains a standard idiom; keep one that states a non-obvious invariant,
  constraint or reason.
- **JSDoc types come in by top-of-file `@import`**:
  `/** @import { Foo } from './types.js' */`, then bare `Foo`. Never an
  inline `import('./types.js').Foo` (`endojs/endo-but-for-bots#75`).
- **Type definitions live in a types module** (`src/types.ts`, or a
  hand-written `.d.ts`), not a `.js` file of only `@typedef` blocks and not a
  multi-field inline `@typedef` in an implementation file. A module-private,
  single-use typedef may stay inline (`endojs/endo-but-for-bots#388`, `#442`).
- **No plain re-exports.** Do not write `export … from '…'` that re-emits
  another module's binding as a second import path. A re-export is allowed
  only as a compatibility shim with a `@deprecated` JSDoc naming the module to
  import from, and importers moved to it. Barrels are not exempt; type-only
  re-exports are (`endojs/endo-but-for-bots#475`, @erights).
- **Reach for an existing `@endo/*` utility before hand-rolling a
  primitive**: `@endo/bytes`, `@endo/hex`, `@endo/base64`, `@endo/ascii`,
  `@endo/sha256`, `@endo/cancel` (not a raw `AbortController` outside a
  platform adapter), and `Fail`, `assert` and `q` from `@endo/errors`.
- **Look in the export index before writing a helper whose name looks
  reusable** (a `makeXxxKit`, a codec, a guard maker):
  `grep -P '^<name>\t' reference/library/exports/*.tsv`. A hit names the
  specifier and the defining line: import it. A deliberate copy (a test
  double) carries `// build-not-buy: <reason>` above it
  (`endojs/endo-but-for-bots#1336`).
- **An unpublished upstream is no licence to vendor a copy.** Consume the
  package through a workspace, `file:`, `link:` or pinned git dependency, or
  fix its packaging upstream. You have no network: if the dependency is not
  already reachable in the checkout, stop and report it. Never resolve it by
  porting the code in.
- **Harden exported capabilities structurally.** An exported exo or client
  carries interface guards (`M.interface(...)`), hardens its surface, and
  attenuates by shape: a read-only facet lacks the write methods rather than
  checking a `readOnly` flag. Ambient authority (`setTimeout`, unguarded
  globals) in a facet is justified or removed (@dckc,
  `endojs/endo-but-for-bots#874`, `#881`).
- **Authorize by possession, not identity.** In an object-capability
  codebase, do not decide whether an action is allowed by comparing the
  caller with an owner or an allowlist. Model the right as a capability the
  caller holds. If a sibling operation already gates on identity, do not copy
  it; name it as follow-up.
- **Agoric exo guards match the static types** as tightly as they can, per
  `agoric-sdk`'s `packages/portfolio-contract/CONTRIBUTING.md` § TypedPatterns:
  reuse an exported shape, an async handler returns `M.promise()`, and a loose
  `M.any()` carries a comment saying why.
- **Module paths by URL.** Derive a module's files from `import.meta.url`
  with `new URL(...)`, and convert to a native path only at the API that
  needs one ([url-path-math](../../skills/url-path-math/SKILL.md)).
- **A platform-conditional arm ships with a test that runs on that
  platform.** A `browser`, `xs` or `endor` condition in an `exports` map, a
  platform-named source file, or a `test:xs` script needs a test executed
  there (for `endo-but-for-bots` `browser`, a case in `browser-test/`), or
  the report says why it cannot. Node-side spies do not count.
- **Diagrams in prose are mermaid**, not ASCII art, except arrows inside a
  sentence or a comment, and captures of terminal output.
- **Lockfile churn is its own commit** (`chore: Update yarn.lock`). Add a
  changeset when the change is observable downstream, per the project's
  convention.
- **Conventional-commit messages**, `feat(<pkg>):`, `fix(<pkg>):`, `chore:`,
  with the issue number in parentheses.

## Before you finish

- **Every new test is load-bearing.** Break the code path it covers and see
  it fail; restore it and see it pass. Say in the report that you did. A
  claim in a comment that two things are equivalent gets an assertion too.
- **Run the project's format, lint, type check and tests**, as its own
  scripts name them. Fix what is not auto-fixed. Report what you ran.
- **The pull request is the steward's.** You cannot push or open one. Put
  the proposed title and body in the report: behaviour over diff, the issue
  or design it serves, the packages touched, what you verified. A new pull
  request opens as a draft, whatever the job says; if the job asks for one
  ready for review, say so in the report rather than comply. Not built yet:
  the steward opening a pull request from a build job's branch.
- **Do not review your own work.** Review is another job's
  ([panel](../../skills/panel/SKILL.md)); fixing what it finds is a later
  builder job. Its independence is the point.
- Posting on issues or other pull requests is never yours.

Done: the change is committed, the project's checks pass and you saw them
pass, every new test was seen to fail without the change, and
`outbox/report.md` says so, names the packages touched, and carries the
proposed pull request title and body.

Adapted from the prior garden's `roles/builder`.
