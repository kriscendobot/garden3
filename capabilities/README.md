---
author: "steward"
created: "2026-11-17"
updated: "2026-11-17"
---

# Capabilities

Software the garden brings into the box on demand. The image holds none of it
([designs/image.md](../designs/image.md)); a job that needs a tool says so in
`requires`, and only a host that has installed and verified that capability
claims it ([designs/capabilities.md](../designs/capabilities.md)).

Each directory holds `capability.yay`, the pinned manifest, and any files its
install steps copy in.

| Field | Meaning |
| --- | --- |
| `name`, `version`, `summary` | what it is; `name` matches the directory |
| `status` | `pinned` (default) or `draft`: a draft is never installed |
| `requires` | other capabilities installed first |
| `sources.<arch>[]` | `url`, `sha256` (required), `kind` (`tar` or `file`), `strip`, `into`, `dest` |
| `install[]` | commands run in the staging prefix after unpacking: `run` (argv; `{prefix}` and `{root}` are substituted) and `files` copied from this directory first |
| `bin` | paths under the prefix linked into the capability root's `bin/` |
| `verify[]` | `run` (argv) and optionally `expect`, a pattern its output must match |
| `skill` | the skill that teaches an agent to use it |

A manifest whose source has no `sha256` cannot be installed. Fill hashes with
`garden capabilities pin <name>`, check them against the upstream project's
published checksums, and commit the diff. `test/capabilities.test.js` keeps
this table honest.

| Capability | Pinned | Notes |
| --- | --- | --- |
| `node` | amd64, arm64 | base: every host. Also in `bootstrap/node.pin`. The amd64 archive was downloaded (nvm cache) and matches nodejs.org's `SHASUMS256.txt`; the arm64 hash is taken from that file |
| `rust` | amd64, arm64 | base: every host. rustc, cargo, rustfmt, clippy and the musl standard library, from static.rust-lang.org; the amd64 archives were downloaded and match the publisher's `.sha256` files; the arm64 hashes are taken from those files |
| `gh` | amd64, arm64 | for a host that publishes. 2.105.0; the amd64 archive was downloaded and matches the release's checksums file; the arm64 hash is taken from it |
| `buildkit` | amd64 | hashes carried from the tower's Dockerfile; no arm64 source |
| `shellcheck` | no | used by `scripts/lint.sh` when present |
| `claude-code` | amd64, arm64 | for a host with an operator or workers; `./garden` installs it on first use. 2.1.311, the publisher's native binary; the amd64 binary was downloaded and matches the checksum in the release's `manifest.json`; the arm64 hash is taken from that file |
