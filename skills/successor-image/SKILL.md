---
author: "steward"
created: "2026-11-17"
updated: "2026-11-17"
---

# Successor image

Purpose: design, build and validate the next base image from inside the
running box. Requires the `buildkit` capability. Design:
[image.md](../../designs/image.md).

A new image is needed only when the `Dockerfile` must change. Everything else
is a rejuvenation.

1. Change the `Dockerfile` on a branch of the shed. Keep it to what cannot be
   a capability, and say why for each addition, in the file.
2. Build it in the box, rootless: RootlessKit starts BuildKit with a private
   mount namespace in which only a build context holding the `Dockerfile` is
   visible; `buildctl` writes `<digest12>.docker.tar`, tagged
   `garden-successor:<digest12>`, labeled `garden.build-contract-sha` with
   the sha256 of the `Dockerfile`.
3. Write `<digest12>.yay` beside it: `contract`, `archive_sha256`.
4. Report both paths. A maintainer adopts on the host
   (`./garden adopt <archive>`), which checks the manifest, the tag, the label
   and a smoke test, and promotes it during a quiescence.

This skill is a procedure, not yet a command: the build step has not been run
in this garden. The tower's `scripts/tower/successor/build.sh` is the working
example to adopt from.
