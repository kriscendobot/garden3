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
published checksums, and commit the diff. The manifests below marked as not
pinned were written without network access; `test/capabilities.test.js` keeps
this table honest.

| Capability | Pinned | Notes |
| --- | --- | --- |
| `buildkit` | amd64 | hashes carried from the tower's Dockerfile |
| `node` | no | the first capability; also pinned in `bootstrap/node.pin` for the entrypoint |
| `rust` | no | builds the warden at each rejuvenation |
| `shellcheck` | no | used by `scripts/lint.sh` when present |
| `gh` | no | used only by the steward, with the bot's token |
| `claude-code` | draft | needs a committed lockfile before it can be pinned |
