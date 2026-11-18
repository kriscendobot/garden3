---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# The image, and what never needs a new one

The base image is almost empty, and upgrading the garden does not rebuild it.
Files: `Dockerfile`, `entrypoint.sh`, `garden`, `bootstrap/node.pin`.

## What the image contains

`debian:trixie-slim` and five packages. Nothing of the garden is copied in:
the build context is empty (`.dockerignore` is `*`).

| In the image | Why it cannot be a capability |
| --- | --- |
| the base system: a shell, coreutils (`sha256sum`), `tar`, `useradd`, `setpriv` | the entrypoint runs before anything can be fetched |
| `ca-certificates`, `curl` | fetching the first capability needs them |
| `git` | the shed arrives and is refreshed by git |
| `xz-utils` | the first capability is a `.tar.xz` |
| `uidmap` | `newuidmap` and `newgidmap` must be root-owned setuid on the system path, for building a successor image rootless |

Not in the image: any JavaScript runtime, any toolchain, any agent CLI, the
GitHub CLI, an init system. The prior garden's image is 14.6 GB (measured by
`docker image ls` on this host) with systemd, three language toolchains, four
agent CLIs and Ollama baked in.

## Where everything else comes from

- **The shed** is bind-mounted at `/garden`. The image's entrypoint is one
  line that runs `/garden/entrypoint.sh`, so even the entrypoint is the shed's.
- **Capabilities** live in a volume at `/opt/garden/cap`
  ([capabilities.md](capabilities.md)).
- **The first capability, node,** is fetched by the entrypoint from
  `bootstrap/node.pin` and checked against its sha256. This is the answer to
  "a runtime has to come from somewhere": it is the first bootstrap
  capability, not part of the image, so a new node is a pin change and a
  rejuvenation. The price is that a first boot needs the network.
- **The warden** is built on the host from the shed's `rust/` with the `rust`
  capability, for that host's own architecture ([services.md](services.md)).
- There is no init system: the launcher passes `--init`, and one supervisor
  process loops ([hosts.md](hosts.md)).

## What rejuvenation covers, and what needs a new image

Rejuvenation happens at each quiescence ([quiescence.md](quiescence.md)):
the shed is fast-forwarded, capabilities re-resolved to their pins, the warden
rebuilt, scratch cleared. It covers every change to `src/`, `rust/`, roles,
skills, designs, config, the entrypoint, the launcher, and every tool version
the garden pins, node and the Rust toolchain included.

A new base image is needed only when the `Dockerfile` changes: a new Debian
release or security refresh of the base, or a change to those five packages.

## Validating the next image from inside the box

Kept from the tower (`scripts/tower/successor/build.sh`,
`scripts/tower/build-contract.sh`, the launcher's `adopt` and `promote`,
`designs/tower-successor-image.md`):

1. **The build contract** is the sha256 of the files an image is built from,
   stamped on the image as a label. In the tower that is seven files. Here it
   is the `Dockerfile` alone (`garden check` compares the label with the
   checkout and warns when the image is stale).
2. **A job designs the change** to the `Dockerfile` on the shed, as a pull
   request, and builds it inside the box with rootless BuildKit under
   RootlessKit (the `buildkit` capability; no Docker socket, no
   Docker-in-Docker), producing `<digest12>.docker.tar` and a manifest
   `<digest12>.yay` with the contract and the archive's sha256
   (`skills/successor-image`).
3. **The maintainer adopts it** on the host: `./garden adopt <archive>` checks
   the manifest against the archive and the checkout, the tag, the loaded
   image's label, and runs a smoke test with no network.
4. **`./garden promote <digest12>`** tags it as the image, keeping the old one
   as `-previous`. `./garden reset` during a quiescence recreates the box.

## Ported from

The tower's `Dockerfile` (shape only), `entrypoint.sh`, the `tower` launcher
(instance name, contract label, adopt, promote), `.dockerignore` as an
allowlist; the prior garden's launcher for the instance name.

## What changed

No systemd, no baked toolchains, no dotfiles, no key in the environment
([keys.md](keys.md)), and capabilities dropped to the six the entrypoint and
warden need rather than Docker's default set plus `SYS_ADMIN`.

## Status

Written, parsed (`sh -n`) and checked for shape by `test/bootstrap.test.js`.
**Not run:** no image was built and no container started in this pass, so the
`Dockerfile`, `entrypoint.sh`, the launcher including `adopt` and `promote`,
and the in-box BuildKit build are untested. `debian:trixie-slim` is named by
tag, not pinned by digest. The node and rust pins have no sha256 yet, so a
first boot would stop with a clear message until they are filled.

## Open questions

1. **Runtime in the image or as the first capability** (the choice above).
   Putting node in the image would make first boot offline-capable and cost
   roughly 100 MB and a rebuild per node upgrade.
2. **Rootless builds inside a box with dropped capabilities.** The tower's box
   has `SYS_ADMIN` and an unconfined AppArmor profile for this. The launcher
   here drops them; the successor build may need them back, on the host that
   builds only.
3. **Pin the base by digest?** It would make the contract complete and make
   every Debian refresh an explicit change.
4. **The tower's egress firewall** (an internal network and a host proxy) is
   not ported. Should the garden's box have one?
