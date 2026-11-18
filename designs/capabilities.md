---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# Capabilities: skills bring software into the box

The image holds no tool the garden pins ([image.md](image.md)). A tool arrives
as a capability, is advertised by the host that has it, and is something a job
can expressly depend on. Code: `src/capabilities.js`. Manifests:
[capabilities/](../capabilities/README.md).

## The pieces

- **A manifest**, `capabilities/<name>/capability.yay`, on the shed: name,
  version, the sources per architecture each with a **sha256**, optional
  install steps, the commands to link, and verify steps. It may name the
  **skill** that teaches an agent to use the tool; adopting such a skill and
  adding its manifest are one change.
- **The install**: fetch, check the hash, unpack into a staging prefix, run
  any install steps, rename into `<cap root>/<name>/<version>/`, link its
  commands into `<cap root>/bin/`, verify. Older versions are removed after a
  verified install. Steps and verifications are argument vectors, never shell
  strings.
- **The installed record**, per host, `.garden-state/capabilities/installed.yay`:
  for each capability its version, the hash of the manifest it was installed
  from, and whether it verifies; and one digest over all verified ones.
- **Dependence**: a job lists capabilities in `requires`. A claim skips a job
  unless the host has every one installed **and verified**
  ([board.md](board.md)). `host=<name>` in the same list pins a job to a host.
- **Demand**: `capabilities.demand(board)` lists what open jobs require that
  this host lacks, as installable, unpinned or unknown. The supervisor reports
  it; whether a host installs on demand is the host's policy.

## Reproducible across hosts

- A source without a sha256 is refused, and so is a manifest marked `draft`.
  There is no "latest". (The prior garden's and the tower's images install
  Claude Code at a version *floor*; here that capability stays a draft until
  it has a lockfile.)
- `sync` brings a host to the shed's pins: it follows a moved pin, repairs an
  install that no longer verifies, and removes a capability that has left the
  shed. It runs in the rejuvenate phase of each quiescence.
- `sync({verifyOnly})` repairs nothing and reports drift: a capability
  installed from another manifest than the shed's, one that does not verify,
  one that is no longer on the shed. It runs in the verify phase, and each
  host reports its pins (`<version>@<manifest hash>`). The leader resumes only
  when no two hosts hold different pins of the same capability
  ([quiescence.md](quiescence.md)). Hosts need not hold the same set.

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
- A host's capabilities are a record it can be asked for, where the prior
  garden deliberately published nothing. See the first open question.
- Credential-shaped requirements (`aws`, `typesafe`) are not capabilities
  here. They are keys ([keys.md](keys.md)) plus `host=`.

## Status

Implemented and tested with local archives: pinned install, refusal of a wrong
or missing hash, dependencies, the record and digest, drift detected and
repaired, a moved pin followed, removal, demand (`test/capabilities.test.js`).
The `node` manifest was installed and verified from the real 22.22.1 archive
found in this machine's nvm cache (which is where its amd64 hash comes from;
compare it with nodejs.org's published checksum before trusting it).
**Not run:** any download. Still without a hash: `node` for arm64; `rust`,
`shellcheck` and `gh` for both architectures; `buildkit` has no arm64 source;
`claude-code` is a draft awaiting a lockfile. They cannot be installed until
`garden capabilities pin <name>` fills them and the diff is reviewed.

## Open questions

1. **Publishing a host's capabilities.** The verify phase puts each host's
   pins in the quiescence document on the public board. The prior garden kept
   capabilities host-local because "host X has AWS" is targeting metadata.
   Software pins seem harmless; say if they should stay private.
2. **Who may add a capability.** A manifest names a URL the box will fetch and
   run. Today that is any merged pull request to the shed.
3. **Install on demand, or only at quiescence?** Installing between jobs gets
   work moving sooner; installing only at quiescence keeps hosts identical
   between restarts.
4. **System packages.** A capability cannot `apt install`. A tool that needs
   shared libraries from the distribution (a headless browser) needs either
   bundling or a base image change.
