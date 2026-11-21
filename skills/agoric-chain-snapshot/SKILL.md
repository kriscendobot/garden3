---
adopted_from:
  commit: "0dda301cbeb484d69447f7c60214788924464f8c"
  path: "skills/agoric-chain-snapshot"
  source: "garden"
author: "steward"
created: "2026-11-21"
updated: "2026-11-21"
---

# Agoric chain snapshot

Purpose: reproduce a contract-upgrade or vat-creation failure on real Agoric
mainnet state, offline, and show a fix clearing it, by feeding a captured
swing-store to `inquisitor` (`packages/cosmic-swingset/tools/inquisitor.mjs`
in `Agoric/agoric-sdk`).

A synthetic reproduction on a stock worker says the fix can work. A run on a
captured swing-store, through the same on-chain XS worker path, says it works
on the chain's own state. This skill is that cross-check.

**Scope.** Read-only analysis and local runs of the open-source worker and
public bundles. Nothing here comments on, reviews or cross-references
upstream `Agoric/agoric-sdk`; findings go in your report.

## 1. The swing-store

What you need is the `data/agoric` subtree of a node's home: its
`swingstore.sqlite`. A public snapshot (Polkachu publishes
`agoric_<height>.tar.lz4`) holds it, among tens of gigabytes of Tendermint
databases.

- **Extract only `data/agoric`.** The rest can stream past unwritten. This
  saves disk, not bandwidth: a single compressed tar cannot seek, so the
  whole archive still crosses the wire.
- **Check it.** `PRAGMA integrity_check` must say `ok`. Read `host.height`
  from the `kvStore` table: that is the block the state is at.
- **Vacuum a standalone copy** (`VACUUM INTO`), so the file carries no
  write-ahead log and can be opened read-only anywhere.
- **Keep provenance beside it**, as a record: the source URL, the snapshot
  height, `host.height`, the file's sha256 and size, and when it was
  acquired. Two captures are told apart by their sha256; a later reader
  decides from the date whether to refresh.
- A chain-tip snapshot is enough for this: inquisitor installs the bundle
  and runs the evaluation against whatever state it is handed. The historical
  upgrade height is not needed.

Not built yet: a job has no network, so it cannot fetch a snapshot. A
host-side cache of snapshots, lent read-only into a job's `inputs/` by the
steward, is what this wants. If the job has no swing-store, stop here and say
so.

## 2. The host

In the `Agoric/agoric-sdk` checkout (`garden project add`):

1. Install with the vendored Yarn, immutable (`node .yarn/releases/yarn-*.cjs
   install --immutable`). Without the network this works only if the
   checkout's dependencies are already present; if they are not, report it.
   A `better-sqlite3` native-build warning and a couple of standing
   `tsc` errors in generated cosmic-proto code are not regressions.
2. **Build the worker bundles `createVat` needs.** The install does not
   generate them, and `createVat` fails `ENOENT … .sha256` without them: run
   `node scripts/build-bundle.js` in `packages/xsnap-lockdown` and in
   `packages/swingset-xsnap-supervisor`.

## 3. The bundles: control and patched

- **Control** is the failing bundle as it was (or would be) installed. The
  bundle is network- and instance-agnostic: it only needs to be installed
  first. If it is not on the captured chain, it may be a release asset of the
  project; it has to reach the job as an input.
- **Patched** is the same bundle with only the fix applied. Change the one
  module, update that module's sha512 and its `compartment-map.json` entry,
  and re-zip with `@endo/zip`. The bundle's id is
  `b1-<sha512 of its zip's base64>`.
- Make the delta countable, and say it in the report: for a value-stack
  overflow from a wide `.flatMap(`, "one `.flatMap(` removed, 10 to 9, in the
  flattened bundle".
- **Use the contract bundle, not the vat's source.** A ZCF vat's own
  `source.bundleID` is the ZCF bundle; the contract it runs is a different
  bundle (named in the vat's name). An upgrade takes the contract bundle.
  Passing the ZCF bundle is the classic mistake.

## 4. Run it

Run inquisitor non-interactively, with the driver on stdin:

```sh
INQUISITOR_NO_REPL=1 node packages/cosmic-swingset/tools/inquisitor.mjs \
  <swingstore.sqlite> < <driver>.mjs
```

The driver runs in inquisitor's global context; its endowments (`swingStore`,
`runCoreEval`, `EV`, `E`, `controller`, `kslot`, `runNextBlock`,
`pushQueueRecord`, ...) are globals. Write the driver in `scratch/`, and
commit it with the fix if it should outlive the job.

**Install first.** Seed the bundle into the snapshot's bundle store with
`swingStore.kernelStorage.bundleStore.addBundle(bundleID, bundle)`. That is
the offline equivalent of publishing it with `MsgInstallBundle`; without it
nothing can resolve the id.

Then pick a vector, from least to most faithful:

1. **`createVat`.** A core evaluation gets a bundle cap from `vatAdminSvc`
   and creates a fresh vat from it, so a real on-chain worker imports the
   bundle (`compartmentImportNow`, then `execute`). A raw contract bundle has
   no `buildRootObject`, so the patched run "fails" at
   `vat source bundle lacks buildRootObject()`: that is success, it got past
   module evaluation. The control fails with
   `Vat Creation Error: Stack meter exceeded` (the metered worker's form of
   the chain's `exited: stack overflow`, exit 12). This is the decisive A/B
   when the others are blocked.
2. **The contract-control object, directly.** Where a contract's upgrade
   authority was delegated to a `ContractControl` (from
   `@agoric/deploy-script-support`), that object is in the snapshot, owned by
   bootstrap. Queue `upgrade({ bundleId, privateArgsOverrides: {} })` to it;
   it calls the live instance's `adminFacet.upgradeContract`, which re-imports
   the bundle in a fresh worker.
3. **The wallet bridge action.** The on-chain trigger is a `WALLET_ACTION`
   from the control account: `invokeEntry` with `targetName` the stored
   control's name and `method: 'upgrade'`. Its arguments are pure data, so it
   can be hand-marshalled (smallcaps, no slots) and injected with
   `pushQueueRecord` and `runNextBlock`. In a read-only overlay the inbound
   wallet bridge may not deliver it; if no wallet invocation record appears,
   fall back to vector 2 and say so.

**Signals.** Success: the upgrade result promise does not reject, and the
new incarnation's transcript span reaches its full length (a clean import).
Failure: it rejects with `vat-upgrade failure`, the span is truncated, and the
slog carries the delivery's cause (`Stack meter exceeded`). A new
incarnation span opens in every case: do not read "span opened" as success.

## Driver lessons

- In a core evaluation string, use the global `E`, not `powers.E`, and never
  write the literal token `import (`: SES rejects it.
- **Do not await a send before cranking.** In scripted mode a send's promise
  settles only when the controller runs, so awaiting first deadlocks. Queue
  it (`controller.queueToVatObject(target, method, args, 'ignore')` for a
  kpid), start `controller.run()` without awaiting, and poll the incarnation
  and `controller.kpStatus(kpid)` on a timer. The overlay cannot service all
  the traffic an upgrade causes, so the block may never quiesce.
- Call `controller.kpResolution(kpid)` **once**; a second call underflows the
  refcount. `kunser` of it gives an `Error`: log `message` and `stack`, never
  `JSON.stringify` it (that prints `{}`).
- Raise `INQUISITOR_MAX_VATS_ONLINE` (50 worked) when an upgrade touches many
  vats.
- **Keep the slog.** inquisitor's `shutdown()` removes its test database.
  Copy the newest `flight-recorder.bin` out of it first, then count the
  failure lines in the copy.
- **A read-only overlay can miss a write path.** The overlay's
  `transcriptStore` made `initTranscript` a no-op, so a freshly created vat
  hit `no current transcript for "vNN"`. Seeding an initial pending span
  (`startPos: 0, endPos: 0, incarnation: 0`) on `initTranscript` let
  `createVat` run end to end. Expect to fix the tool before the repro runs,
  and carry the fix on the job's branch.

## Lessons from the first use

- **A promise-space kit may drive a dead instance.** The `<name>Kit` in
  bootstrap's promise space belongs to the instance that core evaluation
  created. If the contract was later redeployed, its `adminFacet` drives the
  original, now-terminated vat, and an upgrade through it fails before any
  worker starts (`rejecting attempt to perform "upgrade"() on non-running
  vat`). The live instance's authority is wherever it was delegated: here,
  a `ContractControl` built from the live `UpgradeKit` (`getUpgradeKit`) and
  stored in a smart wallet.
- **Find the live instance from the state.** Read the vat list, which vats
  are terminated, each vat's name and source bundle, and the current
  incarnation (`transcriptStore.getCurrentSpanBounds(vatID).incarnation`).
  Confirm the target before driving it.
- **The examples are in the tree.** `a3p-integration/` (the agoric-3
  proposals that validate upgrades against mainnet) shows the whole sequence:
  publish the bundle (`installBundle` in `packages/client-utils`, inline or
  chunked), deliver contract control by core evaluation, then redeem it and
  call `upgrade` through the wallet. Map each on-chain step onto its offline
  equivalent above.
- **Separate the engine from the application.** When the fix could be in the
  engine instead, build the stock release `xst` from upstream
  Moddable-OpenSource/moddable tags on either side of the engine commit, and
  run a minimal test case on each (one for each code path the commit does or
  does not touch). Stock `xst` has a much larger value stack (256K slots)
  than the chain's worker (4,096), so scale the input; the leak is the same.
- **A taller value stack does not break old snapshots.** XS reads a snapshot
  gated only on its major and minor version, the slot size and a signature;
  `stackCount` is stored in the snapshot's own creation record. A taller
  binary only enlarges fresh machines (an upgrade starts a fresh worker), but
  it writes different snapshot bytes, so validators must change over
  together.
- **A narrow fix leaves the baseline.** Removing a wide `.flatMap(` freed
  about a thousand slots but left the module's large flat-functor baseline;
  a later widening could trip it again. Say so in the report.

Adapted from the prior garden's `skills/agoric-chain-snapshot`; its repro
drivers, build scripts and incident data stay behind.
