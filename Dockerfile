# The garden's base image. It is deliberately almost empty.
#
# It holds an operating system and the five packages below, and nothing of the
# garden: no script, no role, no runtime, no toolchain, no agent CLI. All of
# that lives on the shed (bind-mounted at run time) or is a capability
# (installed into a volume, pinned by the shed). So the image changes only when
# this file does, and an ordinary upgrade of the garden is a rejuvenation at a
# quiescence, not a rebuild (designs/image.md).
#
# Why each thing is here and cannot be a capability:
#   ca-certificates, curl   fetching the first capability needs them
#   git                     the shed itself arrives and is refreshed by git
#   xz-utils                the first capability (node) is a .tar.xz
#   uidmap                  newuidmap and newgidmap must be root-owned setuid
#                           binaries on the system path; a capability volume
#                           is mounted nosuid
# Everything else the garden uses at boot is already in the base system:
# a shell, coreutils (sha256sum), tar, and useradd.
#
# A new base image is designed, built and validated from inside the running
# box (skills/successor-image), then adopted and promoted on the host.

FROM debian:trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git xz-utils uidmap \
    && rm -rf /var/lib/apt/lists/* \
    && test -u /usr/bin/newuidmap && test -u /usr/bin/newgidmap

# The entrypoint is the shed's, read from the mount, so that it too is
# refreshed without a rebuild. The launcher says where the mount is.
ENV GARDEN_ROOT=/garden
ENTRYPOINT ["/bin/sh", "-c", "exec \"$GARDEN_ROOT/entrypoint.sh\" \"$@\"", "garden-entrypoint"]
CMD ["supervise"]
