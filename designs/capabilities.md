---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Capabilities: hosts install their own software

The image holds no tool the garden pins ([image.md](image.md)). A tool arrives
as a capability, on the host that needs it, when it first needs it. Code:
`src/capabilities.js`, `src/hostinfo.js`. Manifests:
[capabilities/](../capabilities/README.md).

## The principle

The maintainer: "Hosts should install their own software, in general. I want
thin Docker containers and fast rebuilds, as opposed to downloading Ollama on
hosts that don't use it."

What is being avoided, concretely: the prior garden's `Dockerfile` (lines
243–280) installs Ollama 0.31.2 with its bundled ROCm runtime
(`ollama-linux-amd64-rocm.tar.zst`) into the image for **every** host, runs a
`garden-ollama` unit on every host, and has a worker kind (the hermit) and
scripts (`ollama-serve.sh`, `pull-local-model.sh`, `set-hermits.sh`) for it,
though local inference was set up for one AMD machine
(`context/operations/local-inference-amd.md`). The same image carries three
language toolchains and four agent CLIs. It measures 14.6 GB.

So: **the set of installed capabilities is per host.** No host installs
something because another host uses it, and the image never carries software
for the sake of some host.

## The pieces

- **A manifest**, `capabilities/<name>/capability.yay`, on the shed: name,
  version, sources **per architecture** each with a sha256, optional install
  steps, commands to link, verify steps, and the skill that goes with it.
- **Availability** (`availability`): for this host, each capability is
  `installed`, `available`, or not, with the reason: no pinned artefact for
  this host's architecture; a draft; forbidden by the host's policy; or its
  install failed recently. What is not available here is simply not this
  host's to offer, whatever other hosts can do.
- **The host's record** ([hosts.md](hosts.md)): each host publishes, on its own
  branch, what it has installed and what it could install.
- **Dependence**: a job lists capabilities in `requires`.

## Claiming

1. **A claim takes only a job the host can run now**: every required
   capability installed and verified. That has not changed.
2. **Install comes before the claim.** Before claiming, dispatch asks which
   job this host would take next if it installed what is missing
   (`nextNeeds`: every missing capability must be available here). If there is
   one, the host installs (`provide`), publishes its changed record, and only
   then claims. No lease is running during a download, so a long install
   burns nobody's clock.
3. **A failed install is the host's failure, not the job's.** Nothing was
   claimed, so there is nothing to release: the job stays open, with no
   attempt and no generation counted. The host records the failure and stops
   offering that capability for an hour (`retry_failed_after_seconds`), so it
   does not try again on every tick, and another host may take the job.
4. **Fit is a filter, not a ranking.** Order stays arc rank, level, priority,
   age. One tie-break: among jobs equal in arc, level and priority, one the
   host can run now comes before one it must first install something for.
   It saves a download when there is otherwise nothing to choose between
   them, and cannot starve anything, since it sits below priority.
5. **Unplaceable jobs are shown.** A job whose requirements no live host has
   or could install (`unplaceable`, from the hosts' records) is noted once in
   the journal by the leader and listed in the reply to `@<bot> status`, with
   the reason. It is not removed or held: a host that gains the capability
   will take it.

## What a host does not choose for itself

"In general" has three exceptions, and they are short:

1. **What must exist before the first capability can be fetched**: the base
   image's five packages ([image.md](image.md)).
2. **The base set**, `config/garden.yay` `capabilities.base`: `node` (the
   garden's runtime) and `rust` (to build the warden). Every host has these or
   cannot take part. They are part of every host's own set, are never pruned,
   and the wizard says `CANNOT BOOT` before first start if either has no
   pinned artefact for the machine's architecture.
3. **What a client order pins** ([clients.md](clients.md)): `capabilities` in
   a client host's record are installed there; `forbid_capabilities` are
   never installed there.

## A host's policy

`.garden-state/capabilities/policy.yay`, the host's own:

| Setting | Default | |
| --- | --- | --- |
| `install_on_demand` | true | false: only the base and the standing set |
| `forbid` | none | capabilities this host never installs (the heavy ones) |
| `unused_days` | 30 | drop what has not been used in this long |
| `retry_failed_after_seconds` | 3600 | how long a failed install is not offered |

`wanted.yay` beside it is a standing set the host always keeps. A client
host's owner sets `limits.forbid_capabilities` in the consent file, which wins
over any order.

## Per host, and reproducible where it matters

- A source without a sha256 is refused, and so is a draft. There is no
  "latest".
- **Rejuvenation** (`sync`, then `prune`) refreshes only this host's set: what
  it has installed, its standing set, the base, and anything asked for now. It
  follows a moved pin, repairs what no longer verifies, removes what has left
  the shed, and drops what has not been used within `unused_days` (never the
  base, never the standing set, never something a kept capability requires).
- **Verification is per host**: `sync({verifyOnly})` compares what is
  installed with that host's own set at the shed's pins. Hosts differing from
  each other is normal and is not drift.
- **The one cross-host check**: where two hosts both hold a capability, they
  must hold the same pin of it. The leader checks that at the verify phase of
  a quiescence ([quiescence.md](quiescence.md)).

## Ported from

- The prior garden: `requires:` on jobs and the claim gate
  (`common.sh` `host_capability_probe`, `designs/host-requirements-gating.md`),
  where every token was about a credential or a host and none about software;
  `scripts/aws/install-aws-cli.sh` as the one on-demand install.
- The tower: sha256-pinned downloads in its `Dockerfile` (BuildKit, RootlessKit;
  those two hashes are carried into `capabilities/buildkit`),
  `provision-playwright.sh` and `provision-codex.sh` (pinned installs into
  state, with npm integrity), `check-image-tools.sh` (verify as a smoke test).

## What changed

- Software is declared, not baked: the image's toolchains become manifests.
- Installed sets are per host, and each host says what it has on its own
  branch. The prior garden deliberately published nothing about a host's
  capabilities, because its capabilities were credentials ("host X has AWS").
  Here they are software; the maintainer's requirement that hosts advertise
  settles the earlier question.
- Credential-shaped requirements (`aws`, `typesafe`) are not capabilities
  here. They are keys ([keys.md](keys.md)) plus `host=`.

## Status

Implemented and tested: pinned install from local archives, refusal of a wrong
or missing hash, dependencies, the record and digest, drift detected and
repaired, a moved pin followed, removal (`test/capabilities.test.js`);
availability by architecture and policy; the claim filter with two hosts of
different architectures; an unplaceable job with its reason; the tie-break;
install before the claim, and a failed install leaving the board untouched and
the job uncounted; per-host verification with different sets and the
shared-pin check; pruning by policy; a client order's pins and forbids
(`test/placement.test.js`). The `node` manifest was installed and verified
from the real 22.22.1 archive found in this machine's nvm cache (which is
where its amd64 hash comes from; compare it with nodejs.org's published
checksum before trusting it).

**Not run:** any download. Still without a hash: `node` for arm64; `rust`,
`shellcheck` and `gh` for both architectures; `buildkit` has no arm64 source;
`claude-code` is a draft awaiting a lockfile. Design only: the supervisor
carrying out a client order's `set-capabilities` and `forbid-capabilities`.

## What this principle makes harder

- **First jobs are slow.** The first job on a host that needs a toolchain
  waits for its download; nothing is warm.
- **Placement is a fleet question now.** A job may be runnable by one host
  only; if that host is down, the job waits, visibly, where before any host
  would have done.
- **"Live" is approximate.** A host's record changes only when the host
  changes, so the leader cannot tell a quiet host from a dead one by it.
  Unplaceable is judged against every host that has a record.
- **Disk on each host varies** with what it has been asked to do; pruning
  bounds it by time, not by size.
- **Reproducing a failure** means knowing which host ran the job; the job's
  claim says, and that host's record says what it had.

## Open questions

1. **Who may add a capability.** A manifest names a URL the box will fetch and
   run. Today that is any merged pull request to the shed.
2. **System packages.** A capability cannot `apt install`. A tool that needs
   shared libraries from the distribution (a headless browser, a GPU runtime)
   needs either bundling or a base image change. Local inference, the case
   that prompted the principle, is this kind: it would be a capability with
   its runtime bundled, installed only where a job requires it.
3. **Pruning by size** as well as by time.
4. **A liveness signal for placement** (above), without bringing back
   heartbeat commits.
