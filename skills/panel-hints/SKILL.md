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
("seats") have something to look at, so a review can grow many specialized
seats without running every one of them on every change.

A seat is one reviewer with one lens: the prior garden's jurors, whose briefs
are under `reference/upstream/garden/roles/jurors/<seat>/AGENT.md`. A panel is
the set of seats run on one pull request. This skill picks the set; what each
seat does, and how their findings add up, is in the seat's brief.

**Bias toward firing.** The maintainer's framing: "err on the side of too many
reviewers. The idea is not to reduce the amount of reviews we are currently
doing, but to enable us to vastly expand the juror profiles and make juror
profiles narrower." Any one signal seats a lens; only the absence of every
signal leaves it out. A seat with nothing to find costs one quiet review; a
missing seat costs a miss.

## When to use

- A reviewer job deciding which lenses to apply to a pull request, or how to
  split a large review into seat-sized jobs it names in its report.
- A maintainer asking which seats *would* fire on a diff.
- After adding a seat: check its trigger fires on a historical diff it should
  have caught.

The recommended set is a strong default. A reviewer may widen it; trimming it
needs a reason in the report.

## Reading the diff

The base is the pull request's base commit (`JOB.yay`, `pull_request`), or
the branch point the job names. In the project checkout:

```sh
git diff --name-only <base>...HEAD                 # changed paths
git diff <base>...HEAD -U0 | grep -E '^\+[^+]'     # added lines
```

Path triggers test the first; content triggers test the second. A single
match anywhere fires the seat; record the first match as the reason, so the
choice can be checked.

## 1. Panel kind

The panel is a **design panel** when there is at least one changed file and
every changed file is a design document: `designs/*.md`, `*/designs/*.md`,
`DESIGN*.md` or `*/DESIGN*.md` (`endojs/endo` keeps per-package designs at
`packages/<name>/DESIGN*.md`). Otherwise it is a **code panel**. The test is
exact: one source file among many design files makes it a code panel.

## 2. Code panel: always-on core (9)

These lenses apply to almost every code change; seat them unconditionally:
`assessor`, `typist`, `stylist`, `packager`, `archivist`, `prover`,
`saboteur`, `integrator`, `corner-prober`.

`corner-prober` joined the core under the err-on-too-many guidance: its
boundary enumeration applies too broadly to risk a trigger missing it.

## 3. Code panel: always-fire (3)

Their signal is not a diff shape:

- `scribe`: knowledge capture; needs the pull request's comment history.
- `releaser`: whether the change is user-facing; a judgment, not a regex.
- `coverage-auditor`: test coverage of new lines; its signal is the coverage
  report. Cheap when coverage is clean, so seating it every time costs little,
  except on a platform arm (below), where a clean Node report proves nothing.

## 4. Code panel: path-triggered seats

| Seat | Fires when |
| --- | --- |
| `curator` | a `package.json` adds or changes `exports`, `main`, `module` or `types`; or any `index.{js,ts,mjs,cjs}` or `*.d.ts` changes |
| `surfacer` | two or more of one package's surface files change (`package.json`, `index.*`, `src/index.*`, `*.d.ts`, `README.md`); or a new `packages/<name>/package.json` is added |
| `migrator` | a `package.json` changes `dependencies`, `peerDependencies` or `devDependencies`, or a version range; or more than one package is touched; or a changeset is present |
| `changeset-auditor` | any `.changeset/*.md` other than `README.md` |
| `benchmarker` | `BENCH.md`, `*.bench.{js,ts,mjs}`, or anything under `benchmark/` or `bench/` |
| `gateway` | at the root: `tsconfig*.json`, `.eslintrc*`, `eslint.config.*`, `package.json`, `yarn.lock`, `package-lock.json`, `.prettierrc*`, `.editorconfig`, `.gitattributes`; or `.github/workflows/*.yml`; or `packages/tsconfig-base*.json` |
| `pruner` | any `*.md` with more than 30 added lines |
| `fast-checker` | anything under `test/`, `tests/`, `__tests__/`, or a `*.test.*` / `*.spec.*` file; or `fast-check` already appears in a `package.json` |
| `breaker` | a changed file contains `M.interface(`, `makeExo`, `defineExoClass`, or a `## Invariants` heading |
| `breaker` (sibling families) | the diff touches a member of a known sibling family (below) |

**Sibling families.** A change to one member of a family usually owes the same
change to the others. The breaker fires on *any* touch, and names a one-sided
touch as the stronger signal; consistency between two touched twins is a
content question the seat judges. Seeded families:

- `packages/hex/` and `packages/base64/`: byte-codec twins.
- `packages/harden/make-hardener.js` and `packages/ses/src/make-hardener.js`:
  duplicated copies.
- `packages/immutable-arraybuffer/src/lib.js`: paired DataView and TypedArray
  emulation constructors keeping the reverse buffer-map invariant.
- `packages/daemon/src/formula-record.js`: per-formula-type inspector branches,
  each of which must carry every reference slot its formula type declares
  (`types.d.ts`, the dependency graph in `manager.js`).

Grounding: the `incomplete-sibling-transformation` review misses
(`endojs/endo-but-for-bots` #475, #1099, #1125). Two of the four had both
twins touched but dispatching differently, which a one-sided-only trigger
would have missed.

## 5. Code panel: content-triggered seats

Each tests the added lines.

| Seat | Fires on |
| --- | --- |
| `warden` | `harden(`, `globalThis`, `__proto__`, `Object.prototype`, `Object.defineProperty`, an import from `ses`, `@endo/init`, `@endo/lockdown`, `@endo/exo`, `@endo/pass-style`, `Proxy` |
| `locksmith` | identity-keyed authority: an equality test on `owner`, `caller`, `principal`, `subject`, `sub`, `iss` or `issuer`; an `isOwner`/`assertOwner`/`requireOwner`/`checkOwner` helper; an owner or caller allowlist; a rejection test titled "non-owner", "not the owner", "only the owner", "does not own", "owner-gated". Or capability flow: `attenuate*`, `endowment(s)`, `Far(`, `passStyleOf`, `makeCapTP`, `Exo`/`ExoClass`, `grant*` |
| `purist` | hand-rolled versions of what Endo already provides: SHA-256 via `createHash('sha256')` or `subtle.digest('SHA-256')`, `new TextEncoder`/`TextDecoder`, `atob`/`btoa`, `.toString(16).padStart`, base64 and hex tables, ASCII codecs, an `insist`, Rust base64; plus `defineProperty` with `enumerable`, `Object.freeze(`, `harden`, `passStyleOf`, `Remotable*`; plus `node:path` imports and `path.resolve`/`path.dirname` (should this be `new URL(...)`?) |
| `spec-keeper` | `Reflect.apply`/`construct`/`ownKeys`/`deleteProperty`, `.call(`, `.apply(`, `Number.MAX_SAFE_INTEGER`/`EPSILON`/`MIN_SAFE_INTEGER`, `Symbol.iterator`/`asyncIterator`/`toPrimitive`, `tc39.es`, `webidl.spec`, `polyfill`, `shim`; or an added `M.any()` or `M.record()` in a `.js`/`.ts` file that is an exo or holds an `M.interface(` guard (is the guard looser than the known static type, and is a compatibility exception documented?) |
| `wire-watcher` | `sha`, `sha256`, `sha512`, `digest`, `JSON.parse(`, `retire`/`retireImports`/`retireExports`, `syscall.`, `vref`, `kref`, a `v<N>-` prefix, `o+<N>`/`o-<N>`, `b1-` |
| `engine-realist` | `WeakMap`, `WeakRef`, `WeakSet`, `FinalizationRegistry`, `crank`, `durable`, `virtual`, `ephemeral`, `vatstore`, `Float16Array`, `async_hooks`, `makeKindHandle`; or the engine half of a platform arm (below) |
| `typist` | an inline `import('…')` type inside a JSDoc tag or brace (already always-on; the trigger is the reason to look) |
| `duality-auditor` | a directional identifier: `encode`/`decode`, `serialize`/`deserialize`, `marshal`/`unmarshal`, `wrap`/`unwrap`, `freeze`/`thaw`, `externalize`/`internalize`, `parse`/`format`, `to`/`from`, each followed by a capital. The seat decides whether a real paired operation exists |
| `procurer` | any added line in a JS or TS source file (not `.d.ts`, `node_modules`, `dist`). Deliberately broad: the seat first looks for a local copy of something an indexed package already exports (build versus buy) and stops if there is none |
| `pruner` | an added code comment of three or more prose lines (directives such as `eslint-`, `@ts-`, `c8`, `istanbul` do not count). A candidate, not a fault: the seat requires deletion when the comment only narrates the adjacent code or explains a standard idiom, and keeps a non-obvious invariant or rationale. Skipped when the Markdown path trigger already seated the pruner |
| `curator` | a variant-affixed surface: a `stream`/`eager`/`lazy`/`buffered`/`incremental`/`chunked`/`batched`-prefixed name, or a definition ending in `Sync`/`Async`/`Stream`/`Eager`/`Lazy`/`Buffered` (a twin of a plainer sibling); or a path-discipline surface: a `*PetNamePath`/`*PathSegment(s)`/`*NamePath`/`*MountPath`/`*PathArgument` definition, `parsePetNamePath`, `.split('/')`, a "path segment must not" guard, a CLI verb whose spec carries a path positional. The seat traces the existing sibling and judges redundancy and whether the new surface fuses concerns the sibling keeps apart |
| `archivist` | an added prose line naming an in-repo entity (an `@endo/*` package, a backticked dotted API or file, an archive format such as `tar.gz` or zip) together with a definite-claim cue ("the canonical", "deliberately", "does not provide", "is the", "typically a", "always", "never", "the only", "cannot", "guarantees", ...). The seat checks the claim against the code |

**Platform arms.** A change adds or alters a non-`node`/`default` condition key
(`browser`, `xs`, `endor`, `hermes`, `moddable`, `react-native`, `deno`,
`bun`, `worker`, `workerd`, `edge-light`, `electron`) in a `package.json`;
adds or changes a platform-named non-test source (`*-browser*`, `*-xs*`,
`*-endor*`, ...); adds a stub `test:<platform>` script (`exit 0`, `true`,
`:`, `echo`); or touches a package whose `test:xs` or `test:endor` is such a
stub. Then:

- `coverage-auditor` must actually look, whatever the coverage report says:
  coverage runs on Node, and a Node-side spy makes a browser arm read as
  covered.
- `engine-realist` fires on the `xs`, `endor`, `hermes`, `moddable` subset,
  and on added test lines asserting native-versus-shim shapes (`emulat*`,
  `shim`, `ArrayBuffer.isView`, `sliceToImmutable`, `transferToImmutable`,
  `[object Immutable…]`).

Grounding: the `cross-platform-test-coverage` misses (#836, #475, #1290). The
prevention side is [coverage-driven-testing](../coverage-driven-testing/SKILL.md).

## 6. Design panel

On a design-only change the panel is the whole seven-seat design panel:
`critic`, `skeptic`, `decomplector`, `ergonomist`, `copyeditor`, `pedant`,
`novice`. Do not apply the code triggers, with one exception: the `archivist`
trigger above, which cross-fires onto a design panel (8 seats) when a design
makes a definite claim about a named in-repo entity. Grounding: #264 called an
archive "typically a `tar.gz`" when it is a zip.

The `decomplector` owns the **ownership map** on a design that spans two or
more architectural layers: is there an `## Ownership map`, and are inner and
outer names fused (an engine's result named for the supervisor's crank)?
Grounding: #1018's `CrankOutcome`.

## 7. Cross-panel seats on a code panel

List these under their own heading so the cross-fire can be checked:

- `pedant` and `copyeditor`: any `*.md` outside `designs/` with more than 30
  added lines.
- `decomplector`: the change touches a design document; or an added line
  introduces a new channel (`servePrivatePath`, `servePath`,
  `serve*Path`/`Socket`/`Endpoint`, `createServer(`, `.listen(`,
  `net.connect`, `socketPath`, a `*SocketPath`/`*EndpointPath`, "Unix
  socket", "named pipe", `SO_PEERCRED`, `WebSocketServer`), a new daemon
  formula type (`formulate<Name>`, a `type: '<kebab>'` literal, an entry in a
  formula-type list), or a per-entity retention resource (`@pins`,
  `*PinName`, `*PinsId`/`*PinsDirectoryId`). On a code panel it asks: does an
  existing path already give this access, and did a maintainer already reject
  this mechanism on an earlier pull request for the same design? Grounding:
  the `design-bespoke-mechanism-over-existing-path` misses (#1226, #1407,
  #1125).

## Signals outside the diff

Some lenses are seated by evidence that is not a diff shape. A reviewer who
has the evidence (in `inputs/`, or in the project checkout) checks it by hand
and says so; one who does not, says it was not checked.

- **A related open design pull request** with an outstanding maintainer
  changes-requested review: the `integrator` reconciles the change with the
  design's current direction (`stale-related-design-direction`).
- **An ordered phase or acceptance-evidence bar** in a governing design: the
  `integrator` checks the pull request's phase and evidence ledger. A missing
  ledger, an open prerequisite, a fail-closed production seam or absent
  production evidence blocks; it is not a style point
  (`phase-slice-substitutes-for-production-evidence`).
- **The pull request description**, against the base branch's
  `.github/PULL_REQUEST_TEMPLATE.md`: a missing or reordered template heading,
  or leftover template guidance, seats the `integrator` and is must-fix. The
  `pruner` takes a body over 300 words, a checklist, a per-file bullet tour,
  or an inline test tally (`pr-description-reviewer-attention`, #1281).
- **The same must-fix twice.** When the two previous review rounds both raised
  must-fix findings on the same file, identifier or design section, the
  `decomplector` asks whether the mechanism is needed before another patch
  round. Prose and presentation seats do not count toward the overlap
  (`vestigial-mechanism-unquestioned`).
- **Banner comments** added in code: the `archivist` takes them
  ([no-comment-banners](../no-comment-banners/SKILL.md)).

## Output

Put the choice in `outbox/report.md` (or the review itself), human-readable
and greppable:

```
Panel-kind: code-panel
Always-on core (9): assessor, typist, stylist, packager, archivist, prover, saboteur, integrator, corner-prober
Always-fire (3): scribe, releaser, coverage-auditor
Path-triggered (3): curator, changeset-auditor, pruner
  curator             packages/foo/package.json (exports field)
  changeset-auditor   .changeset/foo-feature.md
  pruner              packages/foo/README.md (+47 lines)
Content-triggered (2): warden, engine-realist
  warden              packages/foo/src/bar.js:42 (harden()
  engine-realist      packages/foo/src/cache.js:18 (WeakMap)
Cross-panel (0): -
Suppressed: migrator, locksmith, breaker, ...
Recommended total: 17
```

Expect 12 to 22 seats on a first code round, fewer on a re-run, and 7 (or 8)
on a design-only change.

## Adding a seat

When a seat is added, its trigger is added in the same change: a row in §4,
§5 or §7 with the trigger and the review miss that grounds it. A seat whose
signal is not a diff shape goes in §3 instead. Prove the trigger on the real
historical diff it should have caught, and on a control it should not.

## Pitfalls

- **Too broad** fires the seat on every change; the cost is one quiet review.
  Still make it specific enough that the seat would find something.
- **Too narrow** misses. That is the worse error: when in doubt, broaden.
- **Comment history is not in the diff.** Do not try to sense it with a path
  or content trigger; that is why `scribe` is always-fire.
- **Design-only is exact.** No escape for "design plus a typo fix".

## Not built yet

- **The recommender.** A `makePanelHints(powers)` service in
  `src/panelHints.js`, taking the changed paths, the added lines, and the
  pull request body, and returning the panel kind and each seat with its
  reason, so the choice is made in code before any model runs.
- **The fan-out and the out-of-diff sensors.** The steward would run the
  recommender on a fetched pull request, write the evidence above into the
  job's `inputs/`, and post one review job per seat (or one reviewer with the
  list). It belongs beside the pull-request seam in `src/steward.js`
  ([designs/pull-requests.md](../../designs/pull-requests.md)).

Adapted from the prior garden's `skills/panel-hints`, with its probes' triggers
written as prose; the probe scripts stay behind.
