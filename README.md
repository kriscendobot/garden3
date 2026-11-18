---
author: "steward"
created: "2026-11-17"
updated: "2026-11-17"
---

# The shed

The garden itself: its designs, roles, skills and services. New here? The
front door is the `main` branch, which sets up a host.

| Here | Is |
| --- | --- |
| [designs/](designs/README.md) | what was built, from what, and what is still to decide |
| [roles/](roles/README.md), [skills/](skills/README.md) | what an agent wears and uses |
| `src/`, `bin/garden.js` | the services, in JavaScript: `garden <service> <method> [ value ]` |
| `rust/warden/` | the one privileged helper |
| [capabilities/](capabilities/README.md) | software brought into the box on demand |
| `config/garden.yay`, `keys/registry.yay`, `plots/genome-paths` | settings |
| `Dockerfile`, `entrypoint.sh`, `garden` | the base image, its first process, the launcher |
| [WORKTREES.md](WORKTREES.md) | where every checkout lives |
| [ANCESTRY.md](ANCESTRY.md), `upstream/port-log.yay` | where this came from |

Check everything: `node --test` (needs the warden: `cargo build --offline` in
`rust/`), `cargo test --offline` in `rust/`, and `scripts/lint.sh`.
