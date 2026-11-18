#!/bin/sh
# entrypoint.sh — the box's first process. Runs as root, from the shed's mount.
#
# This is shell because nothing else can run yet (designs/services.md). It
# does only what must precede the garden's own runtime, and holds no garden
# logic:
#   1. accounts: the steward (the uid that owns the mounted root) and the slot
#      accounts slot01..slotNN, each alone in its own group;
#   2. the first capability: node, fetched from the pin in bootstrap/node.pin,
#      checked against its sha256, and unpacked into the capability volume;
#   3. the warden: the Rust helper built by `garden host build`, installed
#      root-owned and setuid so the unprivileged steward can call it, with the
#      policy that confines it to the slots directory and the slot accounts;
#   4. hand over to the supervisor, as the steward.
#
# Usage (the container's command): supervise | sh | <garden args...>
set -eu

ROOT="${GARDEN_ROOT:-/garden}"
CAP="${GARDEN_CAP_ROOT:-/opt/garden/cap}"
SLOTS="${GARDEN_SLOTS:-$ROOT/slots}"
COUNT="${GARDEN_SLOT_COUNT:-4}"
UID_BASE="${GARDEN_SLOT_UID_BASE:-2000}"
say() { printf 'entrypoint: %s\n' "$*" >&2; }
die() { say "ERROR: $*"; exit 1; }

# 1. Accounts.
steward_uid="$(stat -c %u "$ROOT")"
[ "$steward_uid" != 0 ] || die "$ROOT is owned by root; mount the garden's checkout as its owner"
getent passwd steward >/dev/null || useradd --uid "$steward_uid" --user-group --no-create-home --home-dir "$ROOT" --shell /bin/sh steward
i=1
while [ "$i" -le "$COUNT" ]; do
  name="$(printf 'slot%02d' "$i")"
  getent passwd "$name" >/dev/null || useradd --uid "$((UID_BASE + i))" --user-group --no-create-home --home-dir "$SLOTS/$name" --shell /bin/sh "$name"
  i=$((i + 1))
done
mkdir -p "$SLOTS" "$CAP/bin"
chown root:root "$SLOTS" && chmod 0711 "$SLOTS"      # slots can reach their own home, and list nothing
chown -R steward:steward "$CAP"

# 2. The first capability: node.
case "$(uname -m)" in x86_64) arch=amd64 ;; aarch64 | arm64) arch=arm64 ;; *) die "no node pin for $(uname -m)" ;; esac
pin="$(grep "^$arch " "$ROOT/bootstrap/node.pin")" || die "bootstrap/node.pin has no line for $arch"
set -- $pin
version="$2" sha="$3" url="$4"
if [ ! -x "$CAP/node/$version/bin/node" ]; then
  [ "$sha" != unpinned ] || die "node is not pinned for $arch; see bootstrap/node.pin"
  tmp="$(mktemp)"
  curl -fsSL --retry 3 -o "$tmp" "$url" || die "cannot fetch $url"
  echo "$sha  $tmp" | sha256sum -c - >/dev/null || die "node $version does not match its pin"
  rm -rf "${CAP:?}/node/$version.partial"
  mkdir -p "$CAP/node/$version.partial"
  tar -xJf "$tmp" -C "$CAP/node/$version.partial" --strip-components=1 --no-same-owner
  rm -f "$tmp"
  mv "$CAP/node/$version.partial" "$CAP/node/$version"
  chown -R steward:steward "$CAP/node"
  say "installed node $version"
fi
for b in node npm npx; do ln -sfn "$CAP/node/$version/bin/$b" "$CAP/bin/$b"; done
ln -sfn "$ROOT/bin/garden.js" "$CAP/bin/garden"
export PATH="$CAP/bin:$PATH"
garden() { setpriv --reuid steward --regid steward --init-groups env HOME="$ROOT" PATH="$PATH" GARDEN_ROOT="$ROOT" GARDEN_CAP_ROOT="$CAP" GARDEN_SLOTS="$SLOTS" GARDEN_WARDEN=/usr/local/libexec/garden-warden node "$ROOT/bin/garden.js" "$@"; }

# 3. The warden. It is rebuilt at each rejuvenation; install whatever is built.
if [ ! -x "$CAP/warden/warden" ]; then
  say "building the warden (first boot)"
  garden capabilities install rust >/dev/null || die "the rust capability did not install (is it pinned? capabilities/README.md)"
  garden host build >/dev/null || die "the warden did not build; see designs/services.md"
fi
mkdir -p /usr/local/libexec /etc/garden
install -o root -g steward -m 4750 "$CAP/warden/warden" /usr/local/libexec/garden-warden
printf 'slots_root: "%s"\nuid_max: %s\nuid_min: %s\n' "$SLOTS" "$((UID_BASE + COUNT))" "$((UID_BASE + 1))" >/etc/garden/warden.yay
chmod 0644 /etc/garden/warden.yay

# 4. Hand over.
case "${1:-supervise}" in
  supervise) garden slots clearAll >/dev/null; garden supervisor run ;;
  sh) exec setpriv --reuid steward --regid steward --init-groups env HOME="$ROOT" PATH="$PATH" /bin/sh ;;
  *) garden "$@" ;;
esac
