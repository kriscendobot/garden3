---
author: "designer"
created: "2026-11-17"
updated: "2026-11-17"
---

# The image, and what never needs a new one

The base image is almost empty, and upgrading the garden does not rebuild it.
Files: `Dockerfile`, `entrypoint.sh`, `garden`, `bootstrap/node.pin`.

## What the image contains

`debian:trixie-slim` and six packages. Nothing of the garden is copied in:
the build context is empty (`.dockerignore` is `*`).

| In the image | Why it cannot be a capability |
| --- | --- |
| the base system: a shell, coreutils (`sha256sum`), `tar`, `useradd`, `setpriv` | the entrypoint runs before anything can be fetched |
| `ca-certificates`, `curl` | fetching the first capability needs them |
| `git` | the shed arrives and is refreshed by git |
| `xz-utils` | the first capability is a `.tar.xz` |
| `uidmap` | `newuidmap` and `newgidmap` must be root-owned setuid on the system path, for building a successor image rootless |
| `openssh-client` | every host pushes to the repository (a claim is a push) and the bot's login generates an ssh key; OpenSSH publishes source, not binaries, so there is nothing to pin as a capability |

Not in the image: any JavaScript runtime, any toolchain, any agent CLI, the
GitHub CLI, an init system. The prior garden's image is 14.6 GB (measured by
`docker image ls` on this host) with systemd, three language toolchains, four
agent CLIs and Ollama with its ROCm runtime baked in for every host.

**Size and rebuild cost, measured** on the first host: the image is 275 MB
(`docker image ls`), against 14.6 GB. A rebuild is one `apt-get` layer over
the base and took 38 s; it downloads nothing that is a capability, because
the `Dockerfile` names none. What a host installs is in its capability
volume: here node 205 MB, the Rust toolchain 630 MB, gh 41 MB. First boot
(fetch node, fetch and unpack Rust, build the warden) is about 40 s of work;
a restart is ready in about 5 s. Software for a host arrives on that host, when it
needs it ([capabilities.md](capabilities.md)).

## Where everything else comes from

- **The shed** is bind-mounted at its own path (with the bare repository
  beside it, in the wizard's layout). The image's entrypoint is one line that
  runs the shed's `entrypoint.sh`, so even the entrypoint is the shed's.
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

**Run for real on one amd64 host.** The image was built, the box started, and
first boot completed: accounts, node from its pin, the Rust toolchain as a
capability, the warden built with no C compiler and installed setuid with its
policy, the slots cleared through it, and the supervisor idling quietly with
no remote. A job was run in a slot as its own account under a deadline, and
could read neither the state directory nor the slots directory. Bugs that only
running it found are listed in [services.md](services.md).

Not run: `adopt` and `promote`, the in-box BuildKit build, an arm64 host.
`debian:trixie-slim` is named by tag, not pinned by digest. On this host
Docker's default resolver does not answer inside containers, so the launcher
reads host-local settings from `.garden-launcher` (a build network and a
resolver for the box).

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
